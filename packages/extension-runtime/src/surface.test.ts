import { describe, expect, it } from "vitest"
import {
  createExtensionSurfaceHostHtml,
  createExtensionSurfaceSource,
  extensionSurfaceDataUrl,
} from "./surface"

describe("extension surface bootstrap", () => {
  it("keeps untrusted bundle text out of the fixed iframe document", () => {
    const marker = '</script><script data-leak="true">'
    const html = createExtensionSurfaceHostHtml()
    const source = createExtensionSurfaceSource({
      bundleCode: `const marker = ${JSON.stringify(marker)};`,
      extensionId: "example.tasks",
      generation: "generation-1",
    })

    expect(html).not.toContain(marker)
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("form-action 'none'")
    expect(html).toContain("eidos-extension-root")
    expect(html).toContain("event.source !== parent")
    expect(source).toContain("data-leak")
    expect(source).toContain("__eidosStartSurface")
    expect(source).toContain('message.surfaceKind === "panel"')
    expect(source).toContain('message.surfaceKind === "file-editor"')
    expect(source).toContain('message.surfaceKind === "base-view"')
    expect(source).toContain('type: "base-page-request"')
    expect(source).toContain('message.type === "base-page-result"')
    expect(source).toContain('message.type === "base-context-changed"')
    expect(source).toContain('type: "surface-log"')
    expect(source).toContain('Object.defineProperty(globalThis, "console"')
    expect(source).toContain('send({ type: "ready"')
  })

  it("disposes panel surfaces without requiring a document snapshot", () => {
    const source = createExtensionSurfaceSource({
      bundleCode: "export function activate() {}",
      extensionId: "example.panel",
      generation: "generation-1",
    })

    expect(source.indexOf('if (message.type === "dispose")')).toBeLessThan(
      source.lastIndexOf("if (!snapshot) return")
    )
  })

  it("exposes a data URL containing only the fixed host", () => {
    const url = extensionSurfaceDataUrl()
    expect(url).toMatch(/^data:text\/html;charset=utf-8,/)
    expect(decodeURIComponent(url.split(",", 2)[1])).toBe(
      createExtensionSurfaceHostHtml()
    )
  })
})
