import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { gzipSync } from "node:zlib"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { encodePackage, packageHash } from "@eidos.space/plugin-runtime/package"
import { Scope } from "@eidos.space/plugin-runtime/lifecycle"
import type { PluginManifest } from "@eidos.space/plugin-sdk"
import { PluginStore } from "./plugin-store"

const manifest: PluginManifest = {
  apiVersion: 1,
  requires: { pluginApi: "2.0.0" },
  id: "example.csv",
  name: "CSV",
  version: "1.0.0",
  views: [{ id: "csv", title: "CSV", context: "document", entry: "./csv.ts" }],
  placements: [{ location: "file/open", view: "csv", extensions: [".csv"] }],
}
const bytes = (version = "1.0.0") =>
  encodePackage(
    { ...manifest, version },
    { "./csv.ts": "export default function mount() {}" }
  )
it("preserves the installed version when an update requires a newer API", async () => {
  const hash = await store.install(bytes(), "a")
  const before = await store.config()
  await expect(
    store.install(
      encodePackage(
        { ...manifest, version: "2.0.0", requires: { pluginApi: "2.0.1" } },
        { "./csv.ts": "export default function mount() {}" }
      ),
      "a"
    )
  ).rejects.toThrow("requires plugin API 2.0.1")
  expect(await store.config()).toEqual(before)
  expect((await store.read(hash)).manifest.version).toBe("1.0.0")
})
let directory: string
let store: PluginStore
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-catalog-"))
  store = new PluginStore(directory)
})
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

it("persists validated plugin settings per Space", async () => {
  await store.install(
    encodePackage(
      {
        ...manifest,
        settings: {
          folder: { type: "string", title: "Folder", default: "Journals" },
          style: {
            type: "string",
            title: "Style",
            default: "flat",
            enum: ["flat", "year"],
          },
        },
      },
      { "./csv.ts": "export default function mount() {}" }
    ),
    "a"
  )
  expect(await store.pluginSettings("a", manifest.id)).toEqual({
    folder: "Journals",
    style: "flat",
  })
  await store.setPluginSetting("a", manifest.id, "folder", "Diary")
  await store.setPluginSetting("a", manifest.id, "style", "year")
  await expect(
    store.setPluginSetting("a", manifest.id, "style", "unknown")
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" })
  const restarted = new PluginStore(directory)
  expect(await restarted.pluginSettings("a", manifest.id)).toEqual({
    folder: "Diary",
    style: "year",
  })
  await restarted.enable(manifest.id, true, "b")
  expect(await restarted.pluginSettings("b", manifest.id)).toEqual({
    folder: "Journals",
    style: "flat",
  })
  await restarted.setPluginSetting("a", manifest.id, "folder", null)
  expect((await restarted.pluginSettings("a", manifest.id)).folder).toBe(
    "Journals"
  )
})

it("installs once without implicitly enabling existing or future Spaces", async () => {
  const hash = await store.install(bytes())
  expect((await store.list()).plugins).toMatchObject([{ hash, enabled: false }])
  expect((await store.list()).space).toBeNull()
  expect(await store.editors("data.csv", "a")).toEqual([])
  await store.enable(manifest.id, true, "a")
  expect(await store.editors("data.csv", "a")).toHaveLength(1)
  expect(await store.editors("data.csv", "b")).toEqual([])
  const config = await store.config()
  expect(config.installed).toEqual({ [manifest.id]: { hash } })
  expect(config.spaces.a.plugins[manifest.id]).toEqual({ enabled: true })
  expect("global" in config).toBe(false)
})

it("selects one standalone theme for the device and clears it on uninstall", async () => {
  const theme: PluginManifest = {
    apiVersion: 1,
    kind: "theme",
    id: "example.paper",
    name: "Paper",
    version: "1.0.0",
    requires: { pluginApi: "1.6.0" },
    theme: {
      stylesheet:
        ':root[data-theme="light"] { --theme-surface: #fffaf5; }\n' +
        ':root[data-theme="dark"] { --theme-surface: #211d1b; }',
    },
  }
  await store.install(encodePackage(theme, {}), "a")
  expect((await store.list("a")).plugins[0].enabled).toBe(false)
  expect((await store.config()).spaces.a?.plugins[theme.id]).toBeUndefined()
  await expect(store.enable(theme.id, true, "a")).rejects.toThrow(
    "theme picker"
  )
  await store.install(bytes(), "a")
  await expect(store.selectTheme(manifest.id)).rejects.toThrow("not a theme")
  await store.selectTheme(theme.id)
  const restarted = new PluginStore(directory)
  expect((await restarted.list("b")).activeThemeId).toBe(theme.id)
  expect((await restarted.list("b")).plugins[0].enabled).toBe(true)
  await restarted.uninstall(theme.id)
  expect((await restarted.list()).activeThemeId).toBeNull()
})

it("keeps incompatible plugins manageable after downgrading the host", async () => {
  await store.install(bytes(), "a")
  const future = encodePackage(
    { ...manifest, requires: { pluginApi: "3.0.0" } },
    { "./csv.ts": "export default function mount() {}" }
  )
  const hash = packageHash(future)
  await fs.writeFile(
    path.join(directory, "packages", `${hash}.eidos-plugin`),
    future
  )
  const config = await store.config()
  config.installed[manifest.id] = { hash }
  await fs.writeFile(
    path.join(directory, "config.json"),
    JSON.stringify(config)
  )
  const restarted = new PluginStore(directory)
  expect((await restarted.list("a")).plugins[0]).toMatchObject({
    enabled: false,
    hash,
  })
  expect(await restarted.editors("data.csv", "a")).toEqual([])
  await expect(restarted.read(hash)).rejects.toThrow("requires plugin API")
  await expect(restarted.enable(manifest.id, true, "a")).rejects.toThrow(
    "requires plugin API"
  )
  await restarted.uninstall(manifest.id)
  expect((await restarted.list("a")).plugins).toEqual([])
})

it("keeps the plugin list usable when an installed theme has the removed manifest format", async () => {
  await store.install(bytes(), "a")
  const id = "example.old-theme"
  const oldTheme = gzipSync(
    Buffer.from(
      JSON.stringify({
        format: 2,
        manifest: {
          apiVersion: 1,
          kind: "theme",
          id,
          name: "Old Theme",
          version: "0.1.0",
          requires: { pluginApi: "1.6.0" },
          theme: {
            light: { "--theme-surface": "#fff" },
            dark: { "--theme-surface": "#111" },
          },
        },
        modules: {},
      })
    )
  )
  const hash = packageHash(oldTheme)
  await fs.writeFile(
    path.join(directory, "packages", `${hash}.eidos-plugin`),
    oldTheme
  )
  const config = await store.config()
  config.installed[id] = { hash }
  config.activeThemeId = id
  await fs.writeFile(
    path.join(directory, "config.json"),
    JSON.stringify(config)
  )

  const listing = await new PluginStore(directory).list("a")
  expect(listing.plugins).toHaveLength(2)
  expect(
    listing.plugins.find((plugin) => plugin.manifest.id === manifest.id)
  ).toMatchObject({ enabled: true })
  expect(
    listing.plugins.find((plugin) => plugin.manifest.id === id)
  ).toMatchObject({ enabled: false, unavailable: true })
  expect(listing.activeThemeId).toBeNull()
  await expect(new PluginStore(directory).read(hash)).rejects.toThrow(
    "Unknown or missing fields"
  )
  await store.install(
    encodePackage(
      {
        apiVersion: 1,
        kind: "theme",
        id,
        name: "Old Theme",
        version: "0.2.0",
        requires: { pluginApi: "1.6.0" },
        theme: {
          stylesheet:
            ':root[data-theme="light"] { --theme-surface: #fff; }\n' +
            ':root[data-theme="dark"] { --theme-surface: #111; }',
        },
      },
      {}
    )
  )
  const repaired = await store.list("a")
  expect(repaired.activeThemeId).toBe(id)
  const repairedTheme = repaired.plugins.find(
    (plugin) => plugin.manifest.id === id
  )
  expect(repairedTheme?.enabled).toBe(true)
  expect(repairedTheme?.unavailable).toBeUndefined()
  await store.uninstall(id)
  expect((await store.list("a")).plugins).toHaveLength(1)
})

it("discovers editors from verified metadata without repeatedly parsing bundles", async () => {
  await store.install(bytes(), "a")
  const restarted = new PluginStore(directory)
  const read = vi.spyOn(restarted, "read")
  await Promise.all([restarted.list("a"), restarted.editors("data.csv", "a")])
  expect(read).toHaveBeenCalledTimes(1)
  await restarted.editors("other.csv", "a")
  await restarted.list("a")
  expect(read).toHaveBeenCalledTimes(1)
  await restarted.enable(manifest.id, false, "a")
  expect(await restarted.editors("other.csv", "a")).toEqual([])
  await restarted.install(bytes("2.0.0"), "a")
  expect((await restarted.list("a")).plugins[0].manifest.version).toBe("2.0.0")
  expect(read).toHaveBeenCalledTimes(1)
})

it("still rejects modified package bytes at execution reads after warming metadata", async () => {
  const hash = await store.install(bytes(), "a")
  await store.editors("data.csv", "a")
  await fs.writeFile(
    path.join(directory, "packages", `${hash}.eidos-plugin`),
    "corrupt"
  )
  await expect(store.read(hash)).rejects.toThrow("integrity check failed")
})

it("reuses validated code only when the bytes still match the installed hash", async () => {
  const hash = await store.install(bytes(), "a")
  const first = await store.read(hash)
  expect(await store.read(hash)).toBe(first)
  await fs.writeFile(
    path.join(directory, "packages", `${hash}.eidos-plugin`),
    bytes("2.0.0")
  )
  await expect(store.read(hash)).rejects.toThrow("integrity check failed")
})

it("does not enable another Space when reinstalling a shared package", async () => {
  const first = await store.install(bytes(), "a")
  const second = await store.install(bytes(), "b")
  expect(first).toBe(second)
  expect(await fs.readdir(path.join(directory, "packages"))).toEqual([
    `${first}.eidos-plugin`,
  ])
  expect((await store.list("a")).plugins).toHaveLength(1)
  expect((await store.list("b")).plugins[0].enabled).toBe(false)
  expect((await store.list("new")).plugins[0].enabled).toBe(false)
})

it("updates the shared version while preserving enablement and routes after restart", async () => {
  await store.install(bytes(), "a")
  await store.enable(manifest.id, true, "b")
  await store.enable(manifest.id, false, "c")
  await store.setPageRoute("a", "example.csv/page", "one")
  await store.setPageRoute("b", "example.csv/page", "two")
  const hash = await store.install(bytes("2.0.0"), "c")
  const restarted = new PluginStore(directory)
  expect(await restarted.binding(manifest.id, "a")).toEqual({
    hash,
    enabled: true,
  })
  expect(await restarted.binding(manifest.id, "b")).toEqual({
    hash,
    enabled: true,
  })
  expect(await restarted.binding(manifest.id, "c")).toEqual({
    hash,
    enabled: false,
  })
  expect(await restarted.binding(manifest.id, "new")).toEqual({
    hash,
    enabled: false,
  })
  expect(await restarted.pageRoute("a", "example.csv/page")).toBe("one")
  expect(await restarted.pageRoute("b", "example.csv/page")).toBe("two")
})

it("isolates default editors and disabling a plugin leaves another Space available", async () => {
  await store.install(bytes(), "a")
  await store.enable(manifest.id, true, "b")
  await store.associate(".csv", "example.csv/csv", "a")
  expect((await store.resolve("data.csv", "a")).editor?.key).toBe(
    "example.csv/csv"
  )
  expect((await store.resolve("data.csv", "b")).editor).toBeNull()
  await store.enable(manifest.id, false, "a")
  expect(await store.resolve("data.csv", "a")).toMatchObject({
    editor: null,
    warning: expect.any(String),
  })
  expect(await store.editors("data.csv", "b")).toHaveLength(1)
  await expect(
    store.resolve("data.csv", "a", "example.csv/csv")
  ).rejects.toMatchObject({ code: "DOCUMENT_UNAVAILABLE" })
})

it("uninstalls from all Spaces and does not resurrect grants or enablement on reinstall", async () => {
  await store.install(bytes(), "a")
  await store.enable(manifest.id, true, "b")
  const resource = {
    kind: "text" as const,
    title: "Notes",
    access: ["read" as const],
  }
  await store.resources.bind("a", manifest.id, "notes", "notes.md", resource)
  await store.resources.bind("b", manifest.id, "notes", "work.md", resource)
  const lease = await store.resources.acquire(
    "a",
    manifest.id,
    "notes",
    resource,
    new Scope()
  )
  await store.associate(".csv", "example.csv/csv", "a")
  await store.uninstall(manifest.id)
  expect(lease.signal.aborted).toBe(true)
  expect((await store.list("a")).plugins).toEqual([])
  expect((await store.config()).spaces.a.associations).toEqual({})
  await store.install(bytes())
  const restarted = new PluginStore(directory)
  for (const spaceId of ["a", "b"]) {
    expect((await restarted.binding(manifest.id, spaceId))?.enabled).toBe(false)
    await expect(
      restarted.resources.acquire(
        spaceId,
        manifest.id,
        "notes",
        resource,
        new Scope()
      )
    ).rejects.toMatchObject({ code: "RESOURCE_UNBOUND" })
  }
})

it("rejects enabling missing plugins or managing defaults without a Space", async () => {
  await expect(store.enable(manifest.id, true, "a")).rejects.toThrow(
    /not installed/
  )
  await store.install(bytes())
  await expect(store.enable(manifest.id, true, "")).rejects.toThrow(/Space/)
  await expect(store.associate(".csv", "builtin", "")).rejects.toThrow(/Space/)
})

it("manages global file associations without a Space and resolves fallback", async () => {
  await store.install(bytes(), "space-a")
  await store.associate(".csv", "example.csv/csv")
  expect((await store.config()).associations).toEqual({
    ".csv": "example.csv/csv",
  })
  expect((await store.list()).associations).toEqual({
    ".csv": "example.csv/csv",
  })

  expect((await store.resolve("data.csv", "space-a")).editor?.key).toBe(
    "example.csv/csv"
  )

  await store.associate(".csv", null)
  expect((await store.config()).associations).toEqual({})
  expect((await store.resolve("data.csv", "space-a")).editor).toBeNull()
})

it("distinguishes view icon from plugin logo and falls back to manifest icon", async () => {
  const customViewIconPkg = encodePackage(
    {
      apiVersion: 1,
      requires: { pluginApi: "2.0.0" },
      id: "example.mindmap",
      name: "Mindmap Plugin",
      version: "1.0.0",
      icon: { paths: ["M12 2L2 7l10 5 10-5-10-5z"] },
      views: [
        {
          id: "map",
          title: "Mindmap View",
          context: "document",
          entry: "./map.ts",
          icon: { paths: ["M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"] },
        },
        {
          id: "outline",
          title: "Outline View",
          context: "document",
          entry: "./map.ts",
        },
      ],
      placements: [
        { location: "file/open", view: "map", extensions: [".md"] },
        { location: "file/open", view: "outline", extensions: [".md"] },
      ],
    },
    { "./map.ts": "export default function mount() {}" }
  )

  await store.install(customViewIconPkg, "space-1")
  const choices = await store.editors("test.md", "space-1")
  expect(choices).toHaveLength(2)

  const mapChoice = choices.find((c) => c.key === "example.mindmap/map")
  expect(mapChoice?.icon).toEqual({
    paths: ["M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"],
  })

  const outlineChoice = choices.find((c) => c.key === "example.mindmap/outline")
  expect(outlineChoice?.icon).toEqual({
    paths: ["M12 2L2 7l10 5 10-5-10-5z"],
  })
})
