import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { encodePackage } from "@eidos.space/plugin-runtime/package"
import type {
  FileStat,
  PluginManifest,
  TextSnapshot,
} from "@eidos.space/plugin-sdk"
import { PluginStore } from "./plugin-store"
import { PluginService, type PluginDocumentSession } from "./plugin-service"
import { readTextFilePreview, saveTextFile } from "../space/text-file-preview"
const manifest: PluginManifest = {
  apiVersion: 1,
  requires: { pluginApi: "2.0.0" },
  id: "example.csv",
  name: "CSV",
  version: "1.0.0",
  views: [
    {
      id: "table",
      title: "Table",
      context: "document",
      entry: "./main.ts",
      access: "write",
    },
  ],
  placements: [{ location: "file/open", view: "table", extensions: [".csv"] }],
}
const modules = {
  "./main.ts":
    "export default function mount(ctx, root) { root.textContent = 'CSV' }",
}
let directory: string,
  root: string,
  store: PluginStore,
  service: PluginService,
  session: PluginDocumentSession,
  markdownWatchers: Map<string, Set<() => void>>,
  sequence = 0
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-plugin-test-"))
  root = path.join(directory, "space")
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, "data.csv"), "name,value\na,1\n")
  store = new PluginStore(path.join(directory, "plugins"))
  service = new PluginService(store)
  markdownWatchers = new Map()
  session = {
    canonical: { id: "space-a" },
    previewTextFile: (file) => readTextFilePreview(root, file),
    saveTextFile: (request) => saveTextFile(root, request),
    readTextFile: async (file: string) => {
      const target = path.join(root, file)
      return await fs.readFile(target, "utf8")
    },
    writeTextFile: async (file: string, content: string) => {
      const target = path.join(root, file)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content, "utf8")
    },
    readBinaryFile: async (file: string) => {
      const target = path.join(root, file)
      return await fs.readFile(target)
    },
    writeBinaryFile: async (file: string, data: Uint8Array) => {
      const target = path.join(root, file)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, data)
    },
    deleteFile: async (file: string) => {
      const target = path.join(root, file)
      await fs.rm(target, { force: true })
    },
    renameFile: async (oldFile: string, newFile: string) => {
      const from = path.join(root, oldFile)
      const to = path.join(root, newFile)
      await fs.mkdir(path.dirname(to), { recursive: true })
      await fs.rename(from, to)
    },
    statFile: async (file: string) => {
      const target = path.join(root, file)
      try {
        const stat = await fs.stat(target)
        return {
          path: file,
          name: path.basename(file),
          extension: path.extname(file),
          size: stat.size,
          isDirectory: stat.isDirectory(),
        }
      } catch {
        return null
      }
    },
    listFiles: async (folder: string, options?: { extensions?: string[] }) => {
      const target = folder ? path.join(root, folder) : root
      const entries = await fs
        .readdir(target, { withFileTypes: true })
        .catch(() => [])
      const results: FileStat[] = []
      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name)
          if (!options?.extensions || options.extensions.includes(ext)) {
            const stat = await fs.stat(path.join(target, entry.name))
            const rel = folder ? `${folder}/${entry.name}` : entry.name
            results.push({
              path: rel,
              name: entry.name,
              extension: ext,
              size: stat.size,
              isDirectory: false,
            })
          }
        }
      }
      return results
    },
    watchFiles: (folder: string, listener: () => void) => {
      const listeners = markdownWatchers.get(folder) ?? new Set()
      listeners.add(listener)
      markdownWatchers.set(folder, listeners)
      return { dispose: () => listeners.delete(listener) }
    },
    previewMediaFile: async (file, identifier) => {
      let target = file
      if (identifier) {
        const dir = path.dirname(file)
        const base = path.parse(file).name
        const rootBase = base.split(".")[0]!
        let name = identifier.startsWith(".")
          ? `${base}${identifier}`
          : identifier
        let candidate = dir === "." ? name : `${dir}/${name}`
        const exists = await fs
          .stat(path.join(root, candidate))
          .catch(() => null)
        if (!exists && identifier.startsWith(".")) {
          name = `${rootBase}${identifier}`
          candidate = dir === "." ? name : `${dir}/${name}`
        }
        target = candidate
      } else if (!file.endsWith(".mp4") && !file.endsWith(".mov")) {
        const dir = path.dirname(file)
        const base = path.parse(file).name
        const rootBase = base.split(".")[0]!
        target = dir === "." ? `${rootBase}.mp4` : `${dir}/${rootBase}.mp4`
      }
      return {
        path: target,
        name: path.basename(target),
        baseName: path.parse(target).name,
        extension: path.extname(target),
        mimeType: "video/mp4",
        size: (await fs.stat(path.join(root, target))).size,
        previewUrl: `eidos-space-media://preview/test-${target}`,
      }
    },
    readSidecarText: async (file, extOrName) => {
      const dir = path.dirname(file)
      const base = path.parse(file).name
      const rootBase = base.split(".")[0]!
      const candidates = extOrName.startsWith(".")
        ? [`${base}${extOrName}`, `${rootBase}${extOrName}`]
        : [extOrName]
      for (const name of candidates) {
        const rel = dir === "." ? name : `${dir}/${name}`
        try {
          const text = await fs.readFile(path.join(root, rel), "utf8")
          return { text, path: rel }
        } catch {}
      }
      return null
    },
    listSidecars: async (file, extensions) => {
      const dir = path.dirname(file)
      const base = path.parse(file).name
      const rootBase = base.split(".")[0]!
      const fullDir = path.join(root, dir === "." ? "" : dir)
      const files = await fs.readdir(fullDir).catch(() => [])
      const results: Array<{
        name: string
        path: string
        extension: string
        size: number
      }> = []
      for (const f of files) {
        if (
          (f.startsWith(`${base}.`) || f.startsWith(`${rootBase}.`)) &&
          f !== path.basename(file)
        ) {
          const ext = path.extname(f)
          if (!extensions || extensions.includes(ext)) {
            const stat = await fs.stat(path.join(fullDir, f))
            results.push({
              name: f,
              path: dir === "." ? f : `${dir}/${f}`,
              extension: ext,
              size: stat.size,
            })
          }
        }
      }
      return results
    },
  }
  await store.install(encodePackage(manifest, modules), "space-a")
})
afterEach(async () => {
  service.closeOwner(1)
  await fs.rm(directory, { recursive: true, force: true })
})
const rpc = (
  ticket: string,
  method: string,
  params: unknown = null,
  owner = 1,
  boundSession = session
) =>
  service.request(owner, boundSession, ticket, {
    protocol: "eidos-plugin",
    apiVersion: 1,
    id: String(++sequence),
    method,
    params,
  })
const open = async () =>
  (await service.open(1, session, "data.csv", "example.csv/table")).instance!
    .ticket

it("opens Eidos views without text access and scopes config writes to writable instances", async () => {
  for (const access of ["read", "write"] as const) {
    const id = `example.${access}`
    const file: PluginManifest = {
      ...manifest,
      id,
      views: [{ ...manifest.views![0]!, context: "eidos", access }],
      connections: {
        generator: {
          title: "Generator",
          url: "https://example.com/v1/chat/completions",
          configurable: true,
        },
        fixed: { title: "Fixed", url: "https://example.com/v1" },
      },
      placements: [
        { location: "file/open", view: "table", extensions: [".eidos"] },
      ],
    }
    await store.install(encodePackage(file, modules), "space-a")
    const result = await service.open(1, session, "test.eidos", `${id}/table`)
    const ticket = result.instance!.ticket
    expect(
      (await service.connectionAccess(1, session, ticket, "generator"))
        .configurable
    ).toBe(true)
    await expect(
      service.connectionAccess(1, session, ticket, "fixed")
    ).rejects.toThrow(/configurable/)
    await expect(
      service.connectionAccess(2, session, ticket, "generator")
    ).rejects.toThrow()
    expect(service.instances.get(ticket)?.document).toBeUndefined()
    expect((await rpc(ticket, "eidos.tables")).response).toHaveProperty(
      "result"
    )
    expect(
      (
        await rpc(ticket, "eidos.pluginConfig.write", {
          tableId: "a",
          value: null,
          expectedVersion: "v",
        })
      ).response
    ).toHaveProperty(access === "write" ? "result" : "error")
    expect((await rpc(ticket, "document.read")).response).toHaveProperty(
      "error"
    )
    expect((await rpc(ticket, "table.read")).response).toHaveProperty("error")
    expect(
      (await rpc(ticket, "eidos.tables", null, 2)).response
    ).toHaveProperty("error")
  }
  expect((await store.editors("test.eidos", "space-a")).length).toBe(2)
  const text = await open()
  expect((await rpc(text, "eidos.tables")).response).toHaveProperty("error")
})

it("binds table action instances and credential authority to the live Space and package", async () => {
  const plugin: PluginManifest = {
    apiVersion: 1,
    requires: { pluginApi: "2.0.0" },
    id: "example.smart",
    name: "Smart",
    version: "1.0.0",
    extension: "./extension.ts",
    actions: [
      { id: "smart", title: "Smart", context: "table", access: "write" },
    ],
    placements: [{ location: "table/context", action: "smart" }],
    connections: {
      model: { title: "Model", url: "https://api.example.com/v1" },
    },
  }
  await store.install(
    encodePackage(plugin, {
      "./extension.ts": "export default function activate() {}",
    }),
    "space-a"
  )
  const bound = (
    await service.openExtension(1, session, plugin.id, {
      tableId: "table-a",
      viewId: "view-a",
    })
  ).instance!
  const other = (
    await service.openExtension(1, session, plugin.id, {
      tableId: "table-b",
      viewId: "view-b",
    })
  ).instance!
  expect(other.ticket).not.toBe(bound.ticket)
  expect(service.instances.get(bound.ticket)?.table?.tableId).toBe("table-a")
  const access = await service.connectionAccess(
    1,
    session,
    bound.ticket,
    "model"
  )
  expect(access.scope).toEqual([
    "space-a",
    plugin.id,
    "model",
    "https://api.example.com/v1",
  ])
  await expect(
    service.connectionAccess(2, session, bound.ticket, "model")
  ).rejects.toThrow()
  await expect(
    service.connectionAccess(1, session, bound.ticket, "unknown")
  ).rejects.toThrow()
  const workspace = (await service.openExtension(1, session, plugin.id))
    .instance!
  expect(
    (await rpc(workspace.ticket, "table.actions.ready", { providers: ["run"] }))
      .response
  ).toHaveProperty("result")
  expect((await rpc(workspace.ticket, "table.read")).response).toHaveProperty(
    "error"
  )
  await expect(
    service.connectionAccess(1, session, workspace.ticket, "model")
  ).rejects.toThrow()
  expect(
    (
      await service.connectionAccess(
        1,
        session,
        workspace.ticket,
        "model",
        true
      )
    ).scope
  ).toEqual(access.scope)
  await expect(
    service.connectionAccess(2, session, workspace.ticket, "model", true)
  ).rejects.toThrow()
  service.close(1, bound.ticket)
  expect(access.signal.aborted).toBe(true)
  await expect(
    service.connectionAccess(1, session, bound.ticket, "model")
  ).rejects.toThrow()
})
async function read(ticket: string): Promise<TextSnapshot> {
  const response = (await rpc(ticket, "document.read")).response
  if (!("result" in response)) throw Error(response.error.message)
  return response.result as TextSnapshot
}
describe("Lite document-view integration", () => {
  it("gates device storage on the manifest, current revision and owning instance", async () => {
    const ticket = await open()
    expect(
      (await rpc(ticket, "storage.list", { prefix: "" })).response
    ).toMatchObject({ error: { code: "PERMISSION_DENIED" } })
    service.closeOwner(1)
    await store.install(
      encodePackage({ ...manifest, storage: { maxBytes: 100 } }, modules),
      "space-a"
    )
    const granted = await open()
    expect(
      (await rpc(granted, "storage.write", { key: "sprite@2x", data: "AP8B" }))
        .response
    ).toMatchObject({ result: null })
    expect(
      (await rpc(granted, "storage.read", { key: "sprite@2x" }, 2)).response
    ).toMatchObject({ error: { code: "INSTANCE_CLOSED" } })
    expect(
      (await rpc(granted, "storage.read", { key: "sprite@2x" })).response
    ).toMatchObject({ result: "AP8B" })
    await store.enable("example.csv", false, "space-a")
    expect(
      (await rpc(granted, "storage.read", { key: "sprite@2x" })).response
    ).toMatchObject({ error: { code: "PERMISSION_DENIED" } })
  })
  it("authorizes table adapters only for live table instances in their owning Space", async () => {
    const tableManifest: PluginManifest = {
      apiVersion: 1,
      requires: { pluginApi: "2.0.0" },
      id: "example.map",
      name: "Map",
      version: "1.0.0",
      views: [
        { id: "map", title: "Map", context: "table", entry: "./main.ts" },
        {
          id: "settings",
          title: "Settings",
          context: "table",
          entry: "./main.ts",
          access: "write",
        },
      ],
      browser: {
        workers: true,
        networkOrigins: ["https://tiles.openfreemap.org"],
      },
    }
    await store.install(encodePackage(tableManifest, modules), "space-a")
    const opened = (
      await service.openPage(1, session, "example.map/map", "", {
        tableId: "table",
        viewId: "view",
      })
    ).instance!
    expect(service.csp(opened.url)).toContain("worker-src blob:")
    const writable = (
      await service.openPage(1, session, "example.map/settings", "", {
        tableId: "table",
        viewId: "view",
      })
    ).instance!
    expect(
      (
        await rpc(writable.ticket, "table.pluginConfig.write", {
          value: {},
          expectedVersion: "null",
        })
      ).response
    ).toHaveProperty("result")
    expect((await rpc(opened.ticket, "table.read")).response).toHaveProperty(
      "result"
    )
    expect(
      (await rpc(opened.ticket, "table.pluginConfig.read")).response
    ).toHaveProperty("result")
    expect(
      (
        await rpc(opened.ticket, "table.pluginConfig.write", {
          value: {},
          expectedVersion: "null",
        })
      ).response
    ).toMatchObject({ error: { code: "PERMISSION_DENIED" } })
    expect((await rpc(await open(), "table.read")).response).toHaveProperty(
      "error.code",
      "PERMISSION_DENIED"
    )
    await store.enable("example.map", false, "space-a")
    expect((await rpc(opened.ticket, "table.read")).response).toHaveProperty(
      "error.code",
      "PERMISSION_DENIED"
    )
    expect(service.html(opened.url)).toBeNull()
  })
  it("applies formatter output once through the host, rejects stale results and exposes no document capability", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.format",
          name: "Format",
          version: "1.0.0",
          extension: "./extension.ts",
          formatters: [{ id: "format", title: "Format", extensions: [".csv"] }],
        },
        { "./extension.ts": "export default function activate() {}" }
      ),
      "space-a"
    )
    const extension = (
      await service.openExtension(1, session, "example.format")
    ).instance!
    await store.setDefaultFormatter(".csv", "example.format/format", "space-a")
    expect(
      (await new PluginStore(store.directory).list("space-a")).space?.formatters
    ).toEqual({ ".csv": "example.format/format" })
    expect((await store.list("space-b")).space?.formatters).toBeUndefined()
    await expect(
      store.setDefaultFormatter(".md", "example.format/format", "space-a")
    ).rejects.toThrow("unavailable")
    await store.setDefaultFormatter(".csv", null, "space-a")
    await rpc(extension.ticket, "extension.ready", {
      actions: [],
      formatters: ["format"],
    })
    const editor = await open()
    const original = await read(editor)
    const start = async (contextVersion?: string) => {
      let announce!: (value: {
        invocation: string
        text: string
        path: string
      }) => void
      const ready = new Promise<{
        invocation: string
        text: string
        path: string
      }>((resolve) => {
        announce = resolve
      })
      const completion = service.invoke(
        1,
        session,
        extension.ticket,
        "format",
        "data.csv",
        undefined,
        (event) => {
          if (event.observation === "formatter.run")
            announce(
              event.value as { invocation: string; text: string; path: string }
            )
        },
        true,
        contextVersion
      )
      void completion.catch(() => {})
      return { value: await ready, completion }
    }
    const first = await start()
    expect(first.value.path).toBe("data.csv")
    expect(first.value.text).toBe(original.text)
    expect(
      await rpc(extension.ticket, "document.save", {
        invocation: first.value.invocation,
        args: null,
      })
    ).toMatchObject({ response: { error: { code: "PERMISSION_DENIED" } } })
    await rpc(extension.ticket, "formatter.complete", {
      invocation: first.value.invocation,
      text: "formatted",
    })
    expect(await first.completion).toMatchObject({
      changed: true,
      draft: { text: "formatted" },
    })
    expect(await fs.readFile(path.join(root, "data.csv"), "utf8")).toBe(
      original.text
    )
    await rpc(editor, "document.undo")
    expect((await read(editor)).text).toBe(original.text)
    await rpc(editor, "document.redo")
    expect((await read(editor)).text).toBe("formatted")
    const second = await start()
    // Native undo/discard can leave a clean workbench while the plugin cache
    // still holds the previous formatted draft.
    expect(second.value.text).toBe(original.text)
    await rpc(editor, "document.edit", {
      text: "new typing",
      expectedVersion: (await read(editor)).version,
    })
    await rpc(extension.ticket, "formatter.complete", {
      invocation: second.value.invocation,
      text: "late formatting",
    })
    await expect(second.completion).rejects.toThrow("Document changed")
    expect((await read(editor)).text).toBe("new typing")
    const noop = await start()
    expect(noop.value.text).toBe(original.text)
    const version = (await read(editor)).version
    await rpc(extension.ticket, "formatter.complete", {
      invocation: noop.value.invocation,
      text: noop.value.text,
    })
    expect(await noop.completion).toMatchObject({ changed: false })
    expect((await read(editor)).version).toBe(version)
    await expect(
      service.invoke(
        1,
        session,
        extension.ticket,
        "format",
        "bad.md",
        undefined,
        () => {},
        true
      )
    ).rejects.toThrow("does not match")
    service.setFormatterContext(1, session, "data.csv", "native-v1")
    const cancelled = await start("native-v1")
    service.setFormatterContext(1, session, "data.csv", "native-v2")
    await expect(cancelled.completion).rejects.toThrow("context changed")
    expect(
      await rpc(extension.ticket, "formatter.complete", {
        invocation: cancelled.value.invocation,
        text: "stale native result",
      })
    ).toMatchObject({ response: { error: { code: "INSTANCE_CLOSED" } } })
    expect((await read(editor)).text).toBe(original.text)
  })
  it("mounts page routes without ambient document authority", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.page",
          name: "Page",
          version: "1.0.0",
          views: [
            { id: "home", title: "Home", context: "page", entry: "./page.ts" },
          ],
          placements: [{ location: "navigation", view: "home" }],
        },
        {
          "./page.ts":
            "export default function mount(ctx, root) { root.textContent = ctx.binding.route }",
        }
      ),
      "space-a"
    )
    const page = (
      await service.openPage(1, session, "example.page/home", "week/42")
    ).instance!
    expect(service.instances.get(page.ticket)!.html).toContain("week/42")
    expect(await rpc(page.ticket, "document.read")).toMatchObject({
      response: { error: { code: "PERMISSION_DENIED" } },
    })
    expect(
      await rpc(page.ticket, "fs.list", { folder: "journals" })
    ).toMatchObject({ response: { error: { code: "PERMISSION_DENIED" } } })
    expect(
      await rpc(page.ticket, "fs.stat", { path: "journals/2026-09-23.md" })
    ).toMatchObject({ response: { error: { code: "PERMISSION_DENIED" } } })
    expect(
      await rpc(page.ticket, "fs.watch", {
        id: "watch",
        path: "journals",
      })
    ).toMatchObject({ response: { error: { code: "PERMISSION_DENIED" } } })
    expect(
      await rpc(page.ticket, "ui.notify", { message: "Hello" })
    ).toMatchObject({ notification: "Hello" })
    expect(
      await rpc(page.ticket, "ui.navigate", {
        viewId: "home",
        route: "week/43",
      })
    ).toMatchObject({
      navigation: { key: "example.page/home", route: "week/43" },
    })
    expect(
      await rpc(page.ticket, "ui.navigate", { viewId: "other.plugin/home" })
    ).toMatchObject({ response: { error: { code: "PERMISSION_DENIED" } } })
    const restarted = new PluginStore(store.directory)
    expect(await restarted.pageRoute("space-a", "example.page/home")).toBe(
      "week/43"
    )
    expect(await restarted.pageRoute("space-b", "example.page/home")).toBe("")
    const reopened = (await service.openPage(1, session, "example.page/home"))
      .instance!
    expect(service.instances.get(reopened.ticket)!.html).toContain("week/43")
    await expect(
      service.openPage(1, session, "example.page/home", "x".repeat(2049))
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" })
  })
  it("lets a page with workspace.files list files, read content, stat files, and open a file", async () => {
    await fs.mkdir(path.join(root, "journals"))
    await fs.writeFile(
      path.join(root, "journals/2026-09-23.md"),
      "first line\n\nsecond line\n"
    )
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.journals",
          name: "Journals",
          version: "1.0.0",
          workspace: { files: true },
          settings: {
            folder: {
              type: "string",
              title: "Journals folder",
              default: "journals",
            },
          },
          views: [
            {
              id: "overview",
              title: "Overview",
              context: "page",
              entry: "./page.ts",
            },
          ],
        },
        { "./page.ts": "export default function mount() {}" }
      ),
      "space-a"
    )
    const page = (
      await service.openPage(1, session, "example.journals/overview")
    ).instance!
    expect(
      (await rpc(page.ticket, "settings.get", { key: "folder" })).response
    ).toMatchObject({ result: "journals" })
    expect(
      (await rpc(page.ticket, "fs.list", { folder: "journals" })).response
    ).toMatchObject({
      result: expect.arrayContaining([
        expect.objectContaining({ path: "journals/2026-09-23.md" }),
      ]),
    })
    expect(
      (
        await rpc(page.ticket, "fs.readText", {
          path: "journals/2026-09-23.md",
        })
      ).response
    ).toMatchObject({
      result: { text: "first line\n\nsecond line\n" },
    })
    expect(
      (
        await rpc(page.ticket, "fs.stat", {
          path: "journals/2026-09-23.md",
        })
      ).response
    ).toMatchObject({
      result: expect.objectContaining({
        path: "journals/2026-09-23.md",
        name: "2026-09-23.md",
        extension: ".md",
      }),
    })
    expect(
      (
        await rpc(page.ticket, "fs.stat", {
          path: ".graft/private.md",
        })
      ).response
    ).toMatchObject({ result: null })
    expect(
      await rpc(page.ticket, "ui.openFile", {
        relativePath: "journals/2026-09-23.md",
      })
    ).toMatchObject({ openFile: "journals/2026-09-23.md" })
    expect(
      (
        await rpc(page.ticket, "ui.openFile", {
          relativePath: "../secret.md",
        })
      ).response
    ).toMatchObject({ error: { code: "INVALID_REQUEST" } })
  })
  it("does not expose write access to a read-only files page", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.read-only-files",
          name: "Read only files",
          version: "1.0.0",
          workspace: { files: { read: true, write: false } },
          views: [
            {
              id: "overview",
              title: "Overview",
              context: "page",
              entry: "./page.ts",
            },
          ],
        },
        { "./page.ts": "export default function mount() {}" }
      ),
      "space-a"
    )
    const page = (
      await service.openPage(1, session, "example.read-only-files/overview")
    ).instance!
    expect(
      (await rpc(page.ticket, "fs.list", { folder: "journals" })).response
    ).toMatchObject({
      result: expect.any(Array),
    })
    expect(
      await rpc(page.ticket, "fs.writeText", {
        path: "journals/new.md",
        content: "hello",
      })
    ).toMatchObject({ response: { error: { code: "PERMISSION_DENIED" } } })
  })
  it("scopes file change observers to a declared page and disposes them", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.watched-journals",
          name: "Watched Journals",
          version: "1.0.0",
          workspace: { files: true },
          views: [
            {
              id: "overview",
              title: "Overview",
              context: "page",
              entry: "./page.ts",
            },
          ],
        },
        { "./page.ts": "export default function mount() {}" }
      ),
      "space-a"
    )
    const page = (
      await service.openPage(1, session, "example.watched-journals/overview")
    ).instance!
    const events: unknown[] = []
    const send = (event: unknown) => events.push(event)
    expect(
      await service.request(
        1,
        session,
        page.ticket,
        {
          protocol: "eidos-plugin",
          apiVersion: 1,
          id: "observe",
          method: "fs.watch",
          params: { id: "listener", path: "journals" },
        },
        send
      )
    ).toMatchObject({ response: { result: null } })
    expect(markdownWatchers.get("journals")?.size).toBe(1)
    markdownWatchers.get("journals")?.forEach((listener) => listener())
    expect(events).toMatchObject([{ observation: "listener", value: null }])
    expect(
      await rpc(page.ticket, "fs.watch", {
        id: "listener",
        path: "journals",
      })
    ).toMatchObject({ response: { error: { code: "INVALID_REQUEST" } } })
    expect(
      await rpc(page.ticket, "fs.watch", {
        id: "escape",
        path: "../outside",
      })
    ).toMatchObject({ response: { error: { code: "INVALID_REQUEST" } } })
    await rpc(page.ticket, "fs.unwatch", { id: "listener" })
    expect(markdownWatchers.get("journals")?.size).toBe(0)
    await rpc(page.ticket, "fs.watch", {
      id: "again",
      path: "journals",
    })
    service.close(1, page.ticket)
    expect(markdownWatchers.get("journals")?.size).toBe(0)
  })
  it("activates once, binds an action to its captured document and expires its handles", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.actions",
          name: "Actions",
          version: "1.0.0",
          extension: "./extension.ts",
          actions: [
            {
              id: "trim",
              title: "Trim",
              context: "document",
              access: "write",
              extensions: [".csv"],
            },
          ],
        },
        {
          "./extension.ts":
            "export default function activate(ctx) { ctx.actions.register('trim', async () => {}) }",
        }
      ),
      "space-a"
    )
    const extension = (
      await service.openExtension(1, session, "example.actions")
    ).instance!
    expect(
      (await service.openExtension(1, session, "example.actions")).instance!
        .ticket
    ).toBe(extension.ticket)
    expect(await rpc(extension.ticket, "document.read")).toMatchObject({
      response: { error: { code: "PERMISSION_DENIED" } },
    })
    expect(
      await rpc(extension.ticket, "extension.ready", { actions: ["trim"] })
    ).toMatchObject({ response: { result: null } })
    let announce!: (value: unknown) => void
    const announced = new Promise<unknown>((resolve) => {
      announce = resolve
    })
    const completion = service.invoke(
      1,
      session,
      extension.ticket,
      "trim",
      "data.csv",
      undefined,
      (event) => {
        if (event.observation === "action.run") announce(event.value)
      }
    )
    const { invocation } = (await announced) as { invocation: string }
    const actionRpc = (method: string, args: unknown = null) =>
      rpc(extension.ticket, method, { invocation, args })
    const response = (await actionRpc("document.read")).response
    if (!("result" in response)) throw Error("Read failed")
    const state = response.result as TextSnapshot
    await fs.writeFile(path.join(root, "other.csv"), "untouched")
    expect(
      await actionRpc("document.edit", {
        text: "action draft",
        expectedVersion: state.version,
      })
    ).toMatchObject({
      draftPath: "data.csv",
      response: { result: { status: "applied" } },
    })
    await rpc(extension.ticket, "action.complete", { invocation })
    expect(await completion).toMatchObject({ draft: { text: "action draft" } })
    expect(await actionRpc("document.save")).toMatchObject({
      response: { error: { code: "PERMISSION_DENIED" } },
    })
    expect(await fs.readFile(path.join(root, "other.csv"), "utf8")).toBe(
      "untouched"
    )
    expect((await read(await open())).text).toBe("action draft")
    await rpc(extension.ticket, "extension.unregister", { id: "trim" })
    await expect(
      service.invoke(
        1,
        session,
        extension.ticket,
        "trim",
        "data.csv",
        undefined,
        () => {}
      )
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" })
  })
  it("lets an active writable workspace action use settings and open a journal", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.journals",
          name: "Journals",
          version: "1.0.0",
          extension: "./extension.ts",
          actions: [
            {
              id: "today",
              title: "Today",
              context: "workspace",
              access: "write",
            },
          ],
          settings: {
            folder: { type: "string", title: "Folder", default: "Journals" },
          },
        },
        {
          "./extension.ts":
            "export default function activate(ctx) { ctx.actions.register('today', async () => {}) }",
        }
      ),
      "space-a"
    )
    const extension = (
      await service.openExtension(1, session, "example.journals")
    ).instance!
    await rpc(extension.ticket, "extension.ready", { actions: ["today"] })
    let announce!: (value: unknown) => void
    const announced = new Promise<unknown>((resolve) => {
      announce = resolve
    })
    const completion = service.invoke(
      1,
      session,
      extension.ticket,
      "today",
      undefined,
      undefined,
      (event) => {
        if (event.observation === "action.run") announce(event.value)
      }
    )
    const { invocation } = (await announced) as { invocation: string }
    const actionRpc = (method: string, args: unknown) =>
      rpc(extension.ticket, method, { invocation, args })
    expect(
      (await actionRpc("settings.get", { key: "folder" })).response
    ).toMatchObject({ result: "Journals" })
    expect(
      (await actionRpc("fs.stat", { path: "Journals/2026-09-23.md" })).response
    ).toMatchObject({ result: null })
    expect(
      await actionRpc("fs.writeText", {
        path: "Journals/2026-09-23.md",
        content: "hello journal",
      })
    ).toMatchObject({
      response: { result: null },
    })
    expect(
      (await actionRpc("fs.stat", { path: "Journals/2026-09-23.md" })).response
    ).toMatchObject({
      result: {
        path: "Journals/2026-09-23.md",
        name: "2026-09-23.md",
        isDirectory: false,
      },
    })
    expect(
      await actionRpc("ui.openFile", {
        relativePath: "Journals/2026-09-23.md",
      })
    ).toMatchObject({
      openFile: "Journals/2026-09-23.md",
    })
    await actionRpc("settings.update", { key: "folder", value: "Diary" })
    expect(
      (await actionRpc("settings.get", { key: "folder" })).response
    ).toMatchObject({ result: "Diary" })
    await rpc(extension.ticket, "action.complete", { invocation })
    await completion
    expect(
      (await actionRpc("fs.writeText", { path: "other.md", content: "" }))
        .response
    ).toMatchObject({ error: { code: "PERMISSION_DENIED" } })
  })
  it("rolls back incomplete activation and revokes running actions on disable", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.action",
          name: "Action",
          version: "1.0.0",
          extension: "./extension.ts",
          actions: [{ id: "run", title: "Run", context: "workspace" }],
        },
        { "./extension.ts": "export default function activate() {}" }
      ),
      "space-a"
    )
    const invalid = (await service.openExtension(1, session, "example.action"))
      .instance!
    expect(
      await rpc(invalid.ticket, "extension.ready", { actions: [] })
    ).toMatchObject({ response: { error: { code: "REGISTRATION_CONFLICT" } } })
    expect(service.instances.has(invalid.ticket)).toBe(false)
    const extension = (
      await service.openExtension(1, session, "example.action")
    ).instance!
    await rpc(extension.ticket, "extension.ready", { actions: ["run"] })
    let announce!: () => void
    const announced = new Promise<void>((resolve) => {
      announce = resolve
    })
    const completion = service.invoke(
      1,
      session,
      extension.ticket,
      "run",
      undefined,
      undefined,
      (event) => {
        if (event.observation === "action.run") announce()
      }
    )
    const rejected = expect(completion).rejects.toMatchObject({
      code: "INSTANCE_CLOSED",
    })
    await announced
    service.revoke("example.action")
    await rejected
  })
  it("shares ephemeral source trials while preserving Space enablement", async () => {
    const installed = (await store.installed(manifest.id))!.hash
    const trialBytes = encodePackage(manifest, {
      "./main.ts":
        "export default function mount(ctx, root) { root.textContent = 'Trial' }",
    })
    const trialHash = await store.install(trialBytes, undefined, false)
    expect(await store.binding(manifest.id, "space-a")).toEqual({
      hash: trialHash,
      enabled: true,
    })
    expect(await store.binding(manifest.id, "space-b")).toEqual({
      hash: trialHash,
      enabled: false,
    })
    const restarted = new PluginStore(store.directory)
    expect((await restarted.installed(manifest.id))!.hash).toBe(installed)
    await store.install(trialBytes)
    expect((await restarted.installed(manifest.id))!.hash).toBe(trialHash)
    await store.enable(manifest.id, false, "space-a")
    expect((await store.binding(manifest.id, "space-a"))!.enabled).toBe(false)
  })
  it("installs immutable modules concurrently and preserves independent scopes", async () => {
    const hashes = await Promise.all([
      store.install(encodePackage(manifest, modules), "a"),
      store.install(encodePackage(manifest, modules), "b"),
    ])
    expect(hashes[0]).toBe(hashes[1])
    expect((await store.read(hashes[0]!)).modules).toEqual(modules)
    expect(
      (await fs.readdir(path.join(store.directory, "packages"))).some((name) =>
        name.endsWith(".tmp")
      )
    ).toBe(false)
  })
  it("resolves file/open placements, Space-local defaults and enablement", async () => {
    expect((await service.open(1, session, "data.csv")).instance).toBeNull()
    await store.associate(".csv", "example.csv/table", "space-a")
    expect((await service.open(1, session, "data.csv")).instance).not.toBeNull()
    await store.associate(".csv", "builtin", "space-a")
    expect((await service.open(1, session, "data.csv")).instance).toBeNull()
    await store.enable(manifest.id, false, "space-a")
    expect(await store.editors("data.csv", "space-a")).toEqual([])
    expect(await store.editors("data.csv", "space-b")).toHaveLength(0)
  })

  it("keeps .graftignore available as an ordinary file", async () => {
    await fs.writeFile(path.join(root, ".graftignore"), "dist\n")
    await expect(service.open(1, session, ".graftignore")).resolves.toEqual({
      instance: null,
    })
  })
  it("injects mount context and preserves drafts across view recreation", async () => {
    const ticket = await open(),
      initial = await read(ticket)
    expect(service.instances.get(ticket)!.html).toContain("view.ready")
    const result = await rpc(ticket, "document.edit", {
      text: "draft",
      expectedVersion: initial.version,
    })
    expect(result).toMatchObject({
      draft: { text: "draft" },
      response: { result: { status: "applied", snapshot: { dirty: true } } },
    })
    const second = await open()
    expect(
      await rpc(second, "document.edit", {
        text: "stale",
        expectedVersion: initial.version,
      })
    ).toMatchObject({ response: { result: { status: "stale" } } })
    service.close(1, ticket)
    expect(await read(second)).toMatchObject({ text: "draft", dirty: true })
    expect(await rpc(second, "document.undo")).toMatchObject({ draft: null })
  })
  it("rejects owner/session forgery, extra edit fields, closed and revoked tickets", async () => {
    const ticket = await open(),
      state = await read(ticket)
    expect(await rpc(ticket, "document.read", null, 2)).toMatchObject({
      response: { error: { code: "INSTANCE_CLOSED" } },
    })
    expect(
      await rpc(ticket, "document.read", null, 1, { ...session })
    ).toMatchObject({ response: { error: { code: "INSTANCE_CLOSED" } } })
    expect(
      await rpc(ticket, "document.edit", {
        text: "x",
        expectedVersion: state.version,
        path: "other",
      })
    ).toMatchObject({ response: { error: { code: "INVALID_REQUEST" } } })
    await store.enable(manifest.id, false, "space-a")
    expect(await rpc(ticket, "document.save")).toMatchObject({
      response: { error: { code: "PERMISSION_DENIED" } },
    })
    expect(service.instances.has(ticket)).toBe(false)
  })
  it("enforces read-only access, size limits, symlink and traversal rejection", async () => {
    await store.install(
      encodePackage(
        { ...manifest, views: [{ ...manifest.views![0]!, access: "read" }] },
        modules
      )
    )
    const ticket = await open()
    expect(await rpc(ticket, "document.undo")).toMatchObject({
      response: { error: { code: "PERMISSION_DENIED" } },
    })
    await fs.writeFile(
      path.join(root, "data.csv"),
      "x".repeat(2 * 1024 * 1024 + 1)
    )
    await expect(open()).rejects.toMatchObject({ code: "TOO_LARGE" })
    await fs.symlink(path.join(root, "data.csv"), path.join(root, "link.csv"))
    await expect(
      service.open(1, session, "link.csv", "example.csv/table")
    ).rejects.toThrow()
    await expect(
      service.open(1, session, "../data.csv", "example.csv/table")
    ).rejects.toThrow()
  })
  it("preserves UTF-16 BOM and retains text on disk conflict", async () => {
    const file = path.join(root, "data.csv")
    await fs.writeFile(
      file,
      Buffer.concat([Buffer.from([255, 254]), Buffer.from("a,b", "utf16le")])
    )
    const ticket = await open()
    await rpc(ticket, "document.edit", {
      text: "a,c",
      expectedVersion: (await read(ticket)).version,
    })
    expect(await rpc(ticket, "document.save")).toMatchObject({
      draft: null,
      response: {
        result: {
          status: "saved",
          snapshot: { encoding: "utf-16le", bom: true },
        },
      },
    })
    expect((await fs.readFile(file)).subarray(0, 2)).toEqual(
      Buffer.from([255, 254])
    )
    await rpc(ticket, "document.edit", {
      text: "retained",
      expectedVersion: (await read(ticket)).version,
    })
    await fs.writeFile(file, "external")
    expect(await rpc(ticket, "document.save")).toMatchObject({
      draft: { text: "retained" },
      response: { result: { status: "conflict" } },
    })
  })
  it("keeps builtin fallback available when configuration is damaged", async () => {
    await fs.writeFile(path.join(store.directory, "config.json"), "invalid")
    expect(await store.resolve("data.csv", "space-a", "builtin")).toEqual({
      editor: null,
    })
    expect(await store.resolve("data.csv", "space-a")).toMatchObject({
      editor: null,
      warning: expect.any(String),
    })
  })
  it("opens media views, issues media stream URL, and reads scoped sidecar files", async () => {
    const videoManifest: PluginManifest = {
      apiVersion: 1,
      requires: { pluginApi: "2.0.0" },
      id: "example.player",
      name: "Player",
      version: "1.0.0",
      views: [
        {
          id: "video",
          title: "Video Player",
          context: "media",
          entry: "./player.ts",
          access: "read",
        },
      ],
      placements: [
        { location: "file/open", view: "video", extensions: [".mp4"] },
      ],
    }
    const videoModules = {
      "./player.ts":
        "export default function mount(ctx, root) { root.textContent = 'Player' }",
    }
    await store.install(encodePackage(videoManifest, videoModules), "space-a")
    await fs.writeFile(path.join(root, "movie.mp4"), "fake-video-bytes")
    await fs.writeFile(
      path.join(root, "movie.srt"),
      "1\n00:00:01,000 --> 00:00:02,000\nHello"
    )
    await fs.writeFile(
      path.join(root, "movie.en.srt"),
      "1\n00:00:01,000 --> 00:00:02,000\nHello English"
    )
    await fs.writeFile(path.join(root, "other.srt"), "other subtitles")

    const openResult = await service.open(
      1,
      session,
      "movie.mp4",
      "example.player/video"
    )
    expect(openResult.instance).not.toBeNull()
    const ticket = openResult.instance!.ticket

    // Test fs.url
    const urlResult = await rpc(ticket, "fs.url")
    expect(urlResult.response).toMatchObject({
      result: { url: "eidos-space-media://preview/test-movie.mp4" },
    })

    // Test fs.readText
    const textResult = await rpc(ticket, "fs.readText", {
      path: "movie.srt",
    })
    expect(textResult.response).toMatchObject({
      result: { text: "1\n00:00:01,000 --> 00:00:02,000\nHello" },
    })

    // Test fs.list
    const listResult = await rpc(ticket, "fs.list", {
      extensions: [".srt"],
    })
    expect(listResult.response).toMatchObject({
      result: expect.arrayContaining([
        expect.objectContaining({ name: "movie.srt", extension: ".srt" }),
        expect.objectContaining({ name: "movie.en.srt", extension: ".srt" }),
      ]),
    })
  })

  it("allows document views to list files, read companion text, and stream companion media", async () => {
    const subtitleManifest: PluginManifest = {
      apiVersion: 1,
      requires: { pluginApi: "2.0.0" },
      id: "example.subtitle",
      name: "Subtitle Editor",
      version: "1.0.0",
      views: [
        {
          id: "subtitles",
          title: "Subtitle Editor",
          context: "document",
          entry: "./editor.ts",
          access: "read",
        },
      ],
      placements: [
        { location: "file/open", view: "subtitles", extensions: [".srt"] },
      ],
    }
    const subtitleModules = {
      "./editor.ts":
        "export default function mount(ctx, root) { root.textContent = 'Subtitles' }",
    }
    await store.install(
      encodePackage(subtitleManifest, subtitleModules),
      "space-a"
    )
    await fs.writeFile(path.join(root, "movie.mp4"), "fake-video-bytes")
    await fs.writeFile(
      path.join(root, "movie.srt"),
      "1\n00:00:01,000 --> 00:00:02,000\nHello"
    )
    await fs.writeFile(
      path.join(root, "movie.en.srt"),
      "1\n00:00:01,000 --> 00:00:02,000\nHello English"
    )

    // Open document view on movie.srt
    const openResult = await service.open(
      1,
      session,
      "movie.srt",
      "example.subtitle/subtitles"
    )
    expect(openResult.instance).not.toBeNull()
    const ticket = openResult.instance!.ticket

    // 1. List files from document view
    const listResult = await rpc(ticket, "fs.list")
    expect(listResult.response).toMatchObject({
      result: expect.arrayContaining([
        expect.objectContaining({ name: "movie.mp4" }),
        expect.objectContaining({ name: "movie.en.srt" }),
      ]),
    })

    // 2. Read companion text file
    const textResult = await rpc(ticket, "fs.readText", {
      path: "movie.en.srt",
    })
    expect(textResult.response).toMatchObject({
      result: { text: "1\n00:00:01,000 --> 00:00:02,000\nHello English" },
    })

    // 3. Get companion media URL with explicit path
    const mediaResult = await rpc(ticket, "fs.url", {
      path: "movie.mp4",
    })
    expect(mediaResult.response).toMatchObject({
      result: { url: "eidos-space-media://preview/test-movie.mp4" },
    })

    // 4. Get companion media URL auto-detected
    const autoMediaResult = await rpc(ticket, "fs.url")
    expect(autoMediaResult.response).toMatchObject({
      result: { url: "eidos-space-media://preview/test-movie.mp4" },
    })

    // 5. Open document view on movie.en.srt (multi-segment name)
    const openEnResult = await service.open(
      1,
      session,
      "movie.en.srt",
      "example.subtitle/subtitles"
    )
    expect(openEnResult.instance).not.toBeNull()
    const ticketEn = openEnResult.instance!.ticket

    // Verify movie.en.srt finds movie.mp4 with explicit path
    const mediaEnResult = await rpc(ticketEn, "fs.url", {
      path: "movie.mp4",
    })
    expect(mediaEnResult.response).toMatchObject({
      result: { url: "eidos-space-media://preview/test-movie.mp4" },
    })

    // Verify removed legacy sidecars.* method is rejected as invalid
    await expect(rpc(ticket, "sidecars.mediaUrl")).rejects.toThrow(
      "Invalid guest request"
    )
  })

  it("supports orthogonal fs operations: readBinary, writeBinary, delete, and rename", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.file-manager",
          name: "File Manager",
          version: "1.0.0",
          workspace: { files: true },
          views: [
            {
              id: "manager",
              title: "Manager",
              context: "page",
              entry: "./page.ts",
            },
          ],
        },
        { "./page.ts": "export default function mount() {}" }
      ),
      "space-a"
    )
    const page = (
      await service.openPage(1, session, "example.file-manager/manager")
    ).instance!

    // 1. fs.writeBinary
    const originalBytes = Buffer.from([0x00, 0xff, 0x42, 0x13, 0x37])
    const base64Data = originalBytes.toString("base64")
    const writeRes = await rpc(page.ticket, "fs.writeBinary", {
      path: "bin/test.dat",
      data: base64Data,
    })
    expect(writeRes.response).toMatchObject({ result: null })

    // Verify stat
    const statRes = await rpc(page.ticket, "fs.stat", { path: "bin/test.dat" })
    expect(statRes.response).toMatchObject({
      result: expect.objectContaining({
        path: "bin/test.dat",
        size: 5,
        isDirectory: false,
      }),
    })

    // 2. fs.readBinary
    const readRes = await rpc(page.ticket, "fs.readBinary", {
      path: "bin/test.dat",
    })
    expect(readRes.response).toMatchObject({
      result: { data: base64Data },
    })

    // 3. fs.rename
    const renameRes = await rpc(page.ticket, "fs.rename", {
      oldPath: "bin/test.dat",
      newPath: "bin/renamed.dat",
    })
    expect(renameRes.response).toMatchObject({ result: null })

    const oldStat = await rpc(page.ticket, "fs.stat", { path: "bin/test.dat" })
    expect(oldStat.response).toMatchObject({ result: null })

    const newStat = await rpc(page.ticket, "fs.stat", {
      path: "bin/renamed.dat",
    })
    expect(newStat.response).toMatchObject({
      result: expect.objectContaining({ path: "bin/renamed.dat", size: 5 }),
    })

    // 4. fs.delete
    const deleteRes = await rpc(page.ticket, "fs.delete", {
      path: "bin/renamed.dat",
    })
    expect(deleteRes.response).toMatchObject({ result: null })

    const deletedStat = await rpc(page.ticket, "fs.stat", {
      path: "bin/renamed.dat",
    })
    expect(deletedStat.response).toMatchObject({ result: null })
  })

  it("supports context: file for views and actions", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          requires: { pluginApi: "2.0.0" },
          id: "example.file-viewer",
          name: "File Viewer",
          version: "1.0.0",
          extension: "./extension.ts",
          views: [
            {
              id: "viewer",
              title: "Viewer",
              context: "file",
              entry: "./viewer.ts",
              access: "write",
            },
          ],
          actions: [
            {
              id: "process-file",
              title: "Process File",
              context: "file",
              access: "write",
            },
          ],
          placements: [
            {
              location: "file/open",
              view: "viewer",
              extensions: [".bin"],
            },
            {
              location: "file/context",
              action: "process-file",
            },
          ],
        },
        {
          "./viewer.ts": "export default function mount() {}",
          "./extension.ts":
            "export default function activate(ctx) { ctx.actions.register('process-file', async () => {}) }",
        }
      ),
      "space-a"
    )

    await fs.writeFile(path.join(root, "sample.bin"), Buffer.from([1, 2, 3]))

    // 1. Open file view
    const openResult = await service.open(
      1,
      session,
      "sample.bin",
      "example.file-viewer/viewer"
    )
    expect(openResult.instance).not.toBeNull()
    const ticket = openResult.instance!.ticket

    // Verify HTML has mount context with kind: "file"
    const instanceRecord = service.instances.get(ticket)!
    expect(instanceRecord.html).toContain('"kind":"file"')

    // View can read binary file
    const readBinaryRes = await rpc(ticket, "fs.readBinary", {
      path: "sample.bin",
    })
    expect(readBinaryRes.response).toMatchObject({
      result: { data: Buffer.from([1, 2, 3]).toString("base64") },
    })

    // 2. Action with context: "file"
    const extension = (
      await service.openExtension(1, session, "example.file-viewer")
    ).instance!
    await rpc(extension.ticket, "extension.ready", {
      actions: ["process-file"],
    })

    let announce!: (value: unknown) => void
    const announced = new Promise<unknown>((resolve) => {
      announce = resolve
    })
    const completion = service.invoke(
      1,
      session,
      extension.ticket,
      "process-file",
      "sample.bin",
      undefined,
      (event) => {
        if (event.observation === "action.run") announce(event.value)
      }
    )

    const announcedAction = (await announced) as {
      invocation: string
      action: string
      kind: string
      path: string
    }
    expect(announcedAction).toMatchObject({
      action: "process-file",
      kind: "file",
      path: "sample.bin",
    })
    await rpc(extension.ticket, "action.complete", {
      invocation: announcedAction.invocation,
    })
    await completion
  })
})
