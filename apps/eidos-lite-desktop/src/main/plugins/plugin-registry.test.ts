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
  preview: false,
  compatibility: "Requires Eidos Lite",
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
it("accepts published themes and rejects mismatched theme metadata", () => {
  const { preview: _preview, ...withoutPreview } = entry
  expect(
    parsePluginRegistry({
      schemaVersion: 1,
      plugins: [{ ...withoutPreview, category: "themes", kind: "theme" }],
    })[0]
  ).toMatchObject({ id: entry.id, kind: "theme", preview: false })
  for (const plugin of [
    { ...withoutPreview, category: "themes" },
    { ...withoutPreview, category: "other", kind: "theme" },
    { ...withoutPreview, preview: true },
  ]) {
    expect(() =>
      parsePluginRegistry({ schemaVersion: 1, plugins: [plugin] })
    ).toThrow("Invalid registry identity")
  }
})
it("accepts valid screenshots and rejects invalid screenshot metadata", () => {
  const valid = parsePluginRegistry({
    schemaVersion: 1,
    plugins: [
      {
        ...entry,
        screenshots: [
          { path: "screenshots/overview.png", alt: "Overview" },
          { path: "assets/preview.webp", alt: "Preview" },
        ],
      },
    ],
  })
  expect(valid[0].screenshots).toEqual([
    { path: "screenshots/overview.png", alt: "Overview" },
    { path: "assets/preview.webp", alt: "Preview" },
  ])

  for (const badScreenshots of [
    "not-an-array",
    Array.from({ length: 9 }, (_, i) => ({
      path: `screenshots/${i}.png`,
      alt: `Shot ${i}`,
    })),
    [{ path: "../evil.png", alt: "Traversal" }],
    [{ path: "screenshots/evil.exe", alt: "Bad extension" }],
    [{ path: "screenshots/overview.png", alt: "" }],
    [{ path: "screenshots/overview.png", alt: "bad\u0000alt" }],
    [null],
  ]) {
    expect(() =>
      parsePluginRegistry({
        schemaVersion: 1,
        plugins: [{ ...entry, screenshots: badScreenshots }],
      })
    ).toThrow()
  }
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
  let item: typeof entry & { category?: string; kind?: string } = {
    ...entry,
    sha256,
  }
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
  item = { ...entry, sha256, category: "themes", kind: "theme" }
  await expect(registry.download(item.id)).rejects.toThrow("kind")
})

it("fetches and caches plugin README markdown from GitHub", async () => {
  const dir = await directory()
  const fetcher = vi.fn<typeof fetch>(async (url) => {
    const target = String(url)
    if (target.includes("plugins.registry.json")) {
      return Response.json({ schemaVersion: 1, plugins: [entry] })
    }
    if (target.includes("main/README.md")) {
      return new Response("# Map Documentation\n\nSample readme.")
    }
    return new Response(null, { status: 404 })
  })
  const registry = new PluginRegistry(dir, fetcher)
  const readme = await registry.readme(entry.id)
  expect(readme).toBe("# Map Documentation\n\nSample readme.")

  // Verify cached on disk
  const cachedFile = path.join(dir, "readme", `${entry.id}.md`)
  expect(await fs.readFile(cachedFile, "utf8")).toBe(
    "# Map Documentation\n\nSample readme."
  )

  // Verify offline read from cache
  const offlineFetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("offline"))
  const offlineRegistry = new PluginRegistry(dir, offlineFetcher)
  expect(await offlineRegistry.readme(entry.id)).toBe(
    "# Map Documentation\n\nSample readme."
  )
})
