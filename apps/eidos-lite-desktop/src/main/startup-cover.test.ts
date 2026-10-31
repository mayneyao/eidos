import { EventEmitter } from "node:events"
import type { BrowserWindow } from "electron"

const native = vi.hoisted(() => ({
  bounds: vi.fn(),
  loadURL: vi.fn(async (_url: string) => {}),
  close: vi.fn(),
  destroyed: vi.fn(() => false),
}))
vi.mock("electron", () => ({
  WebContentsView: class {
    setBounds = native.bounds
    webContents = {
      loadURL: native.loadURL,
      close: native.close,
      isDestroyed: native.destroyed,
    }
  },
}))
import { StartupCover } from "./startup-cover"

function fixture() {
  const owner = Object.assign(new EventEmitter(), {
    isDestroyed: vi.fn(() => false),
    getContentBounds: vi.fn(() => ({ width: 1000, height: 700 })),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    webContents: { capturePage: vi.fn(async () => {}) },
  })
  return { owner, cover: new StartupCover(owner as unknown as BrowserWindow) }
}

beforeEach(() => vi.clearAllMocks())

it("retains the independent logo through navigation until the workbench frame is available", async () => {
  const { owner, cover } = fixture()
  let painted!: () => void
  owner.webContents.capturePage.mockReturnValue(
    new Promise<void>((resolve) => {
      painted = resolve
    })
  )
  await cover.load("zh-CN")
  expect(decodeURIComponent(native.loadURL.mock.calls[0]![0])).toContain(
    "正在打开…"
  )
  owner.emit("did-start-navigation")
  expect(native.close).not.toHaveBeenCalled()
  const reveal = cover.reveal()
  expect(owner.contentView.removeChildView).not.toHaveBeenCalled()
  expect(native.close).not.toHaveBeenCalled()
  painted()
  await reveal
  expect(owner.contentView.removeChildView).toHaveBeenCalledOnce()
  expect(native.close).toHaveBeenCalledOnce()
  await cover.reveal()
  expect(owner.webContents.capturePage).toHaveBeenCalledOnce()
})

it("resizes with the owner and safely closes while a frame is pending", async () => {
  const { owner, cover } = fixture()
  owner.getContentBounds.mockReturnValue({ width: 1320, height: 860 })
  owner.emit("resize")
  expect(native.bounds).toHaveBeenLastCalledWith({
    x: 0,
    y: 0,
    width: 1320,
    height: 860,
  })
  let painted!: () => void
  owner.webContents.capturePage.mockReturnValue(
    new Promise<void>((resolve) => {
      painted = resolve
    })
  )
  const reveal = cover.reveal()
  owner.isDestroyed.mockReturnValue(true)
  owner.emit("closed")
  expect(native.close).toHaveBeenCalledOnce()
  expect(owner.contentView.removeChildView).not.toHaveBeenCalled()
  painted()
  await reveal
  expect(native.close).toHaveBeenCalledOnce()
  expect(owner.listenerCount("resize")).toBe(0)
})

it("cleans up if the renderer disappears before capture completes", async () => {
  const { owner, cover } = fixture()
  owner.webContents.capturePage.mockRejectedValueOnce(
    new Error("Renderer closed")
  )
  await expect(cover.reveal()).rejects.toThrow("Renderer closed")
  expect(native.close).toHaveBeenCalledOnce()
})
