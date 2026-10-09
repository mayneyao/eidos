// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { extensionHtml } from "./extension-sandbox"
import {
  matchingFileHooks,
  parseFileHookPlan,
  runFileHookInBrowser,
} from "./file-hooks"
import { parseManifest } from "./manifest"
import type { FileHookEvent, FileHookDeclaration } from "./contracts"

const declaration: FileHookDeclaration = {
  id: "saved",
  title: "Saved",
  event: "document.saved",
  extensions: [".md"],
  access: "write",
}
const event: FileHookEvent = {
  type: "document.saved",
  operationId: "op",
  source: "local",
  path: "folder/old.md",
  previousText: "# Old",
  document: { text: "# New", version: "revision" },
}
const manifest = {
  apiVersion: 1,
  id: "test.hooks",
  name: "Hooks",
  version: "1.0.0",
  requires: { pluginApi: "3.3.0" },
  extension: "./main.ts",
  hooks: [declaration],
}

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("validates hook-only manifests and matches only local events", () => {
  const parsed = parseManifest(manifest)
  expect(matchingFileHooks(parsed, event)).toEqual([declaration])
  expect(matchingFileHooks(parsed, { ...event, path: "old.MD" })).toEqual([
    declaration,
  ])
  for (const source of ["plugin", "sync"] as const)
    expect(matchingFileHooks(parsed, { ...event, source })).toEqual([])
  expect(matchingFileHooks(parsed, { ...event, type: "file.renamed" })).toEqual(
    []
  )
  for (const change of [
    { requires: { pluginApi: "3.2.0" } },
    { extension: undefined },
    { hooks: [{ ...declaration, event: "anything" }] },
  ])
    expect(() => parseManifest({ ...manifest, ...change })).toThrow()
})

it("confines writable plans to a portable filename and text in the bound document", () => {
  expect(parseFileHookPlan({ name: "New.md" }, declaration, event)).toEqual({
    name: "New.md",
  })
  expect(
    parseFileHookPlan({ name: "old.md", text: "# New" }, declaration, event)
  ).toBeNull()
  for (const value of [
    { path: "new.md" },
    { name: "../new.md" },
    { name: "CON.md" },
    { name: "a.txt" },
    { name: ".hidden.md" },
    { name: "a/hi.md" },
    { name: "a.md " },
    { text: 1 },
    { text: "x".repeat(2 * 1024 * 1024 + 1) },
  ])
    expect(() => parseFileHookPlan(value, declaration, event)).toThrow()
  expect(() =>
    parseFileHookPlan(
      { name: "New.md" },
      { ...declaration, access: "read" },
      event
    )
  ).toThrow()
})

it("registers and invokes hooks through the actual extension bootstrap", async () => {
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
  const requests: Array<{
    id: string
    method: string
    params: Record<string, unknown>
  }> = []
  vi.spyOn(window, "postMessage").mockImplementation((value) => {
    requests.push(value)
    queueMicrotask(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          data: {
            protocol: "eidos-plugin",
            apiVersion: 1,
            id: value.id,
            result: null,
          },
        })
      )
    )
  })
  const html = extensionHtml(
    "export default ctx => {ctx.subscriptions.add(ctx.capabilities.hooks.register('saved', async ({event,settings,signal}) => ({name: settings.prefix + event.document.text.slice(2) + '.md'})))}",
    [],
    [],
    ["saved"]
  )
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() =>
    expect(requests.some((r) => r.method === "extension.ready")).toBe(true)
  )
  expect(requests.find((r) => r.method === "extension.ready")?.params).toEqual({
    actions: [],
    formatters: [],
    hooks: ["saved"],
  })
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      data: {
        protocol: "eidos-plugin",
        apiVersion: 1,
        observation: "hook.run",
        value: {
          invocation: "run",
          hook: "saved",
          event,
          settings: { prefix: "Test " },
        },
      },
    })
  )
  await vi.waitFor(() =>
    expect(requests.find((r) => r.method === "hook.complete")?.params).toEqual({
      invocation: "run",
      result: { name: "Test New.md" },
    })
  )
})

it("times out and removes background frames", async () => {
  await expect(
    runFileHookInBrowser({
      html: "",
      hook: "saved",
      invocation: "op",
      hooks: ["saved"],
      actions: [],
      formatters: [],
      event,
      settings: {},
      timeoutMs: 5,
    })
  ).rejects.toThrow("timed out")
  expect(document.querySelector("iframe")).toBeNull()
})
