import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import {
  useFileExtensionCommands,
  type FileExtensionCommand,
} from "./use-file-extension-commands"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const listCommandsMock = vi.hoisted(() => vi.fn())
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

  function Harness() {
    latestCommands = useFileExtensionCommands("file-space").commands
    return null
  }

  beforeEach(() => {
    changedListener = undefined
    latestCommands = []
    listCommandsMock.mockReset()
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
          listCommands: listCommandsMock,
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
    const initial = deferred<FileExtensionCommand[]>()
    const disabled = deferred<FileExtensionCommand[]>()
    listCommandsMock
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(disabled.promise)

    await act(async () => {
      root.render(<Harness />)
      await Promise.resolve()
    })
    expect(listCommandsMock).toHaveBeenCalledTimes(1)

    act(() => {
      changedListener?.({}, { spaceId: "file-space", generation: 2 })
    })
    expect(listCommandsMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      disabled.resolve([])
      await disabled.promise
    })
    expect(latestCommands).toEqual([])

    await act(async () => {
      initial.resolve([command])
      await initial.promise
    })
    expect(latestCommands).toEqual([])
  })

  it("does not hide newly enabled commands when an older refresh finishes", async () => {
    const initial = deferred<FileExtensionCommand[]>()
    const enabled = deferred<FileExtensionCommand[]>()
    listCommandsMock
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
      enabled.resolve([command])
      await enabled.promise
    })
    expect(latestCommands).toEqual([command])

    await act(async () => {
      initial.resolve([])
      await initial.promise
    })
    expect(latestCommands).toEqual([command])
  })
})
