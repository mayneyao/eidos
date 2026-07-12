import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseViewInfo } from "@eidos.space/base"

import { BaseViewSelector } from "./base-view-selector"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const views: BaseViewInfo[] = [
  {
    id: "view_all",
    name: "All tasks",
    type: "grid",
    tableId: "tasks",
    query: "SELECT * FROM tb_tasks",
    properties: null,
    filter: null,
    sorts: [],
    orderMap: null,
    hiddenFields: [],
    position: 1,
    createdAt: "2026-07-12 00:00:00",
    updatedAt: "2026-07-12 00:00:00",
  },
  {
    id: "view_priority",
    name: "By priority",
    type: "grid",
    tableId: "tasks",
    query: "SELECT * FROM tb_tasks",
    properties: null,
    filter: null,
    sorts: [{ field: "priority", direction: "desc" }],
    orderMap: null,
    hiddenFields: [],
    position: 2,
    createdAt: "2026-07-12 00:00:00",
    updatedAt: "2026-07-12 00:00:00",
  },
]

function exactButton(label: string) {
  return Array.from(document.body.querySelectorAll("button"))
    .filter((button) => button.textContent?.trim() === label)
    .at(-1)
}

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("BaseViewSelector", () => {
  let container: HTMLDivElement
  let root: Root
  const onSelect = vi.fn()
  const onCreate = vi.fn()
  const onRename = vi.fn()
  const onDuplicate = vi.fn()
  const onDelete = vi.fn()
  const onReorder = vi.fn()

  beforeEach(() => {
    for (const mock of [
      onSelect,
      onCreate,
      onRename,
      onDuplicate,
      onDelete,
      onReorder,
    ]) {
      mock.mockReset()
      mock.mockResolvedValue(undefined)
    }
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <BaseViewSelector
          views={views}
          activeView={views[0]}
          onSelect={onSelect}
          onCreate={onCreate}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      )
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("switches and creates Grid views inside an anchored popover", async () => {
    await act(async () => exactButton("All tasks")?.click())
    await act(async () => exactButton("By priority")?.click())
    expect(onSelect).toHaveBeenCalledWith("view_priority")

    await act(async () => exactButton("All tasks")?.click())
    await act(async () => exactButton("New view")?.click())
    const input =
      document.body.querySelector<HTMLInputElement>("#base-view-name")
    expect(input).not.toBeNull()
    await act(async () => {
      if (input) setInput(input, "This week")
    })
    await act(async () => exactButton("Create")?.click())
    expect(onCreate).toHaveBeenCalledWith("This week")
  })

  it("renames, duplicates, and reorders views without a centered dialog", async () => {
    await act(async () => exactButton("All tasks")?.click())
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage By priority view"]'
        )
        ?.click()
    )
    const input = document.body.querySelector<HTMLInputElement>(
      "#base-managed-view-name"
    )
    await act(async () => {
      if (!input) return
      setInput(input, "Priority board")
    })
    await act(async () => exactButton("Save")?.click())
    expect(onRename).toHaveBeenCalledWith("view_priority", "Priority board")

    await act(async () => exactButton("Move up")?.click())
    expect(onReorder).toHaveBeenCalledWith(["view_priority", "view_all"])
    await act(async () => exactButton("Duplicate view")?.click())
    expect(onDuplicate).toHaveBeenCalledWith("view_priority")
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it("confirms view deletion inside the anchored panel", async () => {
    await act(async () => exactButton("All tasks")?.click())
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Manage By priority view"]'
        )
        ?.click()
    )
    await act(async () => exactButton("Delete view")?.click())
    expect(document.body.textContent).toContain("Delete “By priority”?")
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
    await act(async () => exactButton("Delete")?.click())
    expect(onDelete).toHaveBeenCalledWith("view_priority")
  })
})
