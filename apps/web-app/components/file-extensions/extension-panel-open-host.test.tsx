import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"

import { ExtensionPanelOpenHost } from "./extension-panel-open-host"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const openTab = vi.hoisted(() => vi.fn())
const on = vi.hoisted(() => vi.fn())
const off = vi.hoisted(() => vi.fn())

vi.mock("@/apps/web-app/hooks/use-current-space", () => ({
  useCurrentSpace: () => ({ currentSpace: { id: "space-a", mode: "file" } }),
}))

vi.mock("@/apps/web-app/store/tabs", () => ({
  useTabStore: {
    getState: () => ({ openTab }),
  },
}))

describe("ExtensionPanelOpenHost", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    openTab.mockReset()
    on.mockReset().mockReturnValue("listener-1")
    off.mockReset()
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: { on, off },
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("opens an opaque reusable tab without exposing panel state", () => {
    act(() => root.render(<ExtensionPanelOpenHost />))
    const listener = on.mock.calls.find(
      ([channel]) => channel === "file-extensions:open-panel"
    )?.[1]
    expect(listener).toBeTypeOf("function")

    act(() => {
      listener(
        {},
        {
          spaceId: "space-a",
          sessionId: "panel-session-1",
          title: "Task Summary",
          revision: 1,
          state: { shouldNotLeak: true },
        }
      )
    })

    expect(openTab).toHaveBeenCalledWith(
      "/extension-panel?session=panel-session-1",
      "Task Summary"
    )
    expect(JSON.stringify(openTab.mock.calls)).not.toContain("shouldNotLeak")
  })
})
