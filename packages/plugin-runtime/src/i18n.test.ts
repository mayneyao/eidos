// @vitest-environment jsdom
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import {
  createPluginI18n,
  pluginLanguageData,
  localizePluginManifest,
  localizedPluginReadme,
  pluginLocaleCandidates,
} from "./i18n"
import { parseManifest } from "./manifest"
import { encodePackage, decodePackage } from "./package"
import { compilePlugin } from "./compiler"
import { viewHtml } from "./sandbox"
import type { PluginManifest } from "./contracts"

const manifest: PluginManifest = {
  apiVersion: 1,
  id: "test.languages",
  name: "%plugin.name%",
  description: "%plugin.description%",
  version: "1.0.0",
  requires: { pluginApi: "3.7.0" },
  i18n: {
    defaultLocale: "en",
    messages: { en: "./en.json", "zh-CN": "./zh.json" },
    readme: { en: "./README.md", "zh-CN": "./README.zh.md" },
  },
  views: [
    { id: "main", title: "%view.title%", kind: "page", entry: "./page.ts" },
  ],
}
const resources = {
  "./en.json": JSON.stringify({
    "plugin.name": "Recent History",
    "plugin.description": "File openings",
    "view.title": "History",
    search: "Search {name}",
  }),
  "./zh.json": JSON.stringify({
    "plugin.name": "最近打开",
    "view.title": "历史",
    search: "搜索 {name}",
  }),
  "./README.md": "# History",
  "./README.zh.md": "# 历史",
}
const modules = { "./page.ts": "export default function mount() {}" }
const pkg = () => decodePackage(encodePackage(manifest, modules, resources))
beforeEach(() =>
  vi.stubGlobal("Uint8Array", new TextEncoder().encode("").constructor)
)
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"))
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("localizes display fields with per-message fallback without changing raw authority", () => {
  const data = pluginLanguageData(manifest, resources)
  const localized = localizePluginManifest(manifest, data, "zh-CN")
  expect(localized.name).toBe("最近打开")
  expect(localized.description).toBe("File openings")
  expect(localized.views![0].title).toBe("历史")
  expect(localized.views![0].entry).toBe("./page.ts")
  expect(localized.id).toBe(manifest.id)
  expect(manifest.name).toBe("%plugin.name%")
  expect(createPluginI18n(data, "de").t("search", { name: "$&" })).toBe(
    "Search $&"
  )
  expect(pluginLocaleCandidates("zh-TW", "en")).toEqual([
    "zh-TW",
    "zh-Hant",
    "zh",
    "en",
  ])
  expect(pluginLocaleCandidates("zh-CN", "en")).not.toContain("zh-Hant")
})

it("packages whole localized readmes and falls back without mixing content", () => {
  expect(pkg().format).toBe(3)
  expect(localizedPluginReadme(pkg(), "zh-CN")).toEqual({
    content: "# 历史",
    locale: "zh-CN",
    fallback: false,
    source: "./README.zh.md",
  })
  expect(localizedPluginReadme(pkg(), "de-DE")).toEqual({
    content: "# History",
    locale: "en",
    fallback: true,
    source: "./README.md",
  })
  expect(localizedPluginReadme(pkg(), "en-US")!.fallback).toBe(false)
})

it("rejects invalid paths, old APIs, undeclared resources and missing default messages", () => {
  expect(() =>
    parseManifest({ ...manifest, requires: { pluginApi: "3.6.0" } })
  ).toThrow("3.7.0")
  expect(() =>
    parseManifest({
      ...manifest,
      i18n: { ...manifest.i18n, messages: { en: "./../en.json" } },
    })
  ).toThrow("resource path")
  expect(() =>
    parseManifest({
      ...manifest,
      i18n: {
        ...manifest.i18n,
        messages: { en: "./en.json", "zh-cn": "./zh.json" },
      },
    })
  ).toThrow("locale")
  expect(() =>
    encodePackage(manifest, modules, { ...resources, "./other.md": "extra" })
  ).toThrow("resources")
  expect(() =>
    encodePackage(manifest, modules, { ...resources, "./en.json": "{}" })
  ).toThrow("Missing default message")
  expect(() =>
    encodePackage(manifest, modules, {
      ...resources,
      "./zh.json": '{"search": 123}',
    })
  ).toThrow("messages")
})

it("tracks resource edits in source revisions and rejects symlink resources", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "plugin-i18n-"))
  try {
    await fs.writeFile(
      path.join(directory, "plugin.json"),
      JSON.stringify(manifest)
    )
    for (const [name, value] of Object.entries({ ...resources, ...modules }))
      await fs.writeFile(path.join(directory, name), value)
    const first = await compilePlugin(directory)
    await fs.writeFile(path.join(directory, "README.zh.md"), "# 新说明")
    const second = await compilePlugin(directory)
    expect(second.revision).not.toBe(first.revision)
    expect(second.program.resources!["./README.zh.md"]).toBe("# 新说明")
    await fs.unlink(path.join(directory, "zh.json"))
    await fs.symlink(
      path.join(directory, "en.json"),
      path.join(directory, "zh.json")
    )
    await expect(compilePlugin(directory)).rejects.toThrow("symlinks")
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

it("updates the mounted guest in place and validates parent locale messages", async () => {
  document.body.innerHTML = '<div id="app"></div>'
  vi.spyOn(window, "postMessage").mockImplementation(() => {})
  const html = viewHtml(
    `export default function mount(ctx, root) {
    root.innerHTML = '<input value="keep search"><span></span>';
    const render = () => root.querySelector('span').textContent = ctx.i18n.t('plugin.name');
    ctx.subscriptions.add(ctx.i18n.onDidChangeLocale(render)); render();
  }`,
    {
      kind: "page",
      route: "",
      languageData: pluginLanguageData(manifest, resources),
      locale: "en",
    }
  )
  window.eval(
    html.slice(html.indexOf("<script>") + 8, html.indexOf("</script>"))
  )
  await vi.waitFor(() =>
    expect(document.querySelector("span")!.textContent).toBe("Recent History")
  )
  const input = document.querySelector("input")
  window.dispatchEvent(
    new MessageEvent("message", {
      source: window,
      data: {
        protocol: "eidos-plugin",
        apiVersion: 1,
        observation: "host.locale",
        value: "zh-CN",
      },
    })
  )
  expect(document.querySelector("span")!.textContent).toBe("最近打开")
  expect(document.querySelector("input")).toBe(input)
  expect(input!.value).toBe("keep search")
})
