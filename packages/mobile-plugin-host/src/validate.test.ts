import { describe, expect, it } from "vitest"
import { validatePackage } from "./validate"

const manifest = {
  apiVersion: 1,
  id: "test.localized",
  name: "%name%",
  version: "1.0.0",
  requires: { pluginApi: "3.7.0" },
  views: [{ id: "main", title: "%name%", kind: "page", entry: "./main.js" }],
  placements: [{ location: "navigation", view: "main" }],
  i18n: {
    defaultLocale: "en",
    messages: { en: "./en.json", "zh-CN": "./zh.json" },
  },
}
const archive = {
  format: 3,
  manifest,
  modules: {
    "./main.js":
      "export default function mount(ctx) { ctx.root.textContent = ctx.i18n.t('name'); }",
  },
  resources: {
    "./en.json": '{"name":"Example"}',
    "./zh.json": '{"name":"示例"}',
  },
}

describe("mobile package installation", () => {
  it("validates format 3 and resolves display text without running guest code", () => {
    const localized = validatePackage(JSON.stringify(archive), "zh-CN")
    expect(localized.name).toBe("示例")
    expect(localized.views?.[0].title).toBe("示例")
    expect(localized.id).toBe(manifest.id)
    expect(validatePackage(JSON.stringify(archive)).name).toBe("Example")
  })
  it("continues accepting format 2", () => {
    const { i18n: _, ...legacy } = manifest
    expect(
      validatePackage(
        JSON.stringify({
          format: 2,
          manifest: {
            ...legacy,
            name: "Legacy",
            requires: { pluginApi: "3.0.0" },
          },
          modules: archive.modules,
        })
      ).id
    ).toBe(manifest.id)
  })
  it("rejects missing, extra, malformed and unresolved localization resources", () => {
    for (const resources of [
      {},
      { ...archive.resources, "./extra": "" },
      { ...archive.resources, "./en.json": "{}" },
      { ...archive.resources, "./en.json": '{"name":42}' },
      { ...archive.resources, "./en.json": '{"name":"A","name":"B"}' },
    ]) {
      expect(() =>
        validatePackage(JSON.stringify({ ...archive, resources }))
      ).toThrow()
    }
    expect(() =>
      validatePackage(JSON.stringify({ ...archive, format: 2 }))
    ).toThrow()
  })
  it("retains capability and source boundaries for newer packages", () => {
    for (const extra of [
      { background: { entry: "./background.js" } },
      { storage: { maxBytes: 1024 } },
      { browser: { network: true } },
      { requires: { pluginApi: "3.8.0" } },
    ]) {
      expect(() =>
        validatePackage(
          JSON.stringify({ ...archive, manifest: { ...manifest, ...extra } })
        )
      ).toThrow()
    }
    expect(() =>
      validatePackage(
        JSON.stringify({
          ...archive,
          modules: {
            "./main.js":
              "export default () => import('https://example.com/a.js')",
          },
        })
      )
    ).toThrow()
  })
})
