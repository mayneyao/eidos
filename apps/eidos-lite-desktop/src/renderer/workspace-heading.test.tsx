// @vitest-environment jsdom
import { act, createRef } from "react"
import { createRoot } from "react-dom/client"
import { WorkspaceHeading } from "./workspace-heading"

vi.mock("./i18n", () => ({
  useEidosLiteI18n: () => ({ t: (text: string) => text }),
}))

it("opens heading actions, dismisses outside or with Escape, and switches to a back entry", async () => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const search = vi.fn()
  const back = vi.fn()
  const run = vi.fn()
  const props = {
    name: "Space",
    path: "/Space",
    searching: false,
    searchRef: createRef<HTMLButtonElement>(),
    shortcut: "⌘⇧F",
    onSearch: search,
    onBack: back,
    actions: [
      { label: "New file", icon: null, run },
      { label: "Disabled", icon: null, run, disabled: true },
    ],
  }
  const click = async (label: string) =>
    act(async () =>
      host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click()
    )
  try {
    await act(async () => root.render(<WorkspaceHeading {...props} />))
    await click("Search Space text")
    expect(search).toHaveBeenCalledOnce()
    await click("Space file actions")
    expect(host.querySelectorAll('[role="group"] button')).toHaveLength(2)
    expect(
      host.querySelector<HTMLButtonElement>('[role="group"] button:last-child')!
        .disabled
    ).toBe(true)
    await act(async () =>
      host
        .querySelector('[role="group"]')!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
    )
    expect(host.querySelector('[role="group"]')).toBeNull()
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Space file actions"
    )
    await click("Space file actions")
    await act(async () =>
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    )
    expect(host.querySelector('[role="group"]')).toBeNull()
    await click("Space file actions")
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="group"] button')!.click()
    )
    expect(run).toHaveBeenCalledOnce()
    expect(host.querySelector('[role="group"]')).toBeNull()
    await act(async () =>
      root.render(<WorkspaceHeading {...props} searching />)
    )
    expect(host.querySelector('[aria-label="Search Space text"]')).toBeNull()
    expect(host.textContent).toContain("Space")
    await click("Back to files")
    expect(back).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
