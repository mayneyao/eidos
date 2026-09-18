import { afterEach, expect, it } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { PluginStorage } from "./plugin-storage"
const directories: string[] = []
afterEach(async () => {
  for (const dir of directories.splice(0))
    await fs.rm(dir, { recursive: true, force: true })
})
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
  await store.request("storage.remove", { key: "a" }, 4, active)
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
