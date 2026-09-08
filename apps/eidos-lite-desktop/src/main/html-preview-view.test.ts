import { EventEmitter } from "node:events"
import type { WebContents, WebPreferences } from "electron"
import { describe, expect, it, vi } from "vitest"
vi.mock("electron", () => ({
  session: {
    fromPartition: () => ({
      protocol: { isProtocolHandled: () => true },
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn() },
      on: vi.fn(),
    }),
  },
}))
vi.mock("./space/document-file-preview", () => ({
  htmlPreviewPartition: () => "html-test",
  isHtmlPreviewUrlForRoot: (url: string) =>
    url === "eidos-space-document://test/index.html",
  serveDocumentPreview: vi.fn(),
}))
import {
  HtmlPreviewViewManager,
  installHtmlPreviewGuestGuard,
} from "./html-preview-view"
describe("HTML webview boundary", () => {
  it("forwards guest clicks only to its host without consuming them", async () => {
    const owner = Object.assign(new EventEmitter(), {
      id: 43,
      send: vi.fn(),
      isDestroyed: () => false,
    })
    const guest = Object.assign(new EventEmitter(), {
      setWindowOpenHandler: vi.fn(),
      isDestroyed: () => false,
      close: vi.fn(),
    })
    installHtmlPreviewGuestGuard(owner as unknown as WebContents)
    const manager = new HtmlPreviewViewManager(vi.fn())
    await manager.open(owner as unknown as WebContents, "/space", {
      previewId: "click-test",
      url: "eidos-space-document://test/index.html",
    })
    owner.emit("did-attach-webview", {}, guest)
    const event = { preventDefault: vi.fn() }
    guest.emit("before-mouse-event", event, { type: "mouseMove" })
    expect(owner.send).not.toHaveBeenCalled()
    guest.emit("before-mouse-event", event, { type: "mouseDown" })
    expect(owner.send).toHaveBeenCalledExactlyOnceWith(
      "eidos-lite:html-preview-pointer-down"
    )
    expect(event.preventDefault).not.toHaveBeenCalled()
    manager.closeAll()
  })
  it("denies arbitrary guests and hardens only the authorized preview", async () => {
    const owner = Object.assign(new EventEmitter(), { id: 42 })
    installHtmlPreviewGuestGuard(owner as unknown as WebContents)
    const event = { preventDefault: vi.fn() }
    const preferences: WebPreferences = {
      preload: "/unsafe.js",
      nodeIntegration: true,
      sandbox: false,
    }
    const params = {
      src: "eidos-space-document://test/index.html",
      partition: "html-test",
    }
    owner.emit("will-attach-webview", event, preferences, params)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    const manager = new HtmlPreviewViewManager(vi.fn())
    await manager.open(owner as unknown as WebContents, "/space", {
      previewId: "one",
      url: params.src,
    })
    event.preventDefault.mockClear()
    owner.emit("will-attach-webview", event, preferences, {
      ...params,
      partition: "persist:account",
    })
    expect(event.preventDefault).toHaveBeenCalledOnce()
    event.preventDefault.mockClear()
    owner.emit("will-attach-webview", event, preferences, params)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(preferences.preload).toBeUndefined()
    expect(preferences).toMatchObject({
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true,
      webviewTag: false,
      webSecurity: true,
    })
    manager.closeAll()
    owner.emit("will-attach-webview", event, preferences, params)
    expect(event.preventDefault).toHaveBeenCalledOnce()
  })
})
