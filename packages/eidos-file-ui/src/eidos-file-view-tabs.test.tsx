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

function renderViewTabs(root: Root, onDelete = vi.fn(), onReorder = vi.fn()) {
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
      onReorder={onReorder}
      onUpdate={vi.fn()}
    />
  )
}

async function keyboardDrag(
  label: string,
  direction: "ArrowLeft" | "ArrowRight"
) {
  const handle = document.body.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`
  )
  Array.from(
    document.body.querySelectorAll<HTMLElement>(
      "[data-eidos-file-sortable-tab]"
    )
  ).forEach((item, index) => {
    item.getBoundingClientRect = () => new DOMRect(index * 120, 0, 112, 32)
  })
  await act(async () => {
    handle?.focus()
    handle?.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Space",
        key: " ",
      })
    )
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: direction,
        key: direction,
      })
    )
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        code: "Space",
        key: " ",
      })
    )
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
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

    const menu = document.body.querySelector<HTMLElement>('[role="menu"]')
    expect(menu?.className).toContain("w-max")
    expect(
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      ).every((item) => item.className.includes("whitespace-nowrap"))
    ).toBe(true)

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
    expect(document.body.textContent).toContain("Card appearance")
    expect(document.body.textContent).not.toContain("Card content")
    expect(
      document.body.querySelector<HTMLInputElement>(
        "#eidos-file-managed-view-name"
      )?.value
    ).toBe("Cards")
    expect(
      document.body.querySelector("[data-eidos-file-view-context-anchor]")
    ).not.toBeNull()

    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLElement>("button"))
        .find((item) => item.textContent?.includes("Card appearance"))
        ?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(document.body.textContent).toContain("Card content")
    expect(document.body.textContent).toContain("Card cover")
    expect(document.body.textContent).toContain("Card size")

    await act(async () => {
      document.body
        .querySelectorAll<HTMLElement>("button.mb-3")
        .forEach((item) => {
          if (item.textContent?.trim() === "Cards") item.click()
        })
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(document.body.textContent).toContain("Layout")
    expect(document.body.textContent).toContain("Card appearance")
  })

  it("exports the view selected from its context menu", async () => {
    const onExportCsv = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <EidosFileViewTabs
          views={views}
          fields={[]}
          activeView={views[0]}
          onSelect={vi.fn()}
          onCreate={vi.fn()}
          onRename={vi.fn()}
          onDuplicate={vi.fn()}
          onDelete={vi.fn()}
          onUpdate={vi.fn()}
          onReorder={vi.fn()}
          onExportCsv={onExportCsv}
        />
      )
    })

    await openViewMenu(container, "gallery")
    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) =>
          item.textContent?.includes("Export current view as CSV")
        )
        ?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(onExportCsv).toHaveBeenCalledWith(views[1])
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
      document.body
        .querySelector<HTMLElement>('[role="menu"]')
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
        )
      await Promise.resolve()
    })
    expect(document.body.querySelector('[role="menu"]')).toBeNull()
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

  it("reorders views through the shared drag handle", async () => {
    const onReorder = vi.fn().mockResolvedValue(undefined)
    await act(async () => renderViewTabs(root, vi.fn(), onReorder))

    expect(container.textContent).not.toContain("Move up")
    expect(container.textContent).not.toContain("Move down")
    await keyboardDrag("Reorder Cards view", "ArrowLeft")
    expect(onReorder).toHaveBeenCalledWith(["gallery", "grid"])
  })
})
