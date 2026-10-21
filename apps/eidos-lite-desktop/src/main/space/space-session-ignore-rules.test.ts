import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "./space-session"

it("reads and atomically saves root ignore rules before versioning", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ignore-rules-space-"))
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "ignore-rules-state-"))
  const graft = new GraftClient({
    sdkTransport: new GraftInProcessTransport(),
  })
  const session = await SpaceSession.create(root, state, { graft })
  try {
    expect(await session.readSpaceIgnoreRules()).toEqual({
      graftignore: "",
      gitignore: "",
    })
    await session.saveSpaceIgnoreRules({
      graftignore: "*.mp4\n*.mov\n",
      gitignore: "node_modules/\n",
    })
    expect(await session.readSpaceIgnoreRules()).toEqual({
      graftignore: "*.mp4\n*.mov\n",
      gitignore: "node_modules/\n",
    })
    await expect(
      fs.readFile(path.join(root, ".graftignore"), "utf8")
    ).resolves.toBe("*.mp4\n*.mov\n")
    await expect(
      fs.readFile(path.join(root, ".gitignore"), "utf8")
    ).resolves.toBe("node_modules/\n")
    await session.saveSpaceIgnoreRules({
      graftignore: "*.mp4\n",
      gitignore: "",
    })
    expect(await session.readSpaceIgnoreRules()).toEqual({
      graftignore: "*.mp4\n",
      gitignore: "",
    })
  } finally {
    await session.close()
    await graft.close()
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(state, { recursive: true, force: true })
  }
}, 30_000)
