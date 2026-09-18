import { afterEach, expect, it, vi } from "vitest"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { createHash } from "node:crypto"
import {
  PluginRegistry,
  parsePluginRegistry,
  registryDownload,
} from "./plugin-registry"

const entry = {
  id: "test.map",
  name: "Map",
  description: "Map",
  repo: "eidos-space/map",
  version: "1.0.0",
  tag: "v1.0.0",
  asset: "test.map-1.0.0.eidos-plugin",
  sha256: "a".repeat(64),
  preview: true,
  compatibility: "Preview",
}
const dirs: string[] = []
async function directory() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "registry-test-"))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))
  )
})
it("rejects duplicate IDs and unsafe repository paths", () => {
  expect(() =>
    parsePluginRegistry({ schemaVersion: 1, plugins: [entry, entry] })
  ).toThrow()
  expect(() =>
    parsePluginRegistry({
      schemaVersion: 1,
      plugins: [{ ...entry, repo: "../map" }],
    })
  ).toThrow()
})
it("bounds downloads and refuses off-domain redirects", async () => {
  await expect(
    registryDownload(
      "https://github.com/a/b",
      1,
      vi.fn(async () => new Response("xx"))
    )
  ).rejects.toThrow("too large")
  const fetcher = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.test/file" },
      })
  )
  await expect(
    registryDownload("https://github.com/a/b", 100, fetcher)
  ).rejects.toThrow("Untrusted")
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it("retains an offline catalog but refuses offline installs", async () => {
  const dir = await directory()
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ schemaVersion: 1, plugins: [entry] })
    )
    .mockRejectedValue(new Error("offline"))
  const registry = new PluginRegistry(dir, fetcher)
  expect((await registry.list()).cached).toBe(false)
  expect((await registry.list(true)).cached).toBe(true)
  expect((await new PluginRegistry(dir, fetcher).list()).plugins[0].id).toBe(
    entry.id
  )
  await expect(registry.download(entry.id)).rejects.toThrow("Connect")
})
it("checks both checksum and manifest identity", async () => {
  const bytes = gzipSync(
    JSON.stringify({
      format: 1,
      manifest: {
        apiVersion: 1,
        id: "test.map",
        name: "Map",
        version: "1.0.0",
        extension: "./main.js",
        formatters: [{ id: "format", title: "Format", extensions: [".md"] }],
      },
      modules: { "./main.js": "export default function() {}" },
    })
  )
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  let item = { ...entry, sha256 }
  const fetcher = vi.fn<typeof fetch>(async (url) =>
    String(url).includes("raw.githubusercontent")
      ? Response.json({ schemaVersion: 1, plugins: [item] })
      : new Response(bytes)
  )
  const registry = new PluginRegistry(await directory(), fetcher)
  expect(Buffer.from(await registry.download(entry.id))).toEqual(bytes)
  item = { ...entry }
  await expect(registry.download(entry.id)).rejects.toThrow("checksum")
  item = {
    ...entry,
    sha256,
    id: "test.other",
    asset: "test.other-1.0.0.eidos-plugin",
  }
  await expect(registry.download(item.id)).rejects.toThrow("identity")
})
