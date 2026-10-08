import { describe, it, expect } from "vitest"
import { parseManifest } from "./manifest"
import { checkPluginCompatibility } from "./compatibility"
const manifest = {
  apiVersion: 1,
  id: "example.dashboard",
  name: "Dashboard",
  version: "0.1.0",
  requires: { pluginApi: "3.2.0" },
  views: [
    {
      id: "main",
      title: "Dashboard",
      kind: "file",
      capabilities: ["document"],
      entry: "./main.js",
      access: "write",
    },
  ],
  placements: [
    { location: "file/open", view: "main", extensions: [".dashboard"] },
  ],
  fileTemplates: [
    {
      id: "blank",
      title: "Dashboard",
      extension: ".dashboard",
      view: "main",
      content: "{}\n",
    },
  ],
}
describe("file templates", () => {
  it("accepts declared text templates only on a supported host", () => {
    const parsed = parseManifest(manifest)
    expect(parsed.fileTemplates?.[0]?.content).toBe("{}\n")
    expect(checkPluginCompatibility(parsed, "eidos-lite").compatible).toBe(true)
    expect(checkPluginCompatibility(parsed, "eidos-cli").compatible).toBe(false)
  })
  it.each([
    { extension: ".eidos" },
    { extension: "../x" },
    { view: "missing" },
    { content: "a".repeat(262145) },
    { content: {} },
  ])("rejects unsafe template %j", (change) => {
    expect(() =>
      parseManifest({
        ...manifest,
        fileTemplates: [{ ...manifest.fileTemplates[0], ...change }],
      })
    ).toThrow()
  })
})
