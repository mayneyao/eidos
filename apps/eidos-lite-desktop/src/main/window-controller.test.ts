import { EventEmitter } from "node:events"
import type { WebContents, BrowserWindow } from "electron"
import type { SpaceSnapshot } from "../shared/contracts"
import type { EidosLiteServiceEnvironment } from "../shared/service-environment"
import type { GraftEncryptedInput } from "../shared/graft-sdk-contracts"
import type { SpaceCloneCoordinator } from "./sync/space-clone-coordinator"

const mocks = vi.hoisted(() => ({
  window: null as unknown,
  create: vi.fn(),
  record: vi.fn(async () => {}),
  saveDialog: vi.fn(),
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
  dialog: { showSaveDialog: mocks.saveDialog },
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
    canonical: { id, name: id, root: id },
    snapshot: vi.fn(async () => snapshot),
    close: vi.fn(async () => {}),
    onChanged: vi.fn(() => vi.fn()),
    lockEncryptedSync: vi.fn(async () => {}),
    unlockEncryptedSync: vi.fn(
      async (
        _input: unknown,
        _assertCurrent?: () => void,
        _signal?: AbortSignal
      ) => {}
    ),
  }
}
beforeEach(() => vi.clearAllMocks())

function encryptedCloneFixture() {
  const setup = fixture()
  vi.spyOn(setup.controller, "locale").mockResolvedValue("en")
  const coordinator = {
    clone: vi.fn(async () => "/downloaded"),
    cancelEncryptedClones: vi.fn(async () => {}),
  }
  ;(
    setup.controller as unknown as {
      cloneCoordinatorInstance: SpaceCloneCoordinator
    }
  ).cloneCoordinatorInstance = coordinator as unknown as SpaceCloneCoordinator
  mocks.saveDialog.mockResolvedValue({
    canceled: false,
    filePath: "/downloaded",
  })
  const encryption: GraftEncryptedInput = {
    password: Buffer.from("synthetic-test-password"),
    connection: {
      url: "https://sync-staging.eidos.space/u-alice/project",
      uuid: "00000000-0000-4000-8000-000000000001",
      authenticationDomain: "https://staging.eidos.space",
      accountSubject: "alice",
      bearerToken: "synthetic-test-token",
      stateDirectory: "/unused-test-state",
    },
  }
  const clone = (ticket?: number) =>
    setup.controller.cloneAndBindSpace(
      setup.owner,
      encryption.connection.url,
      "synthetic-test-token",
      "Downloaded",
      undefined,
      undefined,
      encryption,
      ticket
    )
  return { ...setup, coordinator, encryption, clone }
}

it("rejects an encrypted request captured before a lifecycle change, before opening the dialog", async () => {
  const { controller, clone, coordinator } = encryptedCloneFixture()
  const ticket = controller.captureEncryptedCloneTicket()
  await controller.lockEncryptedSyncSessions()
  await expect(clone(ticket)).rejects.toMatchObject({
    code: "GRAFT_SDK_E2EE_LOCKED",
  })
  expect(mocks.saveDialog).not.toHaveBeenCalled()
  expect(coordinator.clone).not.toHaveBeenCalled()
})

it("does not start a clone after locking while its destination dialog was open", async () => {
  const { controller, clone, coordinator } = encryptedCloneFixture()
  let choose!: (value: { canceled: boolean; filePath: string }) => void
  mocks.saveDialog.mockReturnValueOnce(
    new Promise((resolve) => {
      choose = resolve
    })
  )
  const result = clone()
  const rejected = expect(result).rejects.toMatchObject({
    code: "GRAFT_SDK_E2EE_LOCKED",
  })
  await vi.waitFor(() => expect(mocks.saveDialog).toHaveBeenCalledOnce())
  await controller.lockEncryptedSyncSessions()
  choose({ canceled: false, filePath: "/downloaded" })
  await rejected
  expect(coordinator.clone).not.toHaveBeenCalled()
})

it("does not unlock the source with clone credentials when draft review cancels the switch", async () => {
  const { controller, owner, clone } = encryptedCloneFixture()
  const source = session("source"),
    downloaded = session("/downloaded")
  mocks.create.mockResolvedValueOnce(source).mockResolvedValueOnce(downloaded)
  await controller.openRecentSpace(owner, "source")
  vi.mocked(controller.textDraftClose.prepare).mockResolvedValueOnce(false)
  await expect(clone()).resolves.toBeNull()
  expect(controller.sessionFor(owner)).toBe(source)
  expect(source.unlockEncryptedSync).not.toHaveBeenCalled()
  expect(source.close).not.toHaveBeenCalled()
  expect(downloaded.close).toHaveBeenCalledOnce()
})

it("preserves the source when a lifecycle change invalidates a downloaded session before binding", async () => {
  const { controller, owner, clone } = encryptedCloneFixture()
  const source = session("source"),
    downloaded = session("/downloaded")
  let finish!: (snapshot: SpaceSnapshot) => void
  downloaded.snapshot.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  mocks.create.mockResolvedValueOnce(source).mockResolvedValueOnce(downloaded)
  await controller.openRecentSpace(owner, "source")
  const result = clone()
  const rejected = expect(result).rejects.toMatchObject({
    code: "GRAFT_SDK_E2EE_LOCKED",
  })
  await vi.waitFor(() => expect(downloaded.snapshot).toHaveBeenCalledOnce())
  const locking = controller.lockEncryptedSyncSessions()
  finish({ id: "/downloaded" } as SpaceSnapshot)
  await locking
  await rejected
  expect(controller.sessionFor(owner)).toBe(source)
  expect(source.close).not.toHaveBeenCalled()
  expect(source.unlockEncryptedSync).not.toHaveBeenCalled()
  expect(downloaded.close).toHaveBeenCalledOnce()
  expect(downloaded.unlockEncryptedSync).not.toHaveBeenCalled()
})

it("waits for a newly bound clone to finish unlocking and lock again before lifecycle draining completes", async () => {
  const { controller, clone } = encryptedCloneFixture()
  const downloaded = session("/downloaded")
  let finishUnlock!: () => void
  downloaded.unlockEncryptedSync.mockReturnValueOnce(
    new Promise((resolve) => {
      finishUnlock = resolve
    })
  )
  mocks.create.mockResolvedValueOnce(downloaded)
  const result = clone()
  const rejected = expect(result).rejects.toMatchObject({
    code: "GRAFT_SDK_E2EE_LOCKED",
  })
  await vi.waitFor(() =>
    expect(downloaded.unlockEncryptedSync).toHaveBeenCalledOnce()
  )
  let drained = false
  const locking = controller.lockEncryptedSyncSessions().then(() => {
    drained = true
  })
  expect(downloaded.unlockEncryptedSync.mock.calls[0]?.[2]?.aborted).toBe(true)
  await vi.waitFor(() =>
    expect(downloaded.lockEncryptedSync).toHaveBeenCalledOnce()
  )
  expect(drained).toBe(false)
  finishUnlock()
  await locking
  await rejected
  expect(downloaded.lockEncryptedSync).toHaveBeenCalledTimes(2)
})

it("invalidates pending clone requests and drains the coordinator when shutting down", async () => {
  const { controller, coordinator, clone } = encryptedCloneFixture()
  const ticket = controller.captureEncryptedCloneTicket()
  let finish!: () => void
  coordinator.cancelEncryptedClones.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  let closed = false
  const closing = controller.closeAll().then(() => {
    closed = true
  })
  await vi.waitFor(() =>
    expect(coordinator.cancelEncryptedClones).toHaveBeenCalledOnce()
  )
  expect(closed).toBe(false)
  await expect(clone(ticket)).rejects.toMatchObject({
    code: "GRAFT_SDK_E2EE_LOCKED",
  })
  finish()
  await closing
})

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

it("restores a shared Space without an editor and reuses it when the editor opens", async () => {
  const { controller, owner } = fixture()
  const restored = session("shared")
  mocks.create.mockResolvedValueOnce(restored)
  await controller.restoreDeviceSyncSpace("shared", "shared")
  expect(controller.sessionFor(owner)).toBeNull()
  await controller.openRecentSpace(owner, "shared")
  expect(controller.sessionFor(owner)).toBe(restored)
  expect(mocks.create).toHaveBeenCalledOnce()
  await controller.closeAll()
  expect(restored.close).toHaveBeenCalledOnce()
})

it("does not restore a replacement folder at a previously shared path", async () => {
  const { controller } = fixture()
  await expect(
    controller.restoreDeviceSyncSpace("replacement", "original")
  ).rejects.toThrow("identity has changed")
  expect(mocks.create).not.toHaveBeenCalled()
})
