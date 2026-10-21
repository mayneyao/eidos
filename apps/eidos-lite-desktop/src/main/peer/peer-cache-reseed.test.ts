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

it("shares exported SQLite segments when a downloaded device publishes its history", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "peer-history-"))
  const root = path.join(directory, "space")
  const authorRoot = path.join(directory, "author")
  const cloud = path.join(directory, "cloud")
  await fs.mkdir(root)
  await fs.mkdir(authorRoot)
  await fs.mkdir(cloud)
  const authorPath = path.join(authorRoot, "history.eidos")
  const databasePath = path.join(root, "history.eidos")
  const database = new DatabaseSync(authorPath)
  database.exec(
    "CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('first')"
  )
  database.close()
  const author = await RepositorySession.open(authorRoot)
  await author.init()
  await author.addAll()
  await author.commit("first")
  const initial = (await author.historySummaries({ limit: 1 })).commits[0]!
  const changed = new DatabaseSync(authorPath)
  changed.exec("PRAGMA user_version=2; UPDATE notes SET body = 'second'")
  changed.close()
  await author.addAll()
  await author.commit("replace every page")
  await author.configureRemote({ name: "origin", url: `fs://${cloud}` })
  await author.push({ remote: "origin", branch: "main" })
  const clone = await RepositorySession.open(root)
  await clone.cloneRepository({ remoteUrl: `fs://${cloud}`, branch: "main" })
  await clone.close()
  await author.close()
  const graft = new GraftClient({
    sdkTransport: new GraftInProcessTransport(),
  })
  const session = await SpaceSession.create(
    root,
    path.join(directory, "state"),
    {
      graft,
    }
  )
  const peer = new PeerService(session, path.join(directory, "state"))
  let mobile: RepositorySession | undefined
  try {
    await session.enableVersioning()
    await peer.start(false)
    await peer["synchronize"]()
    // Historical pages must now be served by the exported peer cache alone.
    await fs.rename(cloud, cloud + "-offline")
    const phone = path.join(directory, "phone")
    await fs.mkdir(phone)
    mobile = await RepositorySession.open(phone)
    await mobile.cloneRepository({
      remoteUrl: peer["localUrl"],
      branch: "main",
      bearerToken: peer["localToken"],
    })
    // The current snapshot is materialized, but earlier storage segments may
    // remain lazy. A new incoming remote needs those segments when publishing
    // the complete history, even when the phone has no local edits.
    peer["host"].devices.push({
      id: "test-phone",
      name: "Phone",
      tokenHash: "unused",
    })
    await mobile.close()
    mobile = await RepositorySession.open(phone)
    const segment = peer["store"]!.list({ prefix: "segments/", limit: 1 })
      .paths[0]
    expect(segment).toBeDefined()
    expect(peer["incomingStore"]("test-phone").head(segment!)).toEqual(
      peer["store"]!.head(segment!)
    )
    const incomingUrl = peer["localUrl"].replace(
      "/peer/space",
      "/incoming/test-phone"
    )
    await mobile.configureRemote({
      name: "incoming",
      url: incomingUrl,
      bearerToken: peer["localToken"],
    })
    await mobile.push({ remote: "incoming", branch: "main" })
    expect(
      await sqliteSnapshotContent(path.join(phone, "history.eidos"))
    ).toEqual(await sqliteSnapshotContent(databasePath))
    await mobile.restorePaths({
      source: initial.id,
      paths: ["history.eidos"],
    })
    const restored = new DatabaseSync(path.join(phone, "history.eidos"), {
      readOnly: true,
    })
    try {
      expect(restored.prepare("SELECT body FROM notes").get()).toEqual({
        body: "first",
      })
      expect(restored.prepare("PRAGMA integrity_check").all()).toEqual([
        { integrity_check: "ok" },
      ])
    } finally {
      restored.close()
    }
  } finally {
    await mobile?.close()
    await peer.close()
    await session.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
}, 120_000)
