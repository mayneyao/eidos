// @vitest-environment jsdom
import { act, createRef } from "react"
import { createRoot } from "react-dom/client"
import { WorkspaceHeading } from "./workspace-heading"

vi.mock("./i18n", () => ({
  useEidosLiteI18n: () => ({ t: (text: string) => text }),
}))

it("shows whole-tree actions only in the Space context menu", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  const root = createRoot(host)
  const expandAll = vi.fn()
  try {
    await act(async () =>
      root.render(
        <WorkspaceHeading
          name="Space"
          path="/Space"
          searching={false}
          searchRef={createRef<HTMLButtonElement>()}
          shortcut=""
          onSearch={vi.fn()}
          onBack={vi.fn()}
          query=""
          onQueryChange={vi.fn()}
          focusToken={0}
          actions={[]}
          treeExpansionActions={{
            scope: "all",
            isExpanded: () => false,
            toggle: expandAll,
          }}
        />
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Create"]')!.click()
    )
    expect(host.textContent).not.toContain("Expand all folders")
    await act(async () => {
      host
        .querySelector(".space-heading")!
        .dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
        )
    })
    expect(host.textContent).toContain("Expand all folders")
    expect(host.textContent).not.toContain("Collapse all folders")
    expect(host.textContent).not.toContain("Expand subfolders")
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click()
    )
    expect(expandAll).toHaveBeenCalledOnce()
    expect(host.querySelector('[role="group"]')).toBeNull()
  } finally {
    await act(async () => root.unmount())
  }
})

it("navigates each folder breadcrumb and marks the current location", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  const root = createRoot(host)
  const navigate = vi.fn()
  try {
    await act(async () =>
      root.render(
        <WorkspaceHeading
          name="Space"
          path="/Space"
          directory="project/docs"
          onNavigateDirectory={navigate}
          searching={false}
          searchRef={createRef<HTMLButtonElement>()}
          shortcut=""
          onSearch={vi.fn()}
          onBack={vi.fn()}
          query=""
          onQueryChange={vi.fn()}
          focusToken={0}
          actions={[]}
        />
      )
    )
    const buttons = host.querySelectorAll<HTMLButtonElement>("nav button")
    expect([...buttons].map((button) => button.textContent)).toEqual([
      "Space",
      "project",
      "docs",
    ])
    expect(buttons[2]!.getAttribute("aria-current")).toBe("location")
    for (const button of buttons) await act(async () => button.click())
    expect(navigate.mock.calls).toEqual([[null], ["project"], ["project/docs"]])
  } finally {
    await act(async () => root.unmount())
  }
})

it("opens root file management from its heading action and context menu", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const manage = vi.fn()
  const props = {
    name: "Space",
    path: "/Space",
    searching: false,
    searchRef: createRef<HTMLButtonElement>(),
    shortcut: "",
    onSearch: vi.fn(),
    onBack: vi.fn(),
    query: "",
    onQueryChange: vi.fn(),
    focusToken: 0,
    actions: [],
    onManageFiles: manage,
  }
  try {
    await act(async () => root.render(<WorkspaceHeading {...props} />))
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Manage files"]')!
        .click()
    )
    expect(manage).toHaveBeenCalledOnce()
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Create"]')!.click()
    )
    expect(host.querySelector('[role="group"]')?.textContent).not.toContain(
      "Manage files"
    )
    await act(async () =>
      host
        .querySelector(".space-heading")!
        .dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
        )
    )
    const item = host.querySelector<HTMLButtonElement>('[role="group"] button')!
    expect(item.textContent).toBe("Manage files")
    await act(async () => item.click())
    expect(manage).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role="group"]')).toBeNull()
    await act(async () =>
      root.render(<WorkspaceHeading {...props} navigationDisabled />)
    )
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Manage files"]')!
        .disabled
    ).toBe(true)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

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
    query: "saved query",
    onQueryChange: vi.fn(),
    focusToken: 0,
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
    await click("Create")
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
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Create")
    await click("Create")
    await act(async () =>
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }))
    )
    expect(host.querySelector('[role="group"]')).toBeNull()
    await click("Create")
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[role="group"] button')!.click()
    )
    expect(run).toHaveBeenCalledOnce()
    expect(host.querySelector('[role="group"]')).toBeNull()
    await act(async () =>
      root.render(<WorkspaceHeading {...props} searching />)
    )
    expect(host.querySelector('[aria-label="Search Space text"]')).toBeNull()
    const input = host.querySelector("input")!
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe("saved query")
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          isComposing: true,
        })
      )
    )
    expect(back).not.toHaveBeenCalled()
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
    expect(back).toHaveBeenCalledOnce()
    back.mockClear()
    await click("Close search")
    expect(back).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
