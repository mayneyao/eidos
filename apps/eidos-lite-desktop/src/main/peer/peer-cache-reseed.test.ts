import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { RepositorySession } from "@eidos.space/graft"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { PeerService } from "./peer-service"

it("refreshes only existing sources owned by this gateway and authorized devices", async () => {
  const remote = "eidos-peer-11111111-1111-4111-8111-111111111111"
  const urls = new Map([
    [remote, "http://127.0.0.1:1234/peer/space"],
    [`${remote}-authorized`, "http://127.0.0.1:1234/incoming/authorized"],
    [`${remote}-revoked`, "http://127.0.0.1:1234/incoming/revoked"],
    [`${remote}-external`, "https://other.example/incoming/external"],
    [`${remote}-wrong-route`, "http://127.0.0.1:1234/incoming/other"],
    ["origin", "https://sync.eidos.space/private/space"],
    ["eidos-peer-other-gateway", "http://127.0.0.1:1234/peer/space"],
  ])
  const configurePeer = vi.fn(async () => {})
  const session = {
    versioningEnabled: true,
    closed: false,
    canonical: { root: "/space" },
    graft: {
      remoteUrl: vi.fn(
        async (_root: string, name: string) => urls.get(name) ?? null
      ),
      configurePeer,
    },
    withSyncTask: async (action: () => Promise<void>) => action(),
    gate: {
      withRepositoryOperation: async (
        _label: string,
        action: (signal: AbortSignal) => Promise<void>
      ) => action(new AbortController().signal),
    },
  } as unknown as SpaceSession
  await SpaceSession.prototype.refreshPeerSources.call(
    session,
    "graft+http://127.0.0.1:5678/peer/space",
    "fresh-token",
    remote,
    ["authorized", "external", "wrong-route", "not-configured"]
  )
  expect(configurePeer.mock.calls).toEqual([
    ["/space", "graft+http://127.0.0.1:5678/peer/space", "fresh-token", remote],
    [
      "/space",
      "graft+http://127.0.0.1:5678/incoming/authorized",
      "fresh-token",
      `${remote}-authorized`,
    ],
  ])
  await expect(
    SpaceSession.prototype.refreshPeerSources.call(
      session,
      "graft+http://127.0.0.1:5678/peer/space",
      "fresh-token",
      "origin",
      []
    )
  ).rejects.toThrow("Invalid local device cache identity")
})

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

it("rebinds retained incoming history after gateway restart before any new device sync", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "peer-restart-history-")
  )
  const root = path.join(directory, "space")
  const authorRoot = path.join(directory, "author")
  const destination = path.join(directory, "destination")
  const userData = path.join(directory, "state")
  await Promise.all(
    [root, authorRoot, destination].map((entry) => fs.mkdir(entry))
  )
  const author = await RepositorySession.open(authorRoot)
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session = await SpaceSession.create(root, userData, { graft })
  let peer = new PeerService(session, userData)
  let clone: RepositorySession | undefined
  let proof: RepositorySession | undefined
  try {
    await author.init()
    const database = new DatabaseSync(path.join(authorRoot, "history.eidos"))
    database.exec(
      "CREATE TABLE notes(body TEXT); INSERT INTO notes VALUES ('first')"
    )
    await author.addAll()
    await author.commit("first")
    const first = (await author.historySummaries({ limit: 1 })).commits[0]!
    database.exec("PRAGMA user_version=2; UPDATE notes SET body='second'")
    database.close()
    await author.addAll()
    await author.commit("replace every page")
    await peer.start(false)
    const deviceId = "restart-device"
    peer["host"].devices.push({
      id: deviceId,
      name: "Phone",
      tokenHash: "unused",
    })
    const source = `${peer["remote"]}-${deviceId}`
    const incoming = peer["localUrl"].replace(
      "/peer/space",
      `/incoming/${deviceId}`
    )
    await author.configureRemote({
      name: "incoming",
      url: incoming,
      bearerToken: peer["localToken"],
    })
    await author.push({ remote: "incoming", branch: "main" })
    await session.close()
    clone = await RepositorySession.open(root)
    // Clone materializes only the latest SQLite pages. Old history remains in
    // the incoming cache, which is the sole source for the subsequent push.
    await clone.cloneRepository({
      remoteUrl: incoming,
      branch: "main",
      bearerToken: peer["localToken"],
    })
    await clone.configureRemote({
      name: source,
      url: incoming,
      bearerToken: peer["localToken"],
    })
    await clone.fetch({ remote: source, branch: "main" })
    await clone.configureRemote({
      name: "destination",
      url: `fs://${destination}`,
    })
    await clone.close()
    clone = undefined
    const head = await fs.readFile(
      path.join(root, ".graft/refs/heads/main"),
      "utf8"
    )
    const tracking = await fs.readFile(
      path.join(root, ".graft/refs/remotes", source, "main"),
      "utf8"
    )
    await peer.close()
    session = await SpaceSession.create(root, userData, { graft })
    peer = new PeerService(session, userData)
    await peer.start(false)
    const refreshed = peer["localUrl"].replace(
      "/peer/space",
      `/incoming/${deviceId}`
    )
    expect(await graft.remoteUrl(root, source)).toBe(
      refreshed.replace(/^graft\+/, "")
    )
    expect(await graft.remoteUrl(root, "origin")).toBe(
      incoming.replace(/^graft\+/, "")
    )
    await graft.transferPeer(root, "push", undefined, "destination")
    expect(
      await fs.readFile(path.join(root, ".graft/refs/heads/main"), "utf8")
    ).toBe(head)
    expect(
      await fs.readFile(
        path.join(root, ".graft/refs/remotes", source, "main"),
        "utf8"
      )
    ).toBe(tracking)
    const proofRoot = path.join(directory, "proof")
    await fs.mkdir(proofRoot)
    proof = await RepositorySession.open(proofRoot)
    await proof.cloneRepository({
      remoteUrl: `fs://${destination}`,
      branch: "main",
    })
    const verification = path.join(directory, "verification")
    await fs.mkdir(verification)
    await proof.configureRemote({
      name: "verification",
      url: `fs://${verification}`,
    })
    // Force historical hydration from destination, not the live peer cache,
    // before restoring an old snapshot into this lazily materialized clone.
    await proof.push({ remote: "verification", branch: "main" })
    await proof.restorePaths({ source: first.id, paths: ["history.eidos"] })
    const restored = new DatabaseSync(path.join(proofRoot, "history.eidos"), {
      readOnly: true,
    })
    try {
      expect(restored.prepare("SELECT body FROM notes").get()).toEqual({
        body: "first",
      })
    } finally {
      restored.close()
    }
  } finally {
    await proof?.close()
    await clone?.close()
    await author.close()
    await peer.close()
    await session.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
}, 120_000)

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
