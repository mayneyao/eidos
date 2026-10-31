import { EventEmitter } from "node:events"
import type { WebContents, BrowserWindow } from "electron"
import type { SpaceSnapshot } from "../shared/contracts"
import type { EidosLiteServiceEnvironment } from "../shared/service-environment"
import type { GraftEncryptedInput } from "../shared/graft-sdk-contracts"
import type { SpaceCloneCoordinator } from "./sync/space-clone-coordinator"

const mocks = vi.hoisted(() => ({
  sessionModuleLoads: 0,
  window: null as unknown,
  create: vi.fn(),
  record: vi.fn(async () => {}),
  saveDialog: vi.fn(),
  displayMatching: vi.fn(
    (_bounds: { x: number; y: number; width: number; height: number }) => ({
      id: 1,
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    })
  ),
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
  screen: {
    getDisplayMatching: mocks.displayMatching,
  },
  shell: {},
  utilityProcess: {},
  session: {},
  WebContentsView: class {},
}))
vi.mock("./space/space-session", () => {
  mocks.sessionModuleLoads++
  return { SpaceSession: { createCanonical: mocks.create } }
})
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
import { DEFAULT_EIDOS_LITE_PREFERENCES } from "./app-preferences"

function fixture() {
  const contents = Object.assign(new EventEmitter(), {
    id: 1,
    isDestroyed: () => false,
    isLoading: () => false,
    setZoomFactor: vi.fn(),
    send: vi.fn(),
  })
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: (): boolean => false,
    isMinimized: () => false,
    show: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 500, height: 600 })),
  })
  mocks.window = window
  const controller = new WindowController({} as EidosLiteServiceEnvironment)
  vi.spyOn(controller, "getPreferences").mockResolvedValue(
    DEFAULT_EIDOS_LITE_PREFERENCES
  )
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
    closeEidosFile: vi.fn(async () => {}),
    onChanged: vi.fn(() => vi.fn()),
    relativePathForRuntime: vi.fn((sessionId: string) =>
      sessionId === "catalog" ? ".eidos/files.eidos" : "b.md"
    ),
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
beforeEach(() => {
  vi.clearAllMocks()
  mocks.displayMatching.mockImplementation(() => ({
    id: 1,
    workArea: { x: 0, y: 0, width: 1440, height: 900 },
  }))
})

it("keeps Space runtime loading out of the Welcome controller", () => {
  expect(mocks.sessionModuleLoads).toBe(0)
  fixture()
  expect(mocks.sessionModuleLoads).toBe(0)
})

function defaultWindowFixture() {
  const setup = fixture()
  const internals = setup.controller as unknown as {
    createWindow(show: boolean, kind: string): BrowserWindow
    loadRenderer(window: BrowserWindow): Promise<void>
  }
  const create = vi
    .spyOn(internals, "createWindow")
    .mockReturnValue(setup.window as unknown as BrowserWindow)
  const load = vi.spyOn(internals, "loadRenderer").mockResolvedValue()
  const welcome = vi
    .spyOn(setup.controller, "createWelcomeWindow")
    .mockReturnValue(setup.window as unknown as BrowserWindow)
  const focus = vi
    .spyOn(setup.controller, "focusAnyWindow")
    .mockReturnValue(null)
  const recents = vi
    .spyOn(setup.controller, "listRecentSpaces")
    .mockResolvedValue([
      {
        id: "last",
        name: "Last",
        path: "last",
        available: true,
        lastOpenedAt: "2026-10-29T00:00:00Z",
      },
      {
        id: "older",
        name: "Older",
        path: "older",
        available: true,
        lastOpenedAt: "2026-10-28T00:00:00Z",
      },
    ])
  return { ...setup, create, load, welcome, focus, recents }
}

it.each([true, false])(
  "routes properties to its own HTML entry (development: %s)",
  async (development) => {
    const setup = fixture()
    const loadURL = vi.fn(async () => {})
    const loadFile = vi.fn(async () => {})
    const window = {
      isDestroyed: () => false,
      loadURL,
      loadFile,
      webContents: {
        getURL: () =>
          "http://localhost:5179/file-properties.html#/file-properties",
      },
    } as unknown as BrowserWindow
    const controller = setup.controller as unknown as {
      loadRenderer(window: BrowserWindow, route?: string): Promise<void>
    }
    vi.stubEnv(
      "VITE_DEV_SERVER_URL",
      development ? "http://localhost:5179/" : ""
    )
    try {
      await controller.loadRenderer(window, "/file-properties")
      if (development) {
        expect(loadURL).toHaveBeenCalledWith(
          "http://localhost:5179/file-properties.html#/file-properties"
        )
      } else {
        expect(loadFile).toHaveBeenCalledWith(
          expect.stringContaining("/dist/file-properties.html"),
          { hash: "/file-properties" }
        )
      }
    } finally {
      vi.unstubAllEnvs()
    }
  }
)

it.each([true, false])(
  "passes the saved startup theme before the document loads (development: %s)",
  async (development) => {
    const { controller } = fixture()
    vi.mocked(controller.getPreferences).mockResolvedValue({
      ...DEFAULT_EIDOS_LITE_PREFERENCES,
      appearance: "dark",
    })
    const window = {
      isDestroyed: () => false,
      loadURL: vi.fn(async () => {}),
      loadFile: vi.fn(async () => {}),
      webContents: {
        getURL: () => "http://localhost:5179/?appearance=dark#/opening",
      },
    }
    vi.stubEnv(
      "VITE_DEV_SERVER_URL",
      development ? "http://localhost:5179/" : ""
    )
    try {
      await (
        controller as unknown as {
          loadRenderer(window: unknown, route: string): Promise<void>
        }
      ).loadRenderer(window, "/opening")
      if (development)
        expect(window.loadURL).toHaveBeenCalledWith(
          "http://localhost:5179/?appearance=dark#/opening"
        )
      else
        expect(window.loadFile).toHaveBeenCalledWith(
          expect.stringContaining("/dist/index.html"),
          { hash: "/opening", query: { appearance: "dark" } }
        )
    } finally {
      vi.unstubAllEnvs()
    }
  }
)

it("loads the renderer in parallel with restoration and reuses the initial snapshot", async () => {
  const setup = defaultWindowFixture()
  const last = session("last")
  mocks.create.mockResolvedValueOnce(last)
  await setup.controller.openDefaultWindow()
  expect(setup.controller.sessionFor(setup.owner)).toBe(last)
  expect(setup.create).toHaveBeenCalledExactlyOnceWith(false, "space")
  expect(setup.recents).toHaveBeenCalledExactlyOnceWith(1)
  expect(setup.load).toHaveBeenCalledExactlyOnceWith(setup.window, "/opening")
  expect(last.snapshot.mock.invocationCallOrder[0]).toBeGreaterThan(
    setup.load.mock.invocationCallOrder[0]!
  )
  expect(setup.welcome).not.toHaveBeenCalled()
  await setup.controller.spaceSnapshot(setup.owner, true)
  await setup.controller.spaceSnapshot(setup.owner, true)
  expect(last.snapshot).toHaveBeenCalledOnce()
  await setup.controller.spaceSnapshot(setup.owner)
  expect(last.snapshot).toHaveBeenCalledTimes(2)
})

it("does not wait for plugin backgrounds before making the Space usable", async () => {
  const setup = defaultWindowFixture()
  let finish!: () => void
  setup.controller.pluginSpaceOpened = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  mocks.create.mockResolvedValueOnce(session("last"))
  try {
    await setup.controller.openDefaultWindow()
    expect(setup.controller.pluginSpaceOpened).toHaveBeenCalledOnce()
    await expect(
      setup.controller.spaceSnapshot(setup.owner, true)
    ).resolves.not.toBeNull()
  } finally {
    finish?.()
  }
})

it.each([false, true])(
  "cleans startup snapshots after native window destruction (failed restore: %s)",
  async (failed) => {
    const setup = defaultWindowFixture()
    if (failed)
      mocks.create.mockRejectedValueOnce(new Error("Unavailable Space"))
    else mocks.create.mockResolvedValueOnce(session("last"))
    await setup.controller.openDefaultWindow()
    const snapshots = (
      setup.controller as unknown as {
        initialSpaceSnapshots: Map<number, Promise<SpaceSnapshot | null>>
      }
    ).initialSpaceSnapshots
    expect(snapshots.has(setup.owner.id)).toBe(true)
    setup.window.isDestroyed = () => true
    Object.defineProperty(setup.window, "webContents", {
      get() {
        throw new TypeError("Object has been destroyed")
      },
    })
    expect(() => setup.window.emit("closed")).not.toThrow()
    expect(snapshots.has(setup.owner.id)).toBe(false)
    await expect(
      setup.controller.spaceSnapshot(setup.owner, true)
    ).resolves.toBeNull()
  }
)

it("shows a lightweight startup page without waiting for Space initialization", async () => {
  const setup = defaultWindowFixture()
  const loadURL = vi.fn(async (_url: string) => {})
  Object.assign(setup.window, { loadURL })
  await setup.controller.createStartupWindow()
  expect(setup.create).toHaveBeenCalledExactlyOnceWith(false, "space")
  expect(loadURL).not.toHaveBeenCalled()
  expect(setup.window.show).toHaveBeenCalledOnce()
  expect(setup.recents).not.toHaveBeenCalled()
  expect(setup.load).toHaveBeenCalledExactlyOnceWith(setup.window, "/opening")
})

it("reuses the visible startup window while a slow Space opens", async () => {
  const setup = defaultWindowFixture()
  let finish!: (value: ReturnType<typeof session>) => void
  mocks.create.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const startup = await setup.controller.createStartupWindow()
  setup.focus.mockReturnValue(startup)
  const opening = setup.controller.openDefaultWindow(startup)
  await vi.waitFor(() => expect(mocks.create).toHaveBeenCalled())
  expect(setup.load).toHaveBeenCalledExactlyOnceWith(startup, "/opening")
  let resolved = false
  const initial = setup.controller.spaceSnapshot(setup.owner, true).then(() => {
    resolved = true
  })
  await Promise.resolve()
  expect(resolved).toBe(false)
  expect(setup.create).toHaveBeenCalledOnce()
  finish(session("last"))
  await opening
  await initial
  expect(resolved).toBe(true)
  expect(setup.load).toHaveBeenCalledExactlyOnceWith(startup, "/opening")
})

it("loads Welcome in the startup window when recents are empty", async () => {
  const setup = defaultWindowFixture()
  setup.recents.mockResolvedValue([])
  const startup = await setup.controller.createStartupWindow()
  const initial = setup.controller.spaceSnapshot(setup.owner, true)
  await setup.controller.openDefaultWindow(startup)
  await expect(initial).resolves.toBeNull()
  expect(setup.load).toHaveBeenCalledExactlyOnceWith(setup.window, "/opening")
  expect(setup.welcome).not.toHaveBeenCalled()
})

it("does not reopen a startup window closed during recovery", async () => {
  const setup = defaultWindowFixture()
  setup.window.isDestroyed = () => true
  await setup.controller.openDefaultWindow(
    setup.window as unknown as BrowserWindow
  )
  expect(setup.recents).not.toHaveBeenCalled()
  expect(setup.load).not.toHaveBeenCalled()
})

it.each(["empty", "unavailable"])(
  "distinguishes %s recents without choosing an older Space",
  async (kind) => {
    const setup = defaultWindowFixture()
    if (kind === "empty") setup.recents.mockResolvedValue([])
    else
      setup.recents.mockResolvedValue([
        {
          id: "last",
          name: "Last",
          path: "last",
          available: false,
          lastOpenedAt: "2026-10-29T00:00:00Z",
        },
        {
          id: "older",
          name: "Older",
          path: "older",
          available: true,
          lastOpenedAt: "2026-10-28T00:00:00Z",
        },
      ])
    await setup.controller.openDefaultWindow()
    expect(setup.welcome).not.toHaveBeenCalled()
    expect(setup.create).toHaveBeenCalledOnce()
    const initial = setup.controller.spaceSnapshot(setup.owner, true)
    if (kind === "empty") await expect(initial).resolves.toBeNull()
    else await expect(initial).rejects.toThrow("last Space is unavailable")
  }
)

it("uses the same window as Welcome when the last Space fails to open", async () => {
  const setup = defaultWindowFixture()
  mocks.create.mockRejectedValueOnce(new Error("Space is locked"))
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    await setup.controller.openDefaultWindow()
    expect(setup.controller.sessionFor(setup.owner)).toBeNull()
    expect(setup.create).toHaveBeenCalledOnce()
    expect(setup.load).toHaveBeenCalledExactlyOnceWith(setup.window, "/opening")
    await expect(
      setup.controller.spaceSnapshot(setup.owner, true)
    ).rejects.toThrow("Space is locked")
    expect(setup.welcome).not.toHaveBeenCalled()
    expect(warning).toHaveBeenCalledWith(
      "Could not reopen the last Space",
      expect.any(Error)
    )
  } finally {
    warning.mockRestore()
  }
})

it("preserves the history read error for recovery", async () => {
  const setup = defaultWindowFixture()
  setup.recents.mockRejectedValueOnce(new SyntaxError("Invalid recent Spaces"))
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
  try {
    await setup.controller.openDefaultWindow()
    expect(setup.welcome).not.toHaveBeenCalled()
    await expect(
      setup.controller.spaceSnapshot(setup.owner, true)
    ).rejects.toThrow("Invalid recent Spaces")
    expect(warning).toHaveBeenCalledWith(
      "Could not read the last Space",
      expect.any(SyntaxError)
    )
  } finally {
    warning.mockRestore()
  }
})

it("coalesces overlapping startup and activation requests", async () => {
  const setup = defaultWindowFixture()
  mocks.create.mockResolvedValueOnce(session("last"))
  const first = setup.controller.openDefaultWindow()
  const second = setup.controller.openDefaultWindow()
  expect(first).toBe(second)
  await Promise.all([first, second])
  expect(setup.create).toHaveBeenCalledOnce()
})

it("keeps a window opened during the recent Space lookup", async () => {
  const setup = defaultWindowFixture()
  setup.recents.mockImplementation(async () => {
    setup.focus.mockReturnValue(setup.window as unknown as BrowserWindow)
    return []
  })
  await setup.controller.openDefaultWindow()
  expect(setup.create).not.toHaveBeenCalled()
  expect(setup.welcome).not.toHaveBeenCalled()
})

it("does not create a default window after shutdown starts", async () => {
  const setup = defaultWindowFixture()
  setup.recents.mockImplementation(async () => {
    await setup.controller.closeAll()
    return []
  })
  await setup.controller.openDefaultWindow()
  expect(setup.create).not.toHaveBeenCalled()
  expect(setup.welcome).not.toHaveBeenCalled()
})

it("releases a closed Space without reopening the selector", async () => {
  const setup = defaultWindowFixture()
  const last = session("last")
  mocks.create.mockResolvedValueOnce(last)
  await setup.controller.openRecentSpace(setup.owner, "last")
  vi.spyOn(setup.window, "isDestroyed").mockReturnValue(true)
  setup.window.emit("closed")
  expect(setup.controller.sessionFor(setup.owner)).toBeNull()
  expect(last.close).toHaveBeenCalledOnce()
  expect(setup.welcome).not.toHaveBeenCalled()
})

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

it("reuses a separate property window without registering it as a Space owner", async () => {
  const { controller, owner } = fixture()
  const current = session("properties-space")
  mocks.create.mockResolvedValueOnce(current)
  await controller.openRecentSpace(owner, "properties-space")
  const childContents = Object.assign(new EventEmitter(), {
    id: 22,
    send: vi.fn(),
    isDestroyed: () => false,
    setZoomFactor: vi.fn(),
    getZoomFactor: vi.fn(() => 1),
  })
  const child = Object.assign(new EventEmitter(), {
    webContents: childContents,
    isDestroyed: () => false,
    isMinimized: () => false,
    show: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    close: vi.fn(),
    getBounds: () => ({ x: 50, y: 50, width: 400, height: 500 }),
    getContentBounds: () => ({ x: 50, y: 78, width: 400, height: 472 }),
    setBounds: vi.fn(),
  })
  const internals = controller as unknown as {
    createWindow(show: boolean, kind: string): BrowserWindow
    loadRenderer(window: BrowserWindow, route: string): Promise<void>
  }
  const create = vi
    .spyOn(internals, "createWindow")
    .mockReturnValue(child as unknown as BrowserWindow)
  vi.spyOn(internals, "loadRenderer").mockResolvedValue()
  vi.spyOn(controller, "locale").mockResolvedValue("en")
  vi.spyOn(controller, "getPreferences").mockResolvedValue(
    DEFAULT_EIDOS_LITE_PREFERENCES
  )
  controller.showFileProperties(owner, "a.md")
  expect(create).toHaveBeenCalledWith(false, "properties")
  expect(child.show).not.toHaveBeenCalled()
  expect(
    controller.filePropertiesTarget(childContents as unknown as WebContents)
  ).toBe("a.md")
  expect(controller.sessionFor(childContents as unknown as WebContents)).toBe(
    current
  )
  controller.showFileProperties(owner, "b.md")
  expect(child.show).not.toHaveBeenCalled()
  expect(create).toHaveBeenCalledOnce()
  expect(childContents.send).toHaveBeenCalledWith(
    "eidos-lite:file-properties-changed",
    "b.md"
  )
  controller.pinFilePropertiesRuntime(
    childContents as unknown as WebContents,
    "catalog"
  )
  childContents.send.mockClear()
  controller.notifyFilePropertiesChanged(
    childContents as unknown as WebContents,
    "catalog"
  )
  expect(childContents.send).not.toHaveBeenCalled()
  expect(
    (owner as unknown as { send: ReturnType<typeof vi.fn> }).send
  ).toHaveBeenCalledWith("eidos-lite:file-properties-changed", "b.md")
  expect(controller.filePropertiesRuntimePinned(owner, "catalog")).toBe(true)
  controller.resizeFileProperties(childContents as unknown as WebContents, 126)
  expect(child.setBounds).toHaveBeenLastCalledWith(
    {
      x: 50,
      y: 223,
      width: 400,
      height: 154,
    },
    false
  )
  expect(child.show).toHaveBeenCalledOnce()
  expect(child.setBounds.mock.invocationCallOrder[0]).toBeLessThan(
    child.show.mock.invocationCallOrder[0]!
  )
  childContents.getZoomFactor.mockReturnValue(1.5)
  controller.resizeFileProperties(childContents as unknown as WebContents, 200)
  expect(child.setBounds).toHaveBeenLastCalledWith(
    { x: 50, y: 50, width: 400, height: 328 },
    true
  )
  controller.resizeFileProperties(childContents as unknown as WebContents, 2000)
  expect(child.setBounds).toHaveBeenLastCalledWith(
    {
      x: 50,
      y: 0,
      width: 400,
      height: 900,
    },
    true
  )
  expect(child.show).toHaveBeenCalledOnce()
  const closeEvent = { preventDefault: vi.fn() }
  child.emit("close", closeEvent)
  expect(closeEvent.preventDefault).toHaveBeenCalledOnce()
  expect(childContents.send).toHaveBeenCalledWith(
    "eidos-lite:file-properties-prepare-close",
    expect.any(String)
  )
  const token = childContents.send.mock.calls.at(-1)![1] as string
  controller.replyFilePropertiesClose(
    childContents as unknown as WebContents,
    token,
    true
  )
  await Promise.resolve()
  expect(child.close).toHaveBeenCalledOnce()
  child.emit("closed")
  expect(current.close).not.toHaveBeenCalled()
  expect(controller.sessionFor(owner)).toBe(current)
  expect(
    controller.sessionFor(childContents as unknown as WebContents)
  ).toBeNull()
  expect(controller.filePropertiesRuntimePinned(owner, "catalog")).toBe(false)
})

it("revokes property window access after its owner changes Space", async () => {
  const { controller, owner } = fixture()
  mocks.create.mockResolvedValueOnce(session("first-properties"))
  await controller.openRecentSpace(owner, "first-properties")
  const contents = Object.assign(new EventEmitter(), {
    id: 23,
    send: vi.fn(),
    isDestroyed: () => false,
    setZoomFactor: vi.fn(),
  })
  const child = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
    setTitle: vi.fn(),
    close: vi.fn(),
  })
  const internals = controller as unknown as {
    createWindow(show: boolean, kind: string): BrowserWindow
    loadRenderer(window: BrowserWindow, route: string): Promise<void>
  }
  vi.spyOn(internals, "createWindow").mockReturnValue(
    child as unknown as BrowserWindow
  )
  vi.spyOn(internals, "loadRenderer").mockResolvedValue()
  vi.spyOn(controller, "locale").mockResolvedValue("en")
  vi.spyOn(controller, "getPreferences").mockResolvedValue(
    DEFAULT_EIDOS_LITE_PREFERENCES
  )
  controller.showFileProperties(owner, "a.md")
  mocks.create.mockResolvedValueOnce(session("second-properties"))
  await controller.openRecentSpace(owner, "second-properties")
  expect(controller.sessionFor(contents as unknown as WebContents)).toBeNull()
  controller.selectFileProperties(owner, "b.md")
  expect(child.close).toHaveBeenCalledOnce()
})

it("presents a property window even when the renderer load fails", async () => {
  const { controller, owner } = fixture()
  mocks.create.mockResolvedValueOnce(session("properties-space"))
  await controller.openRecentSpace(owner, "properties-space")
  const contents = Object.assign(new EventEmitter(), {
    id: 24,
    send: vi.fn(),
    isDestroyed: () => false,
    setZoomFactor: vi.fn(),
  })
  const child = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    close: vi.fn(),
    getBounds: () => ({ x: 50, y: 50, width: 400, height: 400 }),
    setBounds: vi.fn(),
  })
  const internals = controller as unknown as {
    createWindow(show: boolean, kind: string): BrowserWindow
    loadRenderer(window: BrowserWindow, route: string): Promise<void>
  }
  vi.spyOn(internals, "createWindow").mockReturnValue(
    child as unknown as BrowserWindow
  )
  vi.spyOn(internals, "loadRenderer").mockRejectedValue(new Error("load"))
  vi.spyOn(controller, "locale").mockResolvedValue("en")
  vi.spyOn(controller, "getPreferences").mockResolvedValue(
    DEFAULT_EIDOS_LITE_PREFERENCES
  )
  controller.showFileProperties(owner, "a.md")
  await vi.waitFor(() => expect(child.show).toHaveBeenCalledOnce())
  expect(child.setBounds).toHaveBeenCalledWith(
    { x: 50, y: 100, width: 400, height: 400 },
    false
  )
  expect(child.setBounds.mock.invocationCallOrder[0]).toBeLessThan(
    child.show.mock.invocationCallOrder[0]!
  )
})

async function propertyWindowFixture() {
  const setup = fixture()
  mocks.create.mockResolvedValueOnce(session("properties-monitor-space"))
  await setup.controller.openRecentSpace(
    setup.owner,
    "properties-monitor-space"
  )
  let bounds = { x: 50, y: 50, width: 400, height: 400 }
  const contents = Object.assign(new EventEmitter(), {
    id: 25,
    send: vi.fn(),
    isDestroyed: () => false,
    setZoomFactor: vi.fn(),
    getZoomFactor: vi.fn(() => 1),
  })
  const child = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
    isMinimized: () => false,
    show: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    close: vi.fn(),
    getBounds: () => ({ ...bounds }),
    getContentBounds: () => ({
      ...bounds,
      y: bounds.y + 28,
      height: bounds.height - 28,
    }),
    setBounds: vi.fn((next: typeof bounds, _animate?: boolean) => {
      bounds = { ...next }
    }),
  })
  const internals = setup.controller as unknown as {
    createWindow(show: boolean, kind: string): BrowserWindow
    loadRenderer(window: BrowserWindow, route: string): Promise<void>
  }
  const create = vi
    .spyOn(internals, "createWindow")
    .mockReturnValue(child as unknown as BrowserWindow)
  vi.spyOn(internals, "loadRenderer").mockResolvedValue()
  vi.spyOn(setup.controller, "locale").mockResolvedValue("en")
  vi.spyOn(setup.controller, "getPreferences").mockResolvedValue(
    DEFAULT_EIDOS_LITE_PREFERENCES
  )
  return {
    ...setup,
    child,
    contents: contents as unknown as WebContents,
    create,
    moveChild: (next: typeof bounds) => {
      bounds = { ...next }
    },
    dispose: () => child.emit("closed"),
  }
}

function useTwoMonitors() {
  mocks.displayMatching.mockImplementation((bounds) =>
    bounds.x >= 1440
      ? { id: 2, workArea: { x: 1440, y: 0, width: 1920, height: 1080 } }
      : { id: 1, workArea: { x: 0, y: 0, width: 1440, height: 900 } }
  )
}

it("places the first ready property window on its owner's negative-coordinate monitor even without a height change", async () => {
  const setup = await propertyWindowFixture()
  mocks.displayMatching.mockImplementation((bounds) =>
    bounds.x < 0
      ? { id: 2, workArea: { x: -1920, y: -1080, width: 1920, height: 1040 } }
      : { id: 1, workArea: { x: 0, y: 0, width: 1440, height: 900 } }
  )
  setup.window.getBounds.mockReturnValue({
    x: -1800,
    y: -980,
    width: 1000,
    height: 700,
  })
  try {
    setup.controller.showFileProperties(setup.owner, "a.md")
    setup.controller.resizeFileProperties(setup.contents, 372)
    expect(setup.child.setBounds).toHaveBeenCalledWith(
      { x: -1500, y: -830, width: 400, height: 400 },
      false
    )
    expect(setup.child.show).toHaveBeenCalledOnce()
    expect(setup.child.setBounds.mock.invocationCallOrder[0]).toBeLessThan(
      setup.child.show.mock.invocationCallOrder[0]!
    )
  } finally {
    setup.dispose()
  }
})

it("moves a reused property window to the owner's new monitor without creating another window", async () => {
  const setup = await propertyWindowFixture()
  useTwoMonitors()
  try {
    setup.controller.showFileProperties(setup.owner, "a.md")
    setup.controller.resizeFileProperties(setup.contents, 372)
    setup.child.setBounds.mockClear()
    setup.window.getBounds.mockReturnValue({
      x: 1600,
      y: 80,
      width: 1000,
      height: 700,
    })
    setup.controller.showFileProperties(setup.owner, "b.md")
    expect(setup.create).toHaveBeenCalledOnce()
    expect(setup.child.setBounds).toHaveBeenCalledWith(
      { x: 1900, y: 230, width: 400, height: 400 },
      false
    )
    expect(setup.controller.filePropertiesTarget(setup.contents)).toBe("b.md")
  } finally {
    setup.dispose()
  }
})

it("keeps a property window's dragged position on same-screen reopen and later resize", async () => {
  const setup = await propertyWindowFixture()
  useTwoMonitors()
  try {
    setup.controller.showFileProperties(setup.owner, "a.md")
    setup.controller.resizeFileProperties(setup.contents, 372)
    setup.moveChild({ x: 920, y: 100, width: 400, height: 400 })
    setup.child.setBounds.mockClear()
    setup.controller.showFileProperties(setup.owner, "b.md")
    expect(setup.child.setBounds).not.toHaveBeenCalled()
    setup.controller.resizeFileProperties(setup.contents, 472)
    expect(setup.child.setBounds).toHaveBeenCalledWith(
      { x: 920, y: 100, width: 400, height: 500 },
      true
    )
    setup.moveChild({ x: 1900, y: 120, width: 400, height: 500 })
    setup.child.setBounds.mockClear()
    setup.controller.selectFileProperties(setup.owner, "c.md")
    setup.controller.resizeFileProperties(setup.contents, 572)
    expect(setup.child.setBounds).toHaveBeenCalledWith(
      { x: 1900, y: 120, width: 400, height: 600 },
      true
    )
  } finally {
    setup.dispose()
  }
})

it("positions the fallback loading shell using the owner's current monitor before showing it", async () => {
  vi.useFakeTimers()
  const setup = await propertyWindowFixture()
  useTwoMonitors()
  try {
    setup.controller.showFileProperties(setup.owner, "a.md")
    setup.window.getBounds.mockReturnValue({
      x: 1600,
      y: 80,
      width: 1000,
      height: 700,
    })
    expect(setup.child.show).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1500)
    expect(setup.child.setBounds).toHaveBeenCalledWith(
      { x: 1900, y: 230, width: 400, height: 400 },
      false
    )
    expect(setup.child.show).toHaveBeenCalledOnce()
    expect(setup.child.setBounds.mock.invocationCallOrder[0]).toBeLessThan(
      setup.child.show.mock.invocationCallOrder[0]!
    )
  } finally {
    setup.dispose()
    vi.useRealTimers()
  }
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
