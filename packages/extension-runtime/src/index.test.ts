import { describe, expect, it } from "vitest"
import {
  createExtensionRuntimeHostHtml,
  createExtensionWorkerSource,
  parseExtensionWorkerMessage,
} from "./index"

describe("extension runtime bootstrap", () => {
  it("blocks ambient network APIs before evaluating the extension bundle", () => {
    const marker = "EXTENSION_BUNDLE_MARKER"
    const source = createExtensionWorkerSource({
      bundleCode: `var __eidosExtensionModule = { activate() { ${marker}; } };`,
      commandIds: ["example.test.run"],
      panelIds: ["example.test.summary"],
      extensionId: "example.test",
      generation: "sha256:test",
    })

    expect(source.indexOf('"fetch"')).toBeLessThan(source.indexOf(marker))
    expect(source.indexOf('"WebSocket"')).toBeLessThan(source.indexOf(marker))
    expect(source).toContain("Command is not declared by this extension")
    expect(source).toContain("Panel is not declared by this extension")
    expect(source).toContain('type: "ready"')
  })

  it("gives the hidden host a deny-by-default CSP", () => {
    const html = createExtensionRuntimeHostHtml()
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("worker-src blob:")
    expect(html).not.toContain("preload")
  })

  it("parses bounded worker requests and rejects ambient methods", () => {
    expect(
      parseExtensionWorkerMessage({
        type: "rpc",
        requestId: "rpc-1",
        method: "space.files.readText",
        params: { path: "notes/today.md" },
      })
    ).toEqual({
      type: "rpc",
      requestId: "rpc-1",
      method: "space.files.readText",
      params: { path: "notes/today.md" },
    })

    expect(() =>
      parseExtensionWorkerMessage({
        type: "rpc",
        requestId: "rpc-2",
        method: "network.fetch",
        params: { url: "https://example.com" },
      })
    ).toThrow("Unsupported runtime RPC")
  })

  it("rejects oversized semantic UI payloads", () => {
    expect(() =>
      parseExtensionWorkerMessage({
        type: "rpc",
        requestId: "rpc-3",
        method: "window.showNotice",
        params: { message: "x".repeat(4097) },
      })
    ).toThrow("Notice must be")
  })

  it("parses bounded panel requests and rejects non-JSON state", () => {
    expect(
      parseExtensionWorkerMessage({
        type: "rpc",
        requestId: "rpc-panel",
        method: "window.openPanel",
        params: {
          panelId: "example.test.summary",
          state: { completed: 3, pending: 2 },
        },
      })
    ).toEqual({
      type: "rpc",
      requestId: "rpc-panel",
      method: "window.openPanel",
      params: {
        panelId: "example.test.summary",
        state: { completed: 3, pending: 2 },
      },
    })

    expect(() =>
      parseExtensionWorkerMessage({
        type: "rpc",
        requestId: "rpc-panel-invalid",
        method: "window.openPanel",
        params: {
          panelId: "example.test.summary",
          state: { value: Number.POSITIVE_INFINITY },
        },
      })
    ).toThrow("Panel state must be JSON-safe")
  })
})
