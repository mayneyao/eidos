import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { PeerService } from "./peer-service"
import { PeerObjectStore } from "./object-store"
import {
  openEidosFile,
  mergeEidosSystemMetadataFiles,
} from "@eidos.space/eidos-file/node-sqlite"
import { openEidosLiteFileRuntime } from "../../runtime/eidos-file-runtime"

// Opt-in reproduction with a complete private Space copy, including its history.
// The source is never opened as a SpaceSession or written by Graft.
it.skipIf(!process.env.EIDOS_PEER_REAL_SPACE)(
  "downloads a complete existing Space on a native mobile host",
  async () => {
    const source = process.env.EIDOS_PEER_REAL_SPACE!
    const output = process.env.EIDOS_PEER_ANDROID_FIXTURE!
    if (!output) throw new Error("EIDOS_PEER_ANDROID_FIXTURE is required")
    const directory =
      process.env.EIDOS_PEER_REUSE_DIRECTORY ??
      (await fs.mkdtemp(path.join(os.tmpdir(), "eidos-real-space-")))
    const root = path.join(directory, "my-eidos-space")
    if (!process.env.EIDOS_PEER_REUSE_DIRECTORY)
      await fs.cp(source, root, { recursive: true })
    const transport = new GraftInProcessTransport()
    const command = transport.command.bind(transport)
    transport.command = async (...args) => {
      const started = performance.now()
      try {
        return await command(...args)
      } finally {
        await fs.appendFile(
          output + ".graft.jsonl",
          JSON.stringify({
            command: args[0],
            ms: performance.now() - started,
          }) + "\n"
        )
      }
    }
    if (process.env.EIDOS_PEER_BASELINE_STORAGE)
      Object.defineProperty(PeerObjectStore.prototype, "isStorageKey", {
        value: (key: string) =>
          key.startsWith("segments/") || key.startsWith("logs/"),
      })
    const session = await SpaceSession.create(
      root,
      path.join(directory, "state"),
      {
        graft: new GraftClient({ sdkTransport: transport }),
      }
    )
    const peer = new PeerService(session, path.join(directory, "state"))
    // Electron Node test mode has no utilityProcess. Use the actual canonical
    // Runtime for merge/validation; the production host retains its process boundary.
    vi.spyOn(session.runtimePool, "validatePaths").mockImplementation(
      async (paths) => {
        for (const relative of paths) {
          const runtime = await openEidosLiteFileRuntime(
            path.join(root, relative),
            {
              readOnly: true,
            }
          )
          await runtime.close()
        }
      }
    )
    vi.spyOn(session.runtimePool, "inspectMergeTables").mockImplementation(
      async (paths, signal) => {
        const names = new Set<string>()
        for (const relative of paths) {
          signal.throwIfAborted()
          const runtime = await openEidosLiteFileRuntime(
            path.join(root, relative),
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
    let timer: ReturnType<typeof setInterval> | undefined
    let finished = false
    let failure: string | undefined
    let manifest:
      | { path: string; bytes: number; sha256: string; contentSha256: string }[]
      | undefined
    let creatingManifest: Promise<void> | undefined
    let phase = "download"
    try {
      const invitation = await peer.start()
      const handle = peer["handle"].bind(peer)
      peer["tls"]!.removeAllListeners("request")
      peer["tls"]!.on("request", (request, response) => {
        if (request.url !== "/fixture") {
          const started = performance.now()
          let bytes = 0
          const write = response.write.bind(response)
          const end = response.end.bind(response)
          response.write = ((...args: Parameters<typeof response.write>) => {
            bytes +=
              typeof args[0] === "string"
                ? Buffer.byteLength(args[0])
                : args[0].length
            return write(...args)
          }) as typeof response.write
          response.end = ((...args: Parameters<typeof response.end>) => {
            if (typeof args[0] === "string") bytes += Buffer.byteLength(args[0])
            else if (Buffer.isBuffer(args[0])) bytes += args[0].length
            return end(...args)
          }) as typeof response.end
          response.once("finish", () => {
            void fs.appendFile(
              output + ".http.jsonl",
              JSON.stringify({
                method: request.method,
                route: request.url,
                status: response.statusCode,
                bytes,
                requestBytes: Number(request.headers["content-length"] ?? 0),
                phase,
                ms: performance.now() - started,
              }) + "\n"
            )
          })
          void fs.appendFile(
            output + ".requests.log",
            `${request.method} ${request.url}\n`
          )
          void handle(request, response).catch((error: unknown) => {
            console.error("Real Space request:", error)
            if (!response.headersSent) response.writeHead(500)
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              })
            )
          })
          return
        }
        void (async () => {
          let body = ""
          for await (const chunk of request) body += chunk
          const command = JSON.parse(body || "{}") as {
            manifest?: boolean
            finished?: boolean
            error?: string
            phase?: string
            mutation?: string
            database?: { tableId: string; label: string; insert?: boolean }
          }
          if (command.phase) phase = command.phase
          if (command.mutation)
            await fs.writeFile(
              path.join(root, "sync-performance-desktop.md"),
              command.mutation
            )
          if (command.manifest && !creatingManifest)
            creatingManifest = (async () => {
              const inventory = transport["requireSession"]()
              manifest = []
              let after: string | undefined
              do {
                const page = await inventory.inventory({
                  kind: "tracked",
                  limit: 1000,
                  after,
                })
                for (const entry of page.items) {
                  const file = path.join(root, entry.path)
                  const stats = await fs.stat(file)
                  if (!stats.isFile()) continue
                  const hash = createHash("sha256")
                  const contentHash = createHash("sha256")
                  let offset = 0
                  for await (const chunk of createReadStream(file)) {
                    hash.update(chunk)
                    const bytes = Buffer.from(chunk)
                    // SQLite's file-change counter, version-valid-for, and
                    // writer library version can differ across native hosts.
                    if (file.endsWith(".eidos"))
                      for (const start of [24, 92, 96])
                        for (let index = start; index < start + 4; index++)
                          if (index >= offset && index < offset + bytes.length)
                            bytes[index - offset] = 0
                    contentHash.update(bytes)
                    offset += bytes.length
                  }
                  manifest.push({
                    path: entry.path,
                    bytes: stats.size,
                    sha256: hash.digest("hex"),
                    contentSha256: contentHash.digest("hex"),
                  })
                }
                after = page.next_cursor ?? undefined
              } while (after)
              await fs.writeFile(
                output + ".manifest.json",
                JSON.stringify(manifest)
              )
            })()
          if (command.manifest) await creatingManifest
          let databaseRows: unknown
          if (command.database) {
            const runtime = openEidosFile(
              path.join(root, "sync-performance.eidos"),
              { readonly: !command.database.insert }
            )
            try {
              if (command.database.insert)
                runtime.mutateRows({
                  tableId: command.database.tableId,
                  insert: [
                    {
                      fields: { [command.database.label]: "edited on desktop" },
                    },
                  ],
                })
              expect(runtime.validate({ level: "full" }).valid).toBe(true)
              databaseRows = runtime.queryRows(command.database.tableId, {
                fields: [command.database.label],
              }).rows
            } finally {
              runtime.close()
            }
          }
          response.writeHead(200, { "Content-Type": "application/json" })
          response.end(
            JSON.stringify({
              manifest,
              databaseRows,
              mobile: await fs
                .readFile(path.join(root, "sync-performance-mobile.md"), "utf8")
                .catch(() => null),
            })
          )
          if (command.error) failure = command.error
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
      console.log("Private whole-Space fixture:", directory)
      timer = setInterval(() => {
        if (peer.status().pending) void peer.approve(true)
      }, 200)
      const deadline = Date.now() + 900_000
      while (!finished && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 200))
      expect(
        finished,
        "The mobile host must explicitly finish the real Space scenario"
      ).toBe(true)
      expect(failure, failure).toBeUndefined()
      if (!process.env.EIDOS_PEER_RELAY_PROBE_ONLY)
        expect(manifest?.length).toBeGreaterThan(0)
    } finally {
      if (timer) clearInterval(timer)
      await peer.close()
      await session.close()
      // Retain this isolated copy and its history for inspecting any failed run.
      await fs.writeFile(
        output + ".result.json",
        JSON.stringify({
          directory,
          finished,
          failure,
          files: manifest?.length,
        })
      )
    }
  },
  930_000
)
