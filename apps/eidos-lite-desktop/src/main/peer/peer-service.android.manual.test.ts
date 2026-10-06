import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  createEidosFile,
  openEidosFile,
  mergeEidosSystemMetadataFiles,
} from "@eidos.space/eidos-file/node-sqlite"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { PeerService } from "./peer-service"
import { openEidosLiteFileRuntime } from "../../runtime/eidos-file-runtime"

it.skipIf(!process.env.EIDOS_PEER_ANDROID_FIXTURE)(
  "exchanges files with the Android JNI host over pinned TLS",
  async () => {
    const output = process.env.EIDOS_PEER_ANDROID_FIXTURE!
    const conflicts = Boolean(process.env.EIDOS_PEER_CONFLICT_FIXTURE)
    const recovery = Boolean(process.env.EIDOS_PEER_RECOVERY_FIXTURE)
    const changePort = process.env.EIDOS_PEER_RECOVERY_FIXTURE !== "same-port"
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-peer-device-")
    )
    const root = path.join(directory, "desktop")
    await fs.mkdir(root)
    await fs.writeFile(path.join(root, "note.md"), "from desktop")
    await fs.mkdir(path.join(root, "assets"))
    await fs.writeFile(
      path.join(root, "assets", "sample.bin"),
      Buffer.from([0, 255, 12, 8])
    )
    const database = createEidosFile(path.join(root, "data.eidos"), {
      title: "Device test",
    })
    await database.close()
    for (let index = 0; index < 24; index++) {
      await fs.copyFile(
        path.join(root, "data.eidos"),
        path.join(root, `data-${index}.eidos`)
      )
    }
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const session = await SpaceSession.create(
      root,
      path.join(directory, "state"),
      { graft }
    )
    let peer = new PeerService(session, path.join(directory, "state"))
    const synchronize = session.syncPeerRemote.bind(session)
    vi.spyOn(session, "syncPeerRemote").mockImplementation(async (...args) => {
      try {
        return await synchronize(...args)
      } catch (error) {
        console.error(
          "Desktop fixture sync:",
          error instanceof Error ? error.message : String(error)
        )
        throw error
      }
    })
    // Electron's utilityProcess is unavailable in its Node test mode. Validate with
    // the same canonical Runtime directly; production retains the utility boundary.
    vi.spyOn(session.runtimePool, "validatePaths").mockImplementation(
      async (paths) => {
        for (const relative of paths) {
          const runtime = openEidosFile(path.join(root, relative), {
            readonly: true,
          })
          try {
            runtime.schema()
            expect(runtime.validate({ level: "full" }).valid).toBe(true)
          } finally {
            runtime.close()
          }
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
    const metrics: unknown[] = []
    let phase = "download"
    let diverge = false
    let reviewed = false
    let finished = false
    let restart = false
    let recovered = false
    const installFixture = () => {
      const handle = peer["handle"].bind(peer)
      peer["tls"]!.removeAllListeners("request")
      peer["tls"]!.on("request", (request, response) => {
        if (request.url !== "/fixture") {
          void handle(request, response)
          return
        }
        void (async () => {
          let body = ""
          for await (const chunk of request) body += chunk
          const command = JSON.parse(body || "{}") as {
            diverge?: boolean
            reviewed?: boolean
            finished?: boolean
            restart?: boolean
            recovered?: boolean
          }
          diverge ||= command.diverge === true
          reviewed ||= command.reviewed === true
          finished ||= command.finished === true
          restart ||= command.restart === true
          recovered ||= command.recovered === true
          response.writeHead(200, { "Content-Type": "application/json" })
          response.end(JSON.stringify({ phase }))
        })()
      })
    }
    try {
      const invitation = await peer.start()
      installFixture()
      let requests = 0
      let requestMs = 0
      peer["tls"]!.on("request", (request, response) => {
        const start = performance.now()
        response.once("finish", () => {
          requests++
          requestMs += performance.now() - start
          if (request.url === "/sync") {
            metrics.push({
              requests,
              requestMs: Math.round(requestMs),
              syncMs: Math.round(performance.now() - start),
            })
            requests = 0
            requestMs = 0
          }
        })
      })
      await fs.writeFile(
        output,
        JSON.stringify({
          invitation: invitation.invitation,
          conflicts,
          recovery,
          changePort,
        }),
        { mode: 0o600 }
      )
      timer = setInterval(() => {
        if (peer.status().pending) void peer.approve(true)
      }, 200)
      const deadline = Date.now() + 480_000
      while (Date.now() < deadline) {
        if (
          await fs.stat(output + ".stop").then(
            () => true,
            () => false
          )
        )
          throw new Error(
            "Disposable fixture stopped after a failed device run"
          )
        if (
          phase === "download" &&
          (!conflicts || diverge) &&
          (await fs.readFile(path.join(root, "note.md"), "utf8")) ===
            "from Android"
        ) {
          // Materialization finishes before Android fetches the resulting head.
          // Keep the server alive until the client confirms the whole round trip.
          if (!conflicts && !recovery) {
            if (finished) return
            await new Promise((resolve) => setTimeout(resolve, 200))
            continue
          }
          if (!conflicts) {
            phase = "completed"
            continue
          }
          await peer["activeSync"]
          await fs.writeFile(
            path.join(root, "note.md"),
            "desktop concurrent edit"
          )
          await peer["synchronize"]()
          phase = "diverged"
        }
        if (phase === "diverged" && reviewed) {
          let state = await session.getSyncMergeStatus()
          if (state.state !== "merging") {
            await new Promise((resolve) => setTimeout(resolve, 200))
            continue
          }
          state = await session.writeSyncMergeText(
            state.stateToken,
            "note.md",
            "reviewed on desktop"
          )
          if (state.state !== "merging")
            throw new Error("Expected a staged text result")
          await session.continueSyncMerge(
            state.stateToken,
            "Review mobile conflict"
          )
          phase = "resolved"
        }
        if (finished && phase === "resolved") {
          expect(await fs.readFile(path.join(root, "waiting.md"), "utf8")).toBe(
            "written while waiting"
          )
          expect(await fs.readFile(path.join(root, "note.md"), "utf8")).toBe(
            "reviewed on desktop"
          )
          if (!recovery) return
          phase = "completed"
        }
        if (recovery && restart && phase === "completed") {
          const previous = peer["address"]
          await peer.close()
          // A disposable port change exercises discovery after loss of the saved endpoint.
          if (changePort)
            await fs.writeFile(path.join(peer["directory"], "port"), "0")
          await new Promise((resolve) => setTimeout(resolve, 3000))
          await fs.writeFile(
            path.join(root, "recovery.md"),
            "desktop restarted"
          )
          peer = new PeerService(session, path.join(directory, "state"))
          await peer.start()
          installFixture()
          if (changePort) expect(peer["address"]).not.toBe(previous)
          else expect(peer["address"]).toBe(previous)
          metrics.push({ recovery: { previous, current: peer["address"] } })
          phase = "restarted"
        }
        if (recovered && phase === "restarted") {
          expect(await fs.readFile(path.join(root, "offline.md"), "utf8")).toBe(
            "edited while disconnected"
          )
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      throw new Error("Android did not finish the round trip")
    } finally {
      if (timer) clearInterval(timer)
      await peer.close()
      await fs.writeFile(output + ".metrics.json", JSON.stringify(metrics))
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
      await fs.rm(output, { force: true })
      await fs.rm(output + ".stop", { force: true })
    }
  },
  500_000
)
