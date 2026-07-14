import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseFieldInfo, BaseTableInfo } from "@eidos.space/base"

import { BaseStructureMenu } from "./base-structure-menu"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) =>
    children,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: React.ReactNode
    onSelect?: () => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => children,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const table: BaseTableInfo = {
  id: "tasks",
  name: "Tasks",
  rawTableName: "tb_tasks",
  position: 1,
  icon: null,
  description: null,
  createdAt: "2026-07-14 00:00:00",
  updatedAt: "2026-07-14 00:00:00",
}

const fields: BaseFieldInfo[] = [
  {
    name: "Title",
    type: "title",
    tableName: "tb_tasks",
    tableColumnName: "title",
    property: null,
    storageCodec: "scalar",
    valueKind: "system",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
]

describe("BaseStructureMenu", () => {
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

  it("reveals the Base file without adding another toolbar action", () => {
    const onRevealBase = vi.fn()
    act(() => {
      root.render(
        <BaseStructureMenu
          table={table}
          fields={fields}
          onNewField={vi.fn()}
          onRenameTable={vi.fn()}
          onDeleteTable={vi.fn()}
          onRevealBase={onRevealBase}
          onEditField={vi.fn()}
          onDeleteField={vi.fn()}
        />
      )
    })

    const reveal = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Show Base in file manager"
    )
    expect(reveal).toBeDefined()
    expect(
      container.querySelector('[aria-label="Base actions for Tasks"]')
    ).toBeTruthy()
    act(() => reveal?.click())
    expect(onRevealBase).toHaveBeenCalledOnce()
  })
})
