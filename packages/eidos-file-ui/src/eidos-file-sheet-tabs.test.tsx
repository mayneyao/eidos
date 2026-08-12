import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileTableInfo } from "@eidos.space/eidos-file"

import { EidosFileSheetTabs } from "./eidos-file-sheet-tabs"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const tables: EidosFileTableInfo[] = [
  {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    position: 0,
    icon: null,
    description: null,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  },
  {
    id: "projects",
    name: "Projects",
    rawTableName: "tb_projects",
    position: 1,
    icon: null,
    description: null,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  },
]

async function openTableMenu(container: HTMLElement, tableId: string) {
  const tab = container.querySelector<HTMLElement>(
    `[data-eidos-file-table-id="${tableId}"]`
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

describe("EidosFileSheetTabs", () => {
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

  it("renames and deletes tables from each tab context menu", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined)
    const onDelete = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <EidosFileSheetTabs
          tables={tables}
          activeTableId="tasks"
          onSelect={vi.fn()}
          onRename={onRename}
          onDelete={onDelete}
        />
      )
    })

    await openTableMenu(container, "projects")
    const menu = document.body.querySelector<HTMLElement>(
      "[data-eidos-file-table-menu]"
    )
    expect(menu?.classList.contains("w-max")).toBe(true)
    expect(menu?.classList.contains("w-44")).toBe(false)
    expect(
      Array.from(document.body.querySelectorAll('[role="menuitem"]')).map(
        (item) => item.textContent?.trim()
      )
    ).toEqual(["Rename table", "Delete table"])

    await act(async () => {
      document.body
        .querySelector<HTMLElement>('[role="menu"]')
        ?.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })
        )
      await Promise.resolve()
    })
    expect(document.body.querySelector('[role="menu"]')).toBeNull()

    await openTableMenu(container, "projects")

    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent?.includes("Rename table"))
        ?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    const nameInput = document.body.querySelector<HTMLInputElement>("input")
    expect(nameInput?.value).toBe("Projects")
    expect(document.activeElement).toBe(nameInput)

    await act(async () => {
      if (nameInput) {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )?.set?.call(nameInput, "Roadmap")
        nameInput.dispatchEvent(new Event("input", { bubbles: true }))
      }
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Rename")
        ?.click()
      await Promise.resolve()
    })
    expect(onRename).toHaveBeenCalledWith(tables[1], "Roadmap")

    await openTableMenu(container, "projects")
    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent?.includes("Delete table"))
        ?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(document.body.textContent).toContain("Delete table “Projects”?")
    await act(async () => {
      Array.from(document.body.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Delete table")
        ?.click()
      await Promise.resolve()
    })
    expect(onDelete).toHaveBeenCalledWith(tables[1])
  })

  it("protects the only table from deletion", async () => {
    await act(async () => {
      root.render(
        <EidosFileSheetTabs
          tables={[tables[0]]}
          activeTableId="tasks"
          onSelect={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />
      )
    })

    await openTableMenu(container, "tasks")
    const deleteItem = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
    ).find((item) => item.textContent?.includes("Delete table"))
    expect(deleteItem?.hasAttribute("data-disabled")).toBe(true)
    expect(deleteItem?.title).toBe("An Eidos File must keep one table")
  })

  it("exports the complete table selected from its context menu", async () => {
    const onExportCsv = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <EidosFileSheetTabs
          tables={tables}
          activeTableId="tasks"
          onSelect={vi.fn()}
          onExportCsv={onExportCsv}
        />
      )
    })

    await openTableMenu(container, "projects")
    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) =>
          item.textContent?.includes("Export entire table as CSV")
        )
        ?.click()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(onExportCsv).toHaveBeenCalledWith(tables[1])
  })

  it("reorders tables through the shared drag handle", async () => {
    const onReorder = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <EidosFileSheetTabs
          tables={tables}
          activeTableId="tasks"
          onSelect={vi.fn()}
          onReorder={onReorder}
        />
      )
    })

    expect(container.textContent).not.toContain("Move up")
    expect(container.textContent).not.toContain("Move down")
    await keyboardDrag("Reorder Projects table", "ArrowLeft")
    expect(onReorder).toHaveBeenCalledWith(["projects", "tasks"])
  })
})
