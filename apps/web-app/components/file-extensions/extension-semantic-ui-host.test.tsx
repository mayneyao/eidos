import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { ExtensionSemanticUiHost } from "./extension-semantic-ui-host"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const onMock = vi.hoisted(() => vi.fn())
const offMock = vi.hoisted(() => vi.fn())
const startWatchingMock = vi.hoisted(() => vi.fn())
const stopWatchingMock = vi.hoisted(() => vi.fn())
const resolveSemanticUiMock = vi.hoisted(() => vi.fn())
const toastMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/env", () => ({ isDesktopMode: true }))
vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({
    currentSpace: {
      id: "space-a",
      mode: "file",
      name: "Space A",
      path: "/tmp/a",
    },
  }),
}))
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: toastMock }),
}))

describe("ExtensionSemanticUiHost", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    onMock.mockReset().mockReturnValue("listener-1")
    offMock.mockReset()
    startWatchingMock.mockReset().mockResolvedValue({
      watching: true,
      generation: 0,
    })
    stopWatchingMock.mockReset().mockResolvedValue({
      watching: false,
      generation: 0,
    })
    resolveSemanticUiMock.mockReset().mockResolvedValue({ success: true })
    toastMock.mockReset()
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        on: onMock,
        off: offMock,
        fileExtensions: {
          startWatching: startWatchingMock,
          stopWatching: stopWatchingMock,
          resolveSemanticUi: resolveSemanticUiMock,
        },
      },
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    Reflect.deleteProperty(window, "eidos")
  })

  it("owns watcher lifetime and renders extension UI with host components", async () => {
    await act(async () => root.render(<ExtensionSemanticUiHost />))
    expect(startWatchingMock).toHaveBeenCalledWith("space-a")
    const listener = onMock.mock.calls.find(
      ([channel]) => channel === "file-extensions:semantic-ui"
    )?.[1]

    act(() => {
      listener?.(
        {},
        {
          kind: "notice",
          id: "notice-1",
          spaceId: "space-a",
          packageId: "example.tasks",
          message: "2 open, 1 completed",
        }
      )
    })
    expect(toastMock).toHaveBeenCalledWith({
      title: "Extension",
      description: "2 open, 1 completed",
    })

    await act(async () => {
      listener?.(
        {},
        {
          kind: "confirm",
          id: "confirm-1",
          spaceId: "space-a",
          packageId: "example.tasks",
          title: "Apply changes?",
          message: "Continue with this operation.",
          confirmLabel: "Apply",
        }
      )
    })
    const apply = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Apply"
    )!
    await act(async () => apply.click())
    expect(resolveSemanticUiMock).toHaveBeenCalledWith("space-a", {
      requestId: "confirm-1",
      value: true,
    })

    await act(async () => root.unmount())
    expect(stopWatchingMock).toHaveBeenCalledWith("space-a")
    root = createRoot(container)
  })
})
