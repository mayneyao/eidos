import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { encodePackage } from "@eidos.space/plugin-runtime/package"
import type { PluginManifest, TextSnapshot } from "@eidos.space/plugin-sdk"
import { PluginStore } from "./plugin-store"
import { PluginService, type PluginDocumentSession } from "./plugin-service"
import { readTextFilePreview, saveTextFile } from "../space/text-file-preview"
const manifest: PluginManifest = {
  apiVersion: 1,
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
    openOrCreateMarkdownFile: async (file) => {
      const target = path.join(root, file)
      await fs.mkdir(path.dirname(target), { recursive: true })
      try {
        await fs.writeFile(target, "", { flag: "wx" })
        return { path: file, created: true }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
        return { path: file, created: false }
      }
    },
    listMarkdownFiles: async (folder) => ({
      paths: folder === "journals" ? ["journals/2026-09-23.md"] : [],
      truncated: false,
    }),
    countMarkdownLines: async (paths) =>
      Promise.all(
        paths.map(async (path) => {
          const preview = await readTextFilePreview(root, path)
          return {
            path,
            lines:
              preview.type === "text" && !preview.truncated
                ? preview.content
                    .split(/\r\n|\r|\n/)
                    .filter((line) => line.trim().length > 0).length
                : null,
          }
        })
      ),
    watchMarkdownFiles: (folder, listener) => {
      const listeners = markdownWatchers.get(folder) ?? new Set()
      listeners.add(listener)
      markdownWatchers.set(folder, listeners)
      return { dispose: () => listeners.delete(listener) }
    },
    previewMediaFile: async (file) => ({
      path: file,
      name: path.basename(file),
      baseName: path.parse(file).name,
      extension: path.extname(file),
      mimeType: "video/mp4",
      size: (await fs.stat(path.join(root, file))).size,
      previewUrl: `eidos-space-media://preview/test-${file}`,
    }),
    readSidecarText: async (file, extOrName) => {
      const dir = path.dirname(file)
      const base = path.parse(file).name
      const name = extOrName.startsWith(".") ? `${base}${extOrName}` : extOrName
      const rel = dir === "." ? name : `${dir}/${name}`
      try {
        const text = await fs.readFile(path.join(root, rel), "utf8")
        return { text, path: rel }
      } catch {
        return null
      }
    },
    listSidecars: async (file, extensions) => {
      const dir = path.dirname(file)
      const base = path.parse(file).name
      const fullDir = path.join(root, dir === "." ? "" : dir)
      const files = await fs.readdir(fullDir).catch(() => [])
      const results: Array<{
        name: string
        path: string
        extension: string
        size: number
      }> = []
      for (const f of files) {
        if (f.startsWith(`${base}.`) && f !== path.basename(file)) {
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
      await rpc(page.ticket, "ui.listMarkdownFiles", { folder: "journals" })
    ).toMatchObject({ response: { error: { code: "PERMISSION_DENIED" } } })
    expect(
      await rpc(page.ticket, "ui.countMarkdownLines", { paths: [] })
    ).toMatchObject({ response: { error: { code: "PERMISSION_DENIED" } } })
    expect(
      await rpc(page.ticket, "ui.observeMarkdownFiles", {
        id: "watch",
        folder: "journals",
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
  it("lets only a declared page enumerate Markdown names and open an existing entry", async () => {
    await fs.mkdir(path.join(root, "journals"))
    await fs.writeFile(
      path.join(root, "journals/2026-09-23.md"),
      "first line\n\nsecond line\n"
    )
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          id: "example.journals",
          name: "Journals",
          version: "1.0.0",
          requires: { pluginApi: "1.4.0" },
          workspace: { listMarkdownFiles: true, countMarkdownLines: true },
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
      await rpc(page.ticket, "ui.countMarkdownLines", {
        paths: ["journals/2026-09-23.md"],
      })
    ).toMatchObject({ response: { error: { code: "INVALID_REQUEST" } } })
    expect(
      (await rpc(page.ticket, "ui.listMarkdownFiles", { folder: "journals" }))
        .response
    ).toMatchObject({
      result: { paths: ["journals/2026-09-23.md"], truncated: false },
    })
    expect(
      (
        await rpc(page.ticket, "ui.countMarkdownLines", {
          paths: ["journals/2026-09-23.md"],
        })
      ).response
    ).toMatchObject({
      result: [{ path: "journals/2026-09-23.md", lines: 2 }],
    })
    expect(
      await rpc(page.ticket, "ui.countMarkdownLines", {
        paths: [".graft/private.md"],
      })
    ).toMatchObject({ response: { error: { code: "INVALID_REQUEST" } } })
    expect(
      await rpc(page.ticket, "ui.countMarkdownLines", {
        paths: Array.from({ length: 401 }, () => "journals/2026-09-23.md"),
      })
    ).toMatchObject({ response: { error: { code: "INVALID_REQUEST" } } })
    expect(
      await rpc(page.ticket, "ui.openMarkdownFile", {
        relativePath: "journals/2026-09-23.md",
      })
    ).toMatchObject({ openFile: "journals/2026-09-23.md" })
    expect(
      (
        await rpc(page.ticket, "ui.openMarkdownFile", {
          relativePath: "../secret.md",
        })
      ).response
    ).toMatchObject({ error: { code: "INVALID_REQUEST" } })
  })
  it("does not expose line counts to a filename-only page", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          id: "example.filename-only",
          name: "Filename only",
          version: "1.0.0",
          requires: { pluginApi: "1.3.0" },
          workspace: { listMarkdownFiles: true },
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
      await service.openPage(1, session, "example.filename-only/overview")
    ).instance!
    await rpc(page.ticket, "ui.listMarkdownFiles", { folder: "journals" })
    expect(
      await rpc(page.ticket, "ui.countMarkdownLines", { paths: [] })
    ).toMatchObject({ response: { error: { code: "PERMISSION_DENIED" } } })
  })
  it("scopes Markdown change observers to a declared page and disposes them", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
          id: "example.watched-journals",
          name: "Watched Journals",
          version: "1.0.0",
          requires: { pluginApi: "1.5.0" },
          workspace: { listMarkdownFiles: true, watchMarkdownFiles: true },
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
          method: "ui.observeMarkdownFiles",
          params: { id: "listener", folder: "journals" },
        },
        send
      )
    ).toMatchObject({ response: { result: null } })
    expect(markdownWatchers.get("journals")?.size).toBe(1)
    markdownWatchers.get("journals")?.forEach((listener) => listener())
    expect(events).toMatchObject([{ observation: "listener", value: null }])
    expect(
      await rpc(page.ticket, "ui.observeMarkdownFiles", {
        id: "listener",
        folder: "journals",
      })
    ).toMatchObject({ response: { error: { code: "INVALID_REQUEST" } } })
    expect(
      await rpc(page.ticket, "ui.observeMarkdownFiles", {
        id: "escape",
        folder: "../outside",
      })
    ).toMatchObject({ response: { error: { code: "INVALID_REQUEST" } } })
    await rpc(page.ticket, "ui.unobserveMarkdownFiles", { id: "listener" })
    expect(markdownWatchers.get("journals")?.size).toBe(0)
    await rpc(page.ticket, "ui.observeMarkdownFiles", {
      id: "again",
      folder: "journals",
    })
    service.close(1, page.ticket)
    expect(markdownWatchers.get("journals")?.size).toBe(0)
  })
  it("activates once, binds an action to its captured document and expires its handles", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
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
      await actionRpc("ui.openOrCreateMarkdown", {
        relativePath: "Journals/2026-09-23.md",
      })
    ).toMatchObject({
      response: { result: { path: "Journals/2026-09-23.md", created: true } },
      openFile: "Journals/2026-09-23.md",
    })
    await actionRpc("settings.update", { key: "folder", value: "Diary" })
    expect(
      (await actionRpc("settings.get", { key: "folder" })).response
    ).toMatchObject({ result: "Diary" })
    await rpc(extension.ticket, "action.complete", { invocation })
    await completion
    expect(
      (await actionRpc("ui.openOrCreateMarkdown", { relativePath: "other.md" }))
        .response
    ).toMatchObject({ error: { code: "PERMISSION_DENIED" } })
  })
  it("rolls back incomplete activation and revokes running actions on disable", async () => {
    await store.install(
      encodePackage(
        {
          apiVersion: 1,
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

    // Test media.url
    const urlResult = await rpc(ticket, "media.url")
    expect(urlResult.response).toMatchObject({
      result: "eidos-space-media://preview/test-movie.mp4",
    })

    // Test media.readSidecarText
    const sidecarResult = await rpc(ticket, "media.readSidecarText", {
      extension: ".srt",
    })
    expect(sidecarResult.response).toMatchObject({
      result: {
        text: "1\n00:00:01,000 --> 00:00:02,000\nHello",
        path: "movie.srt",
      },
    })

    // Test media.listSidecars
    const listResult = await rpc(ticket, "media.listSidecars", {
      extensions: [".srt"],
    })
    expect(listResult.response).toMatchObject({
      result: expect.arrayContaining([
        expect.objectContaining({ name: "movie.srt", extension: ".srt" }),
        expect.objectContaining({ name: "movie.en.srt", extension: ".srt" }),
      ]),
    })
    const listData = (listResult.response as { result: unknown[] }).result
    expect(listData.some((f: any) => f.name === "other.srt")).toBe(false)
  })
})
