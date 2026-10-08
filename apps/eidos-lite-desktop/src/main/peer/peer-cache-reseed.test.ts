import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { RepositorySession } from "@eidos.space/graft"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { PeerService } from "./peer-service"

async function sqliteSnapshotContent(filePath: string) {
  const database = new DatabaseSync(filePath, { readOnly: true })
  try {
    expect(database.prepare("PRAGMA integrity_check").all()).toEqual([
      { integrity_check: "ok" },
    ])
  } finally {
    database.close()
  }
  const bytes = await fs.readFile(filePath)
  expect(bytes.subarray(0, 16).toString()).toBe("SQLite format 3\u0000")
  // Match Graft's SQLite snapshot equality: online backup can rewrite these
  // cache counters and the last-writer SQLite version across platforms.
  // All schema, row, allocation and remaining header bytes must still match.
  for (const offset of [24, 40, 92, 96]) bytes.fill(0, offset, offset + 4)
  return bytes
}

it("exports SQLite snapshots to a fresh device cache despite previous remote tracking", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "peer-reseed-"))
  const root = path.join(directory, "space")
  const existing = process.env.EIDOS_PEER_RESEED_SPACE
  if (existing) await fs.cp(existing, root, { recursive: true })
  else {
    await fs.mkdir(root)
    await fs.copyFile(
      path.resolve("../eidos-file-web/fixtures/project-tracker.eidos"),
      path.join(root, "project.eidos")
    )
  }
  const session = await SpaceSession.create(
    root,
    path.join(directory, "state"),
    {
      graft: new GraftClient({ sdkTransport: new GraftInProcessTransport() }),
    }
  )
  let peer = new PeerService(session, path.join(directory, "old-cache"))
  let mobile: RepositorySession | undefined
  try {
    await peer.start(false)
    await peer["synchronize"]()
    await peer.close()
    peer = new PeerService(session, path.join(directory, "new-cache"))
    await peer.start(false)
    await peer["synchronize"]()
    const phone = path.join(directory, "phone")
    await fs.mkdir(phone)
    mobile = await RepositorySession.open(phone)
    await mobile.init()
    await mobile.configureRemote({
      name: "desktop",
      url: peer["localUrl"],
      bearerToken: peer["localToken"],
    })
    await mobile.fetch({ remote: "desktop", branch: "main" })
    const plan = await mobile.planMerge({ revision: "desktop/main" })
    await mobile.applyMerge({
      revision: "desktop/main",
      planToken: plan.plan_token,
    })
    const file = existing ? "blog.eidos" : "project.eidos"
    expect(await sqliteSnapshotContent(path.join(phone, file))).toEqual(
      await sqliteSnapshotContent(path.join(root, file))
    )
  } finally {
    await mobile?.close()
    await peer.close()
    await session.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
}, 120_000)
