import { expect, it } from "vitest"
import type { PluginManifest } from "@eidos.space/plugin-sdk"
import { checkPluginCompatibility, pluginHostInfo } from "./compatibility"
import { decodePackage, encodePackage, parsePackage } from "./package"

const manifest: PluginManifest = {
  apiVersion: 1,
  id: "test.compatibility",
  name: "Compatibility",
  version: "1.0.0",
  views: [{ id: "main", title: "Main", context: "table", entry: "./main.js" }],
  placements: [{ location: "table/view", view: "main" }],
}
it("checks minimum API independently of SDK and plugin versions", () => {
  expect(pluginHostInfo("eidos-lite").pluginApiVersion).toBe("1.1.0")
  for (const [version, compatible] of [
    ["1.0.0", true],
    ["1.1.0", true],
    ["1.1.1", false],
    ["2.0.0", false],
  ] as const) {
    expect(
      checkPluginCompatibility(
        { ...manifest, requires: { pluginApi: version } },
        "eidos-lite"
      ).compatible
    ).toBe(compatible)
  }
})
it("infers host features even for undeclared legacy plugins", () => {
  expect(checkPluginCompatibility(manifest, "eidos-cli").reason).toBe(
    "UNDECLARED"
  )
  const plugin = { ...manifest, extension: "./worker.js" }
  expect(checkPluginCompatibility(plugin, "eidos-cli")).toMatchObject({
    compatible: false,
    missingFeatures: ["extension"],
  })
})
it("uses a new envelope so old hosts cannot silently ignore minimum requirements", () => {
  const plugin = { ...manifest, requires: { pluginApi: "1.0.0" } }
  const modules = { "./main.js": "export default function mount() {}" }
  expect(decodePackage(encodePackage(plugin, modules)).format).toBe(2)
  expect(decodePackage(encodePackage(manifest, modules)).format).toBe(1)
  expect(() => parsePackage({ format: 1, manifest: plugin, modules })).toThrow(
    "format 2"
  )
  expect(() => parsePackage({ format: 2, manifest, modules })).toThrow(
    "minimum plugin API"
  )
})
