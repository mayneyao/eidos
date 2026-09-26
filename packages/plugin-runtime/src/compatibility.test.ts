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
  expect(pluginHostInfo("eidos-lite").pluginApiVersion).toBe("2.0.0")
  for (const [version, compatible] of [
    ["1.0.0", false],
    ["1.1.0", false],
    ["1.2.0", false],
    ["1.3.0", false],
    ["1.4.0", false],
    ["1.5.0", false],
    ["1.6.0", false],
    ["1.6.1", false],
    ["2.0.0", true],
    ["2.0.1", false],
    ["3.0.0", false],
  ] as const) {
    expect(
      checkPluginCompatibility(
        { ...manifest, requires: { pluginApi: version } },
        "eidos-lite"
      ).compatible
    ).toBe(compatible)
  }
})
it("accepts standalone themes in Lite and rejects them in CLI Serve", () => {
  const theme: PluginManifest = {
    apiVersion: 1,
    kind: "theme",
    id: "example.theme",
    name: "Theme",
    version: "1.0.0",
    requires: { pluginApi: "1.6.0" },
    theme: { stylesheet: "./theme.css" },
  }
  expect(checkPluginCompatibility(theme, "eidos-lite").compatible).toBe(true)
  const modernTheme = decodePackage(
    encodePackage(
      {
        ...theme,
        requires: { pluginApi: "2.0.0" },
        theme: {
          stylesheet:
            ':root[data-theme="light"] { --theme-surface: #fff; } :root[data-theme="dark"] { --theme-surface: #111; }',
        },
      },
      {}
    )
  )
  expect(
    checkPluginCompatibility(modernTheme.manifest, "eidos-lite").compatible
  ).toBe(true)
  expect(checkPluginCompatibility(theme, "eidos-cli")).toMatchObject({
    compatible: false,
    missingFeatures: ["theme.lite"],
  })
})
it("requires workspace files support for Space file access", () => {
  const plugin: PluginManifest = {
    ...manifest,
    requires: { pluginApi: "2.0.0" },
    workspace: { files: true },
  }
  expect(checkPluginCompatibility(plugin, "eidos-lite")).toMatchObject({
    compatible: true,
  })
  expect(checkPluginCompatibility(plugin, "eidos-cli")).toMatchObject({
    compatible: false,
    missingFeatures: expect.arrayContaining(["workspace.files"]),
  })
})
it("rejects undeclared executables and removed resources in Lite", () => {
  expect(checkPluginCompatibility(manifest, "eidos-lite")).toMatchObject({
    compatible: false,
    reason: "API_VERSION",
  })
  expect(
    checkPluginCompatibility(
      {
        ...manifest,
        requires: { pluginApi: "2.0.0" },
        resources: {
          notes: { kind: "text", title: "Notes", access: ["read"] },
        },
      },
      "eidos-lite"
    )
  ).toMatchObject({
    compatible: false,
    reason: "HOST_FEATURES",
    missingFeatures: ["resources"],
  })
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
