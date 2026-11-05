import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { assertSpaceRootIdentity, canonicalizeSpaceRoot } from "./space-paths"
import { spaceFileIdentity, persistentSpaceId } from "./space-identity"
import { SpaceOperationGate } from "./operation-gate"
import { SpaceOperationJournal } from "./operation-journal"

let directory: string
let root: string
let profile: string
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-space-identity-"))
  root = path.join(directory, "Space")
  profile = path.join(directory, "profile")
  await fs.mkdir(root)
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(directory, { recursive: true, force: true })
})

it.skipIf(process.platform !== "darwin")(
  "keeps the 0.30.1 namespace across upgrade and macOS device-number changes",
  async () => {
    root = await fs.realpath(root)
    const stats = await fs.stat(root, { bigint: true })
    const legacyId = createHash("sha256")
      .update(`${root}:${stats.dev}:${stats.ino}`)
      .digest("hex")
      .slice(0, 24)
    expect(await spaceFileIdentity(root, stats)).not.toBeNull()
    expect((await canonicalizeSpaceRoot(root, profile)).id).toBe(legacyId)
    stats.dev += 2n
    vi.spyOn(fs, "stat").mockResolvedValue(stats)
    // The old implementation changes the ID here and loses every Space-scoped
    // lookup, including plugin-defined history/<spaceId>/ storage keys.
    expect((await canonicalizeSpaceRoot(root, profile)).id).toBe(legacyId)
    expect((await canonicalizeSpaceRoot(`${root}/`, profile)).id).toBe(legacyId)
  }
)

it.skipIf(process.platform !== "darwin")(
  "retains state on same-volume move and aliases, and isolates a copy",
  async () => {
    const original = await canonicalizeSpaceRoot(root, profile)
    const moved = `${root}-moved`
    await fs.rename(root, moved)
    await expect(assertSpaceRootIdentity(original)).rejects.toThrow(
      "moved or was replaced"
    )
    const alias = `${root}-alias`
    await fs.symlink(moved, alias)
    expect((await canonicalizeSpaceRoot(moved, profile)).id).toBe(original.id)
    expect((await canonicalizeSpaceRoot(alias, profile)).id).toBe(original.id)
    await fs.cp(moved, root, { recursive: true, preserveTimestamps: true })
    expect((await canonicalizeSpaceRoot(root, profile)).id).not.toBe(
      original.id
    )
  }
)

it("uses the Windows volume serial and file identity independently of mount path", async () => {
  const stats = { dev: 123, ino: 456, birthtimeMs: 1000 }
  expect(await spaceFileIdentity("C:\\Space", stats, "win32")).toBe(
    await spaceFileIdentity("D:\\Moved", stats, "win32")
  )
  expect(await spaceFileIdentity("C:\\Space", stats, "win32")).not.toBe(
    await spaceFileIdentity("C:\\Space", { ...stats, dev: 124 }, "win32")
  )
})

it("does not reuse a granted namespace when a replacement volume reuses the old device and inode", async () => {
  const id = "111111111111111111111111"
  expect(await persistentSpaceId(profile, "volume-a/file-42", id)).toBe(id)
  const replacement = await persistentSpaceId(profile, "volume-b/file-42", id)
  expect(replacement).not.toBe(id)
  expect(await persistentSpaceId(profile, "volume-b/file-42", id)).toBe(
    replacement
  )
})

it.skipIf(process.platform !== "darwin")(
  "does not transfer grants to a replacement directory at the same path",
  async () => {
    const original = await canonicalizeSpaceRoot(root, profile)
    await fs.rename(root, `${root}-old`)
    await fs.mkdir(root)
    const replacement = await canonicalizeSpaceRoot(root, profile)
    expect(replacement.id).not.toBe(original.id)
  }
)

it("isolates different volumes, folders and profiles and resolves concurrent opens", async () => {
  const originalId = "111111111111111111111111"
  const otherId = "222222222222222222222222"
  const identity = JSON.stringify([root, "volume-a", 42, 1000])
  expect(
    await Promise.all(
      Array.from({ length: 8 }, () =>
        persistentSpaceId(profile, identity, originalId)
      )
    )
  ).toEqual(Array(8).fill(originalId))
  expect(await persistentSpaceId(profile, identity, otherId)).toBe(originalId)
  const ids = new Set([originalId])
  for (const other of [
    JSON.stringify([root, "volume-b", 42, 1000]),
    JSON.stringify([root, "volume-a", 43, 1000]),
    JSON.stringify([root, "volume-a", 42, 1001]),
  ]) {
    const id = await persistentSpaceId(profile, other, otherId)
    expect(ids.has(id)).toBe(false)
    ids.add(id)
    expect(await persistentSpaceId(profile, other, otherId)).toBe(id)
  }
  expect(await persistentSpaceId(`${profile}-other`, identity, otherId)).toBe(
    otherId
  )
})

it("refuses corrupt identity state instead of overwriting it with a fresh namespace", async () => {
  await persistentSpaceId(profile, "identity", "111111111111111111111111")
  const filename = (
    await fs.readdir(path.join(profile, "space-identities"))
  ).find((name) => /^[a-f0-9]{64}$/.test(name))
  const target = path.join(profile, "space-identities", filename!, "value.json")
  await fs.writeFile(target, "{}")
  await expect(
    persistentSpaceId(profile, "identity", "222222222222222222222222")
  ).rejects.toThrow("Invalid persistent Space identity")
  expect(await fs.readFile(target, "utf8")).toBe("{}")
  await fs.unlink(target)
  await expect(
    persistentSpaceId(profile, "identity", "222222222222222222222222")
  ).rejects.toThrow("Incomplete Space identity record")
  await expect(fs.stat(target)).rejects.toMatchObject({ code: "ENOENT" })
})

it("keeps fallback path state without writing into unsupported filesystems or syncing device markers", async () => {
  const stats = await fs.stat(root, { bigint: true })
  stats.birthtimeMs = 0n
  const identity = await spaceFileIdentity(root, stats, "aix", true)
  expect(identity).not.toBeNull()
  stats.dev += 2n
  expect(await spaceFileIdentity(root, stats, "aix", true)).toBe(identity)
  const copy = `${root}-copy`
  await fs.cp(root, copy, { recursive: true })
  const copiedStats = await fs.stat(copy, { bigint: true })
  copiedStats.birthtimeMs = 0n
  expect(await spaceFileIdentity(copy, copiedStats, "aix", true)).not.toBe(
    identity
  )
  const moved = `${root}-moved`
  await fs.rename(root, moved)
  expect(await spaceFileIdentity(moved, stats, "aix", true)).not.toBe(identity)
  expect(await fs.readdir(moved)).toEqual([])
})

it("blocks a moved session from reading, mutating or syncing a replacement at its old path", async () => {
  const canonical = await canonicalizeSpaceRoot(root)
  const gate = new SpaceOperationGate(new SpaceOperationJournal(profile), {
    assertRootIdentity: () => assertSpaceRootIdentity(canonical),
    closeRuntimes: async () => {},
    validateWorktree: async () => {},
    reopenRuntimes: async () => {},
  })
  await fs.rename(root, `${root}-moved`)
  await fs.mkdir(root)
  const operation = vi.fn(async () =>
    fs.writeFile(path.join(root, "must-not-exist.md"), "wrong folder")
  )
  await expect(gate.withMutation(operation)).rejects.toThrow(
    "moved or was replaced"
  )
  await expect(gate.withRuntimeRead(operation)).rejects.toThrow(
    "moved or was replaced"
  )
  await expect(gate.withRepositoryOperation("sync", operation)).rejects.toThrow(
    "moved or was replaced"
  )
  expect(operation).not.toHaveBeenCalled()
  expect(await fs.readdir(root)).toEqual([])
})

it("commits complete registry records without hardlinks and fails explicitly on permission errors", async () => {
  const link = vi
    .spyOn(fs, "link")
    .mockRejectedValue(
      Object.assign(new Error("unsupported"), { code: "ENOTSUP" })
    )
  await persistentSpaceId(profile, "identity", "111111111111111111111111")
  expect(link).not.toHaveBeenCalled()
  const error = Object.assign(new Error("permission denied"), {
    code: "EACCES",
  })
  vi.spyOn(fs, "rename").mockRejectedValue(error)
  await expect(
    persistentSpaceId(profile, "other", "222222222222222222222222")
  ).rejects.toBe(error)
})

it("preserves native mode and its namespace through temporary volume-query failure and recovery", async () => {
  const stats = await fs.stat(root, { bigint: true })
  const native = async () => "persistent-volume"
  const identity = await spaceFileIdentity(
    root,
    stats,
    "darwin",
    true,
    profile,
    native
  )
  const id = "111111111111111111111111"
  expect(await persistentSpaceId(profile, identity!, id)).toBe(id)
  for (const failure of [
    async () => null,
    async () => {
      throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })
    },
    async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" })
    },
  ])
    await expect(
      spaceFileIdentity(root, stats, "darwin", true, profile, failure)
    ).rejects.toThrow("existing state has not been reset")
  expect(await fs.readdir(root)).toEqual([])
  expect(
    await spaceFileIdentity(root, stats, "darwin", true, profile, native)
  ).toBe(identity)
  expect(
    await persistentSpaceId(profile, identity!, "222222222222222222222222")
  ).toBe(id)
})

it("atomically chooses one initial mode when concurrent volume queries disagree", async () => {
  const stats = await fs.stat(root, { bigint: true })
  let release!: () => void
  let blocked!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const publishing = new Promise<void>((resolve) => {
    blocked = resolve
  })
  const rename = fs.rename.bind(fs)
  vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
    if (
      String(to).includes("/native-files/") ||
      String(to).includes("/file-modes/")
    ) {
      const value: { mode?: string } = JSON.parse(
        await fs.readFile(path.join(String(from), "value.json"), "utf8")
      )
      if (value.mode !== "path") {
        blocked()
        await gate
      }
    }
    await rename(from, to)
  })
  const native = spaceFileIdentity(
    root,
    stats,
    "darwin",
    true,
    profile,
    async () => "volume"
  )
  await publishing
  const fallback = await spaceFileIdentity(
    root,
    stats,
    "darwin",
    true,
    profile,
    async () => null
  )
  release()
  expect(await native).toBe(fallback)
  expect(
    await spaceFileIdentity(
      root,
      stats,
      "darwin",
      true,
      profile,
      async () => "volume"
    )
  ).toBe(fallback)
  const id = "111111111111111111111111"
  expect(await persistentSpaceId(profile, fallback!, id)).toBe(id)
  expect(
    await persistentSpaceId(
      profile,
      (await native)!,
      "222222222222222222222222"
    )
  ).toBe(id)
})

it("recovers the first namespace choice after interruption before its forward binding is published", async () => {
  const rename = fs.rename.bind(fs)
  let publications = 0
  const failure = Object.assign(new Error("interrupted"), { code: "EIO" })
  const spy = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
    if (++publications === 2) throw failure
    await rename(from, to)
  })
  await expect(
    persistentSpaceId(profile, "identity", "111111111111111111111111")
  ).rejects.toBe(failure)
  spy.mockRestore()
  expect(
    await persistentSpaceId(profile, "identity", "222222222222222222222222")
  ).toBe("111111111111111111111111")
})
