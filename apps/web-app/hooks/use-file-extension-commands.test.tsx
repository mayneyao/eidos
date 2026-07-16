import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  useFileExtensionCommands,
  type FileExtensionCommand,
  type FileExtensionPanel,
} from "./use-file-extension-commands"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const listCommandPaletteMock = vi.hoisted(() => vi.fn())
const openPanelMock = vi.hoisted(() => vi.fn())
const onMock = vi.hoisted(() => vi.fn())
const offMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

const command: FileExtensionCommand = {
  packageId: "local.task-counter",
  contentDigest: `sha256:${"a".repeat(64)}`,
  permissionHash: `sha256:${"b".repeat(64)}`,
  id: "local.task-counter.hello",
  title: "Hello from Task Counter",
  extensionDisplayName: "Task Counter",
  menus: {},
}

const panel: FileExtensionPanel = {
  packageId: "local.task-counter",
  contentDigest: `sha256:${"a".repeat(64)}`,
  permissionHash: `sha256:${"b".repeat(64)}`,
  id: "local.task-counter.summary",
  displayName: "Task Summary",
  extensionDisplayName: "Task Counter",
}

describe("useFileExtensionCommands", () => {
  let container: HTMLDivElement
  let root: Root
  let changedListener:
    | ((
        event: unknown,
        payload: { spaceId: string; generation: number }
      ) => void)
    | undefined
  let latestCommands: FileExtensionCommand[] = []
  let latestPanels: FileExtensionPanel[] = []
  let openPanelFromHook:
    | ((panel: FileExtensionPanel) => Promise<unknown>)
    | undefined

  function Harness() {
    const extensions = useFileExtensionCommands("file-space")
    latestCommands = extensions.commands
    latestPanels = extensions.panels
    openPanelFromHook = extensions.openPanel
    return null
  }

  beforeEach(() => {
    changedListener = undefined
    latestCommands = []
    latestPanels = []
    openPanelFromHook = undefined
    listCommandPaletteMock.mockReset()
    openPanelMock.mockReset().mockResolvedValue({ success: true })
    onMock.mockReset().mockImplementation((_channel, listener) => {
      changedListener = listener
      return "listener-1"
    })
    offMock.mockReset()
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        on: onMock,
        off: offMock,
        fileExtensions: {
          listCommandPalette: listCommandPaletteMock,
          openPanel: openPanelMock,
        },
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("does not restore stale commands after a newer refresh disables them", async () => {
    const initial = deferred<{
      commands: FileExtensionCommand[]
      panels: FileExtensionPanel[]
    }>()
    const disabled = deferred<{
      commands: FileExtensionCommand[]
      panels: FileExtensionPanel[]
    }>()
    listCommandPaletteMock
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(disabled.promise)

    await act(async () => {
      root.render(<Harness />)
      await Promise.resolve()
    })
    expect(listCommandPaletteMock).toHaveBeenCalledTimes(1)

    act(() => {
      changedListener?.({}, { spaceId: "file-space", generation: 2 })
    })
    expect(listCommandPaletteMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      disabled.resolve({ commands: [], panels: [] })
      await disabled.promise
    })
    expect(latestCommands).toEqual([])
    expect(latestPanels).toEqual([])

    await act(async () => {
      initial.resolve({ commands: [command], panels: [panel] })
      await initial.promise
    })
    expect(latestCommands).toEqual([])
    expect(latestPanels).toEqual([])
  })

  it("does not hide newly enabled commands when an older refresh finishes", async () => {
    const initial = deferred<{
      commands: FileExtensionCommand[]
      panels: FileExtensionPanel[]
    }>()
    const enabled = deferred<{
      commands: FileExtensionCommand[]
      panels: FileExtensionPanel[]
    }>()
    listCommandPaletteMock
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(enabled.promise)

    await act(async () => {
      root.render(<Harness />)
      await Promise.resolve()
    })
    act(() => {
      changedListener?.({}, { spaceId: "file-space", generation: 2 })
    })

    await act(async () => {
      enabled.resolve({ commands: [command], panels: [panel] })
      await enabled.promise
    })
    expect(latestCommands).toEqual([command])
    expect(latestPanels).toEqual([panel])

    await act(async () => {
      initial.resolve({ commands: [], panels: [] })
      await initial.promise
    })
    expect(latestCommands).toEqual([command])
    expect(latestPanels).toEqual([panel])
  })

  it("opens a declared panel through the exact listed snapshot", async () => {
    listCommandPaletteMock.mockResolvedValue({ commands: [], panels: [panel] })
    await act(async () => {
      root.render(<Harness />)
      await Promise.resolve()
    })

    await expect(openPanelFromHook?.(panel)).resolves.toEqual({ success: true })
    expect(openPanelMock).toHaveBeenCalledWith("file-space", {
      packageId: panel.packageId,
      contentDigest: panel.contentDigest,
      permissionHash: panel.permissionHash,
      panelId: panel.id,
    })
  })
})
