import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  createEidosFile,
  openEidosFile,
} from "@eidos.space/eidos-file/node-sqlite"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { PeerService } from "./peer-service"

it.skipIf(!process.env.EIDOS_PEER_ANDROID_FIXTURE)(
  "exchanges files with the Android JNI host over pinned TLS",
  async () => {
    const output = process.env.EIDOS_PEER_ANDROID_FIXTURE!
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-peer-device-")
    )
    const root = path.join(directory, "desktop")
    await fs.mkdir(root)
    await fs.writeFile(path.join(root, "note.md"), "from desktop")
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
    const peer = new PeerService(session, path.join(directory, "state"))
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
          } finally {
            runtime.close()
          }
        }
      }
    )
    let timer: ReturnType<typeof setInterval> | undefined
    const metrics: unknown[] = []
    try {
      const invitation = await peer.start()
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
        JSON.stringify({ invitation: invitation.invitation }),
        { mode: 0o600 }
      )
      timer = setInterval(() => {
        if (peer.status().pending) void peer.approve(true)
      }, 200)
      const deadline = Date.now() + 180_000
      while (Date.now() < deadline) {
        if (
          (await fs.readFile(path.join(root, "note.md"), "utf8")) ===
          "from Android"
        )
          return
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
    }
  },
  200_000
)
