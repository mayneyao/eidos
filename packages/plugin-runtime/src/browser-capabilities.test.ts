import { describe, expect, it } from "vitest"
import { parseManifest } from "./manifest"
import { sandboxCsp } from "./sandbox"
const manifest = {
  apiVersion: 1,
  id: "test.map",
  name: "Map",
  version: "1.0.0",
  views: [{ id: "map", title: "Map", context: "table", entry: "./main.ts" }],
}
describe("browser capabilities", () => {
  it("validates device storage quotas and settings page placements", () => {
    expect(
      parseManifest({ ...manifest, storage: { maxBytes: 536870912 } }).storage
        ?.maxBytes
    ).toBe(536870912)
    for (const maxBytes of [0, -1, 1.5, 1024 ** 3 + 1, "512"])
      expect(() =>
        parseManifest({ ...manifest, storage: { maxBytes } })
      ).toThrow()
    expect(() =>
      parseManifest({
        ...manifest,
        placements: [{ location: "plugin/settings", view: "map" }],
      })
    ).toThrow("mismatch")
    expect(
      parseManifest({
        ...manifest,
        views: [
          {
            id: "settings",
            title: "Settings",
            context: "page",
            entry: "./settings.ts",
          },
        ],
        placements: [{ location: "plugin/settings", view: "settings" }],
      }).placements
    ).toHaveLength(1)
  })
  it("keeps networking and workers closed by default", () => {
    expect(sandboxCsp()).toContain("connect-src eidos-space-media:")
    expect(sandboxCsp()).toContain("worker-src 'none'")
  })
  it("accepts exact HTTPS origins and blob workers without permitting external scripts", () => {
    const parsed = parseManifest({
      ...manifest,
      browser: {
        workers: true,
        networkOrigins: ["https://tiles.openfreemap.org"],
      },
    })
    const csp = sandboxCsp(parsed.browser)
    expect(csp).toContain(
      "connect-src eidos-space-media: https://tiles.openfreemap.org;"
    )
    expect(csp).toContain("worker-src blob:")
    expect(csp).toContain("script-src 'unsafe-inline' 'wasm-unsafe-eval';")
  })
  it("rejects wildcard, HTTP, credentials, paths and CSP injection", () => {
    for (const origin of [
      "https://*.example.com",
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com/path",
      "https://example.com; script-src *",
    ])
      expect(() =>
        parseManifest({ ...manifest, browser: { networkOrigins: [origin] } })
      ).toThrow()
  })
})
