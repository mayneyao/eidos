import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileViewInfo } from "@eidos.space/eidos-file"

import { EidosFileViewTabs } from "./eidos-file-view-tabs"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const now = "2026-07-19T00:00:00.000Z"
const views: EidosFileViewInfo[] = [
  {
    id: "grid",
    name: "All records",
    type: "grid",
    tableId: "tasks",
    query: "",
    properties: null,
    filter: null,
    sorts: [],
    orderMap: null,
    hiddenFields: [],
    position: 0,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "gallery",
    name: "Cards",
    type: "gallery",
    tableId: "tasks",
    query: "",
    properties: null,
    filter: null,
    sorts: [],
    orderMap: null,
    hiddenFields: [],
    position: 1,
    createdAt: now,
    updatedAt: now,
  },
]

function renderViewTabs(root: Root, onDelete = vi.fn()) {
  root.render(
    <EidosFileViewTabs
      views={views}
      fields={[]}
      activeView={views[0]}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      onRename={vi.fn()}
      onDuplicate={vi.fn()}
      onDelete={onDelete}
      onReorder={vi.fn()}
      onUpdate={vi.fn()}
    />
  )
}

async function openViewMenu(container: HTMLElement, viewId: string) {
  const tab = container.querySelector<HTMLElement>(
    `[data-eidos-file-view-id="${viewId}"]`
  )
  await act(async () => {
    tab?.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        clientX: 40,
        clientY: 40,
      })
    )
    await Promise.resolve()
  })
}

describe("EidosFileViewTabs", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("uses each view tab as the configuration entry point", async () => {
    await act(async () => renderViewTabs(root))

    expect(
      container.querySelector('[aria-label="Manage Eidos File views"]')
    ).toBeNull()
    await openViewMenu(container, "gallery")

    expect(
      Array.from(document.body.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent?.trim()
      )
    ).toEqual(["Rename view", "Configure view", "Delete view"])

    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent?.includes("Configure view"))
        ?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(document.body.textContent).toContain("Layout")
    expect(
      document.body.querySelector<HTMLInputElement>(
        "#eidos-file-managed-view-name"
      )?.value
    ).toBe("Cards")
    expect(
      document.body.querySelector("[data-eidos-file-view-context-anchor]")
    ).not.toBeNull()
  })

  it("protects the required Grid view and confirms deletable views", async () => {
    const onDelete = vi.fn()
    await act(async () => renderViewTabs(root, onDelete))

    await openViewMenu(container, "grid")
    const protectedDelete = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
    ).find((item) => item.textContent?.includes("Delete view"))
    expect(protectedDelete?.hasAttribute("data-disabled")).toBe(true)

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
      )
      await Promise.resolve()
    })
    await openViewMenu(container, "gallery")
    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent?.includes("Delete view"))
        ?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(document.body.textContent).toContain("Delete “Cards”?")
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Delete")
        ?.click()
      await Promise.resolve()
    })
    expect(onDelete).toHaveBeenCalledWith("gallery")
  })
})
