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
  sequence = 0
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-plugin-test-"))
  root = path.join(directory, "space")
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, "data.csv"), "name,value\na,1\n")
  store = new PluginStore(path.join(directory, "plugins"))
  service = new PluginService(store)
  session = {
    canonical: { id: "space-a" },
    previewTextFile: (file) => readTextFilePreview(root, file),
    saveTextFile: (request) => saveTextFile(root, request),
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
    expect((await rpc(opened.ticket, "table.read")).response).toHaveProperty(
      "result"
    )
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
})
