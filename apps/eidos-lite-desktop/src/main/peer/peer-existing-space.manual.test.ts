import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { PeerService } from "./peer-service"

it.skipIf(!process.env.EIDOS_PEER_EXISTING_SPACE)(
  "seeds a peer from a copy of existing history",
  async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-existing-peer-")
    )
    const root = path.join(directory, "space")
    await fs.cp(process.env.EIDOS_PEER_EXISTING_SPACE!, root, {
      recursive: true,
    })
    const transport = new GraftInProcessTransport()
    const graft = new GraftClient({ sdkTransport: transport })
    const session = await SpaceSession.create(
      root,
      path.join(directory, "state"),
      { graft }
    )
    const peer = new PeerService(session, path.join(directory, "state"))
    let phase = "start"
    const stage = graft.stageAll.bind(graft)
    vi.spyOn(graft, "stageAll").mockImplementation(async (...args) => {
      phase = "stage"
      return stage(...args)
    })
    const transfer = graft.transferPeer.bind(graft)
    vi.spyOn(graft, "transferPeer").mockImplementation(async (...args) => {
      phase = args[1]
      return transfer(...args)
    })
    const configure = graft.configurePeer.bind(graft)
    vi.spyOn(graft, "configurePeer").mockImplementation(async (...args) => {
      phase = "configure"
      await configure(...args)
      expect(await graft.remoteUrl(root, "eidos-peer")).toBe(
        args[1].replace("graft+", "")
      )
    })
    try {
      await peer.start()
      console.info("started peer")
      peer["loopback"]!.on("request", (request, response) => {
        console.info(
          "peer request",
          request.method,
          request.url?.split("/")[3],
          request.headers.range
        )
        response.once("finish", () =>
          console.info("peer response", response.statusCode)
        )
      })
      await peer["synchronize"]()
    } catch (error) {
      throw new Error(`Failed phase: ${phase}`, { cause: error })
    } finally {
      await peer.close()
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    }
  },
  120_000
)
