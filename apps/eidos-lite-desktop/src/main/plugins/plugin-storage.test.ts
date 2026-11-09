import { afterEach, expect, it, vi } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { PluginStorage } from "./plugin-storage"
const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const dir of directories.splice(0))
    await fs.rm(dir, { recursive: true, force: true })
})

it("distinguishes absent and empty objects; tokens persist across storage instances", async () => {
  const { dir, store } = await fixture()
  expect(
    await store.request("storage.readVersioned", { key: "index" }, 100, active)
  ).toEqual({ data: null, version: null })
  const applied = (await store.request(
    "storage.compareAndWrite",
    { key: "index", expectedVersion: null, data: "" },
    100,
    active
  )) as { applied: boolean; version: string }
  expect(applied.applied).toBe(true)
  expect(applied.version).toMatch(/^[a-f0-9]{64}$/)
  expect(
    await new PluginStorage(dir).request(
      "storage.readVersioned",
      { key: "index" },
      100,
      active
    )
  ).toEqual({ data: "", version: applied.version })
  expect(
    await store.request(
      "storage.compareAndWrite",
      { key: "index", expectedVersion: null, data: "YQ==" },
      100,
      active
    )
  ).toEqual({ applied: false, version: applied.version })
})

it("shares compare-and-write serialization and quota across instances and directory aliases", async () => {
  const { dir, store } = await fixture()
  const alias = dir + "-alias"
  await fs.symlink(dir, alias)
  directories.push(alias)
  const other = new PluginStorage(alias)
  const results = (await Promise.all(
    [store, other].map((s) =>
      s.request(
        "storage.compareAndWrite",
        { key: "same", expectedVersion: null, data: "YQ==" },
        4,
        active
      )
    )
  )) as { applied: boolean }[]
  expect(results.filter((r) => r.applied)).toHaveLength(1)
  const quota = await Promise.allSettled(
    [store, other].map((s, i) =>
      s.request("storage.write", { key: `other-${i}`, data: "AP8B" }, 4, active)
    )
  )
  expect(quota.filter((r) => r.status === "fulfilled")).toHaveLength(1)
  expect(
    (await fs.readdir(dir)).filter((f) => f.endsWith(".blob"))
  ).toHaveLength(2)
})

it.each(["storage.write", "storage.delete"])(
  "keeps %s outside the compare-to-rename critical section",
  async (method) => {
    const { dir, store } = await fixture(),
      other = new PluginStorage(dir)
    await store.request(
      "storage.write",
      { key: "index", data: "YQ==" },
      100,
      active
    )
    const snapshot = (await store.request(
      "storage.readVersioned",
      { key: "index" },
      100,
      active
    )) as { version: string }
    let entered!: () => void, release!: () => void
    const arrived = new Promise<void>((r) => {
        entered = r
      }),
      gate = new Promise<void>((r) => {
        release = r
      })
    const rename = fs.rename.bind(fs)
    let first = true
    vi.spyOn(fs, "rename").mockImplementation(async (...args) => {
      if (first) {
        first = false
        entered()
        await gate
      }
      return rename(...args)
    })
    const cas = store.request(
      "storage.compareAndWrite",
      { key: "index", expectedVersion: snapshot.version, data: "Yg==" },
      100,
      active
    )
    await arrived
    let settled = false
    const legacy = other
      .request(
        method,
        {
          key: "index",
          ...(method === "storage.write" ? { data: "Yw==" } : {}),
        },
        100,
        active
      )
      .then(() => {
        settled = true
      })
    await new Promise((r) => setTimeout(r, 10))
    expect(settled).toBe(false)
    release()
    await expect(cas).resolves.toMatchObject({ applied: true })
    await legacy
    expect(
      await store.request("storage.read", { key: "index" }, 100, active)
    ).toBe(method === "storage.write" ? "Yw==" : null)
  }
)
async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-storage-"))
  directories.push(dir)
  return { dir, store: new PluginStorage(dir) }
}
const active = () => {}
it("persists binary objects across restarts and treats path-like keys as opaque", async () => {
  const { dir, store } = await fixture()
  await store.request(
    "storage.write",
    { key: "../tile", data: "AP8B" },
    10,
    active
  )
  expect(
    await new PluginStorage(dir).request(
      "storage.read",
      { key: "../tile" },
      10,
      active
    )
  ).toBe("AP8B")
  expect(
    await store.request("storage.list", { prefix: "../" }, 10, active)
  ).toEqual([{ key: "../tile", size: 3 }])
  expect(await fs.readdir(dir)).toHaveLength(1)
})
it("serializes writes for quota accounting and permits overwrite and delete", async () => {
  const { store } = await fixture()
  const results = await Promise.allSettled(
    ["a", "b"].map((key) =>
      store.request("storage.write", { key, data: "AP8B" }, 4, active)
    )
  )
  expect(results.map((v) => v.status)).toEqual(["fulfilled", "rejected"])
  await store.request("storage.write", { key: "a", data: "AA==" }, 4, active)
  await store.request("storage.write", { key: "b", data: "AP8B" }, 4, active)
  await store.request("storage.delete", { key: "a" }, 4, active)
  expect(
    await store.request("storage.read", { key: "a" }, 4, active)
  ).toBeNull()
})
it("rejects malformed bytes and revoked operations", async () => {
  const { store } = await fixture()
  await expect(
    store.request("storage.write", { key: "a", data: "?!" }, 4, active)
  ).rejects.toThrow("encoding")
  await expect(
    store.request("storage.write", { key: "a", data: "AA==" }, 4, () => {
      throw new Error("revoked")
    })
  ).rejects.toThrow("revoked")
  expect(
    await store.request("storage.list", { prefix: "" }, 4, active)
  ).toEqual([])
})
