import { EventEmitter } from "node:events"
import type { WebContents, BrowserWindow } from "electron"
import type { SpaceSnapshot } from "../shared/contracts"
import type { EidosLiteServiceEnvironment } from "../shared/service-environment"

const mocks = vi.hoisted(() => ({
  window: null as unknown,
  create: vi.fn(),
  record: vi.fn(async () => {}),
  canonical: vi.fn(async (root: string) => ({
    id: root,
    root,
    name: root,
    displayPath: root,
  })),
}))
vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/eidos-window-controller-tests",
    getLocale: () => "en",
  },
  BrowserWindow: {
    fromWebContents: () => mocks.window,
    getFocusedWindow: () => mocks.window,
    getAllWindows: () => [mocks.window],
  },
  nativeTheme: { on: vi.fn() },
  clipboard: {},
  dialog: {},
  screen: {},
  shell: {},
  utilityProcess: {},
  session: {},
  WebContentsView: class {},
}))
vi.mock("./space/space-session", () => ({
  SpaceSession: { createCanonical: mocks.create },
}))
vi.mock("./space/space-paths", async (original) => ({
  ...(await original<object>()),
  canonicalizeSpaceRoot: mocks.canonical,
}))
vi.mock("./space/recent-spaces", () => ({
  RecentSpacesStore: class {
    pathFor(id: string) {
      return Promise.resolve(id)
    }
    record = mocks.record
  },
}))
import { WindowController } from "./window-controller"

function fixture() {
  const contents = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    isLoading: () => false,
    send: vi.fn(),
  })
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
    isMinimized: () => false,
    show: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
  })
  mocks.window = window
  const controller = new WindowController({} as EidosLiteServiceEnvironment)
  const internals = controller as unknown as {
    createGraftClient(): unknown
    runtimeWorkerPath(): string
    promoteToSpaceWindow(window: BrowserWindow): void
  }
  vi.spyOn(internals, "createGraftClient").mockReturnValue({})
  vi.spyOn(internals, "runtimeWorkerPath").mockReturnValue("unused")
  vi.spyOn(internals, "promoteToSpaceWindow").mockImplementation(() => {})
  vi.spyOn(controller.textDraftClose, "prepare").mockResolvedValue(true)
  const owner = contents as unknown as WebContents
  return { controller, contents, window, owner }
}
function session(id: string) {
  const snapshot = { id, name: id } as SpaceSnapshot
  return {
    canonical: { id, name: id },
    snapshot: vi.fn(async () => snapshot),
    close: vi.fn(async () => {}),
    onChanged: vi.fn(() => vi.fn()),
  }
}
beforeEach(() => vi.clearAllMocks())

it("opens Settings in its own window and reuses that window", () => {
  const { controller, window } = fixture()
  const settingsWindow = Object.assign(new EventEmitter(), {
    webContents: { isLoading: () => false },
    isDestroyed: () => false,
    isMinimized: () => false,
    show: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
  }) as unknown as BrowserWindow
  const internals = controller as unknown as {
    createWindow(show: boolean, kind: string): BrowserWindow
    loadRenderer(window: BrowserWindow, route: string): Promise<void>
    locale(): Promise<"en">
  }
  const create = vi
    .spyOn(internals, "createWindow")
    .mockReturnValue(settingsWindow)
  const load = vi.spyOn(internals, "loadRenderer").mockResolvedValue()
  vi.spyOn(internals, "locale").mockResolvedValue("en")
  expect(controller.showSettingsWindow()).toBe(settingsWindow)
  expect(settingsWindow).not.toBe(window)
  expect(create).toHaveBeenCalledWith(true, "settings")
  expect(load).toHaveBeenCalledWith(settingsWindow, "/settings/preferences")
  expect(controller.showSettingsWindow()).toBe(settingsWindow)
  expect(create).toHaveBeenCalledOnce()
})

it("keeps the old Space alive on cancel and failed opens, then releases it once on a successful switch", async () => {
  const { controller, owner, window } = fixture()
  const first = session("first"),
    cancelled = session("cancelled"),
    next = session("next")
  mocks.create.mockResolvedValueOnce(first)
  await controller.openRecentSpace(owner, "first")
  vi.mocked(controller.textDraftClose.prepare).mockResolvedValueOnce(false)
  mocks.create.mockResolvedValueOnce(cancelled)
  expect(await controller.openRecentSpace(owner, "cancelled")).toBeNull()
  expect(first.close).not.toHaveBeenCalled()
  expect(cancelled.close).toHaveBeenCalledOnce()
  expect(controller.sessionFor(owner)).toBe(first)
  mocks.create.mockRejectedValueOnce(new Error("Folder unavailable"))
  await expect(controller.openRecentSpace(owner, "failed")).rejects.toThrow(
    "Folder unavailable"
  )
  expect(controller.sessionFor(owner)).toBe(first)
  mocks.create.mockResolvedValueOnce(next)
  const released = vi.fn()
  controller.onSpaceReleased = released
  expect((await controller.openRecentSpace(owner, "next"))?.id).toBe("next")
  expect(first.close).toHaveBeenCalledOnce()
  expect(controller.sessionFor(owner)).toBe(next)
  expect(released).toHaveBeenCalledOnce()
  expect(window.listenerCount("close")).toBe(1)
  expect(window.listenerCount("closed")).toBe(2)
})

it("rejects a second concurrent open rather than leaking competing sessions", async () => {
  const { controller, owner } = fixture()
  let finish!: (value: ReturnType<typeof session>) => void
  mocks.create.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const first = controller.openRecentSpace(owner, "first")
  await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce())
  await expect(controller.openRecentSpace(owner, "other")).rejects.toThrow(
    "already opening"
  )
  finish(session("first"))
  await first
})

it("retains shared Spaces across switching, reuses them on reopen, and releases only after sync stops", async () => {
  const { controller, owner } = fixture()
  const first = session("shared"),
    next = session("next")
  mocks.create.mockResolvedValueOnce(first).mockResolvedValueOnce(next)
  await controller.openRecentSpace(owner, "shared")
  controller.retainDeviceSync(
    first as unknown as Parameters<WindowController["retainDeviceSync"]>[0]
  )
  await controller.openRecentSpace(owner, "next")
  expect(first.close).not.toHaveBeenCalled()
  await controller.openRecentSpace(owner, "shared")
  expect(mocks.create).toHaveBeenCalledTimes(2)
  expect(controller.sessionFor(owner)).toBe(first)
  await controller.releaseDeviceSync("shared")
  expect(first.close).not.toHaveBeenCalled()
  await controller.closeAll()
  expect(first.close).toHaveBeenCalledOnce()
})

it("releases a background shared Space when device sync is disabled", async () => {
  const { controller, owner } = fixture()
  const first = session("shared"),
    next = session("next")
  mocks.create.mockResolvedValueOnce(first).mockResolvedValueOnce(next)
  await controller.openRecentSpace(owner, "shared")
  controller.retainDeviceSync(
    first as unknown as Parameters<WindowController["retainDeviceSync"]>[0]
  )
  await controller.openRecentSpace(owner, "next")
  await controller.releaseDeviceSync("shared")
  expect(first.close).toHaveBeenCalledOnce()
  expect(next.close).not.toHaveBeenCalled()
})
