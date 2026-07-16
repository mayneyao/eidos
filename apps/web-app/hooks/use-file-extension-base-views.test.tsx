import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { useFileExtensionBaseViews } from "./use-file-extension-base-views"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const listBaseViews = vi.hoisted(() => vi.fn())
const on = vi.hoisted(() => vi.fn(() => "listener-1"))
const off = vi.hoisted(() => vi.fn())

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))

describe("useFileExtensionBaseViews", () => {
  let container: HTMLDivElement
  let root: Root
  let result: ReturnType<typeof useFileExtensionBaseViews> | undefined

  beforeEach(() => {
    listBaseViews.mockReset()
    on.mockClear()
    off.mockClear()
    result = undefined
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: { on, off, fileExtensions: { listBaseViews } },
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

  it("loads matching Base views and refreshes after extension changes", async () => {
    const cards = {
      packageId: "example.tasks",
      contentDigest: `sha256:${"1".repeat(64)}`,
      permissionHash: `sha256:${"2".repeat(64)}`,
      id: "example.tasks.cards",
      displayName: "Task cards",
      extensionDisplayName: "Tasks",
    }
    listBaseViews.mockResolvedValue([cards])
    function Probe() {
      result = useFileExtensionBaseViews("space-a", "tasks.base")
      return null
    }

    await act(async () => root.render(<Probe />))
    await act(async () => undefined)
    expect(result?.baseViews).toEqual([cards])

    const listener = on.mock.calls.find(
      ([event]) => event === "file-extensions:changed"
    )?.[1]
    await act(async () => {
      listener?.({}, { spaceId: "space-a" })
      await Promise.resolve()
    })
    expect(listBaseViews).toHaveBeenCalledTimes(2)
  })
})
