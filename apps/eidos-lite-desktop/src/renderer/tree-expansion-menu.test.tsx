// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { TreeExpansionMenu } from "./tree-expansion-menu"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

it("shows only applicable actions and dismisses after executing", async () => {
  const host = document.createElement("div")
  const root = createRoot(host)
  const actions = {
    scope: "folder" as const,
    isExpanded: vi.fn(() => false),
    toggle: vi.fn(),
  }
  const close = vi.fn()
  const expandAll = vi.fn()
  try {
    await act(async () =>
      root.render(<TreeExpansionMenu actions={actions} onClose={close} />)
    )
    expect(host.querySelectorAll("button")).toHaveLength(1)
    expect(host.textContent).toBe("Expand subfolders")
    expect(host.textContent).not.toContain("all folders")
    await act(async () => host.querySelector("button")!.click())
    expect(actions.toggle).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    await act(async () =>
      root.render(
        <TreeExpansionMenu
          actions={{
            scope: "all",
            isExpanded: () => true,
            toggle: expandAll,
          }}
          onClose={close}
          disabled
        />
      )
    )
    expect(host.querySelectorAll("button")).toHaveLength(1)
    expect(host.textContent).toBe("Collapse all folders")
    await act(async () => host.querySelector("button")!.click())
    expect(expandAll).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
  }
})
