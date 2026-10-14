// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import { FolderPropertiesBreadcrumbs } from "./folder-properties-breadcrumbs"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

it("navigates to each ancestor without exposing the backing document", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const onNavigate = vi.fn()
  try {
    await act(async () =>
      root.render(
        <FolderPropertiesBreadcrumbs
          spaceName="My Space"
          directory="Projects/资料"
          disabled={false}
          onNavigate={onNavigate}
        />
      )
    )
    const buttons = Array.from(container.querySelectorAll("button"))
    expect(buttons.map((button) => button.textContent)).toEqual([
      "My Space",
      "Projects",
      "资料",
    ])
    for (const button of buttons) await act(async () => button.click())
    expect(onNavigate.mock.calls).toEqual([
      [null],
      ["Projects"],
      ["Projects/资料"],
    ])
    expect(container.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Properties"
    )
    expect(container.textContent).not.toContain("files.eidos")
    await act(async () =>
      root.render(
        <FolderPropertiesBreadcrumbs
          spaceName="My Space"
          directory={null}
          disabled
          onNavigate={onNavigate}
        />
      )
    )
    expect(container.querySelectorAll("button")).toHaveLength(1)
    await act(async () => container.querySelector("button")!.click())
    expect(onNavigate).toHaveBeenCalledTimes(3)
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
