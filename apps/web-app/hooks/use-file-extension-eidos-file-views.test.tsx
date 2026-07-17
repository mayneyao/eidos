import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useFileExtensionEidosFileViews } from "./use-file-extension-eidos-file-views"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const listEidosFileViews = vi.hoisted(() => vi.fn())
const on = vi.hoisted(() =>
  vi.fn(
    (
      _eventName: string,
      _listener: (event: unknown, payload: unknown) => void
    ) => "listener-1"
  )
)
const off = vi.hoisted(() => vi.fn())

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))

describe("useFileExtensionEidosFileViews", () => {
  let container: HTMLDivElement
  let root: Root
  let result: ReturnType<typeof useFileExtensionEidosFileViews> | undefined

  beforeEach(() => {
    listEidosFileViews.mockReset()
    on.mockClear()
    off.mockClear()
    result = undefined
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: { on, off, fileExtensions: { listEidosFileViews } },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Reflect.deleteProperty(window, "eidos")
  })

  it("loads matching Eidos File views and refreshes after extension changes", async () => {
    const cards = {
      packageId: "example.tasks",
      contentDigest: `sha256:${"1".repeat(64)}`,
      permissionHash: `sha256:${"2".repeat(64)}`,
      id: "example.tasks.cards",
      displayName: "Task cards",
      extensionDisplayName: "Tasks",
    }
    listEidosFileViews.mockResolvedValue([cards])
    function Probe() {
      result = useFileExtensionEidosFileViews("space-a", "tasks.eidos")
      return null
    }

    await act(async () => root.render(<Probe />))
    await act(async () => undefined)
    expect(result?.eidosFileViews).toEqual([cards])

    const listener = on.mock.calls.find(
      ([event]) => event === "file-extensions:changed"
    )?.[1]
    await act(async () => {
      listener?.({}, { spaceId: "space-a" })
      await Promise.resolve()
    })
    expect(listEidosFileViews).toHaveBeenCalledTimes(2)
  })
})
