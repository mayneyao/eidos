import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  openEidosFile,
  mergeEidosSystemMetadataFiles,
} from "@eidos.space/eidos-file/node-sqlite"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { openEidosLiteFileRuntime } from "../../runtime/eidos-file-runtime"
import { PeerService } from "./peer-service"

// A physical Android host drives the real pairing/download/sync UI. Source is
// copied; Windows and cloud are isolated local Graft peers, macOS is Lite's gateway.
it.skipIf(!process.env.EIDOS_PEER_CLOUD_WORKFLOW)(
  "receives a Windows cloud edit without Android writes",
  async () => {
    const output = process.env.EIDOS_PEER_CLOUD_WORKFLOW!
    const source = process.env.EIDOS_PEER_WORKFLOW_SOURCE!
    if (!source) throw new Error("EIDOS_PEER_WORKFLOW_SOURCE is required")
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-cloud-peer-workflow-")
    )
    const windows = path.join(directory, "windows")
    const mac = path.join(directory, "my-eidos-space")
    const cloud = path.join(directory, "cloud")
    await fs.cp(source, windows, { recursive: true })
    await fs.mkdir(cloud)
    await fs.mkdir(mac)
    const windowsGraft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const macGraft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    await windowsGraft.open(windows)
    await windowsGraft.initialize(windows)
    await windowsGraft.stageAll(windows)
    await windowsGraft.commit(windows, "Workflow baseline")
    await windowsGraft.addRemote(windows, "origin", `fs://${cloud}`)
    await windowsGraft.push(windows)
    await macGraft.clone(mac, `fs://${cloud}`)
    const session = await SpaceSession.create(
      mac,
      path.join(directory, "state"),
      { graft: macGraft }
    )
    vi.spyOn(session.runtimePool, "validatePaths").mockImplementation(
      async (paths) => {
        for (const relative of paths) {
          const runtime = await openEidosLiteFileRuntime(
            path.join(mac, relative),
            { readOnly: true }
          )
          await runtime.close()
        }
      }
    )
    vi.spyOn(session.runtimePool, "inspectMergeTables").mockImplementation(
      async (paths) => {
        const names = new Set<string>()
        for (const relative of paths) {
          const runtime = await openEidosLiteFileRuntime(
            path.join(mac, relative),
            { readOnly: true }
          )
          try {
            for (const { table } of runtime.initialSnapshot.tables)
              names.add(table.physicalName ?? table.rawTableName ?? table.name)
          } finally {
            await runtime.close()
          }
        }
        return [...names]
      }
    )
    vi.spyOn(session.runtimePool, "mergeSystemMetadata").mockImplementation(
      async (options) => mergeEidosSystemMetadataFiles(options)
    )
    const peer = new PeerService(session, path.join(directory, "state"))
    let finished = false
    let failure: string | undefined
    let phase = "initial-download"
    const evidence: unknown[] = []
    const metadata = async () => {
      const status = await macGraft.status(mac)
      const runtime = openEidosFile(path.join(mac, "eidos-project.eidos"), {
        readonly: true,
      })
      try {
        return {
          head: status.currentHead,
          revision: String(runtime.info().revision),
        }
      } finally {
        runtime.close()
      }
    }
    let timer: ReturnType<typeof setInterval> | undefined
    try {
      const invitation = await peer.start()
      const handle = peer["handle"].bind(peer)
      peer["tls"]!.removeAllListeners("request")
      peer["tls"]!.on("request", (request, response) => {
        const start = performance.now()
        response.once("finish", () => {
          void fs.appendFile(
            output + ".http.jsonl",
            JSON.stringify({
              phase,
              method: request.method,
              route: request.url,
              status: response.statusCode,
              ms: performance.now() - start,
              bytes: response.getHeader("content-length") ?? null,
              requestBytes: request.headers["content-length"] ?? null,
            }) + "\n"
          )
        })
        if (request.url !== "/fixture") {
          void handle(request, response).catch((error: unknown) => {
            if (!response.headersSent) response.writeHead(500)
            response.end(JSON.stringify({ error: String(error) }))
          })
          return
        }
        void (async () => {
          let body = ""
          for await (const chunk of request) body += chunk
          const command = JSON.parse(body || "{}") as {
            advanceWindows?: boolean
            finished?: boolean
            error?: string
            phase?: string
          }
          if (command.phase) phase = command.phase
          if (command.advanceWindows) {
            const runtime = openEidosFile(
              path.join(windows, "eidos-project.eidos")
            )
            try {
              const table = runtime
                .listTables()
                .find((table) => table.name === "dev")!
              const label = runtime
                .listFields(table.id)
                .find((field) => field.name === "desc")!
              runtime.mutateRows({
                tableId: table.id,
                insert: [
                  {
                    fields: { [label.id!]: "Emulator Windows cloud workflow" },
                  },
                ],
              })
            } finally {
              runtime.close()
            }
            await windowsGraft.stageAll(windows)
            await windowsGraft.commit(windows, "Windows added one record")
            await windowsGraft.push(windows)
            await macGraft.fetch(mac)
            await macGraft.pull(mac)
          }
          const state = await metadata()
          evidence.push({ phase, command, state })
          await fs.writeFile(
            output + ".evidence.json",
            JSON.stringify({ directory, evidence }, null, 2)
          )
          response.writeHead(200, { "Content-Type": "application/json" })
          response.end(JSON.stringify(state))
          failure ||= command.error
          finished ||= command.finished === true
        })().catch((error: unknown) => {
          response.writeHead(500)
          response.end(JSON.stringify({ error: String(error) }))
        })
      })
      await fs.writeFile(
        output,
        JSON.stringify({ invitation: invitation.invitation, directory }),
        { mode: 0o600 }
      )
      timer = setInterval(() => {
        if (peer.status().pending) void peer.approve(true)
      }, 100)
      const deadline = Date.now() + 600_000
      while (!finished && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 200))
      expect(finished).toBe(true)
      expect(failure, failure).toBeUndefined()
    } finally {
      if (timer) clearInterval(timer)
      await peer.close()
      await session.close()
      await windowsGraft.close()
      await fs.writeFile(
        output + ".result.json",
        JSON.stringify({ directory, finished, failure })
      )
    }
  },
  630_000
)
