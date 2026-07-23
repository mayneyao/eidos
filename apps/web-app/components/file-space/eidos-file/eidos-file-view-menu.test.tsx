import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"

import { EidosFileViewMenu } from "./eidos-file-view-menu"

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
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: React.ReactNode
    onSelect?: () => void
  }) => <button onClick={onSelect}>{children}</button>,
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    disabled,
    onCheckedChange,
  }: {
    children: React.ReactNode
    checked?: boolean
    disabled?: boolean
    onCheckedChange?: (checked: boolean) => void
  }) => (
    <button
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {children}
    </button>
  ),
}))

function field(
  name: string,
  type: EidosFileFieldInfo["type"],
  tableColumnName: string,
  valueKind: EidosFileFieldInfo["valueKind"],
  isHidden = false
): EidosFileFieldInfo {
  return {
    id: `field-${tableColumnName}`,
    tableId: "tasks",
    name,
    type,
    tableName: "tb_tasks",
    tableColumnName,
    property: null,
    storageCodec: "scalar",
    valueKind,
    isRecordLabel: tableColumnName === "title",
    isHidden,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

describe("EidosFileViewMenu", () => {
  let container: HTMLDivElement
  let root: Root
  const onVisibilityChange = vi.fn()
  const fields = [
    field("Title", "text", "title", "source"),
    field("Status", "select", "status", "source"),
    field("_id", "row-id", "_id", "system", true),
    field("Created time", "created-time", "_created_time", "system", true),
  ]

  beforeEach(() => {
    onVisibilityChange.mockReset()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <EidosFileViewMenu
          fields={fields}
          hiddenFields={[]}
          visibleSystemFields={[]}
          onVisibilityChange={onVisibilityChange}
        />
      )
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("keeps system fields off by default and enables them per view", () => {
    expect(container.textContent).toContain("System fields")
    expect(container.textContent).toContain("Record ID")
    const title = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')
    ).find((item) => item.textContent?.trim() === "Title")
    expect(title?.disabled).toBe(true)
    const createdTime = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')
    ).find((item) => item.textContent?.trim() === "Created time")
    expect(createdTime?.getAttribute("aria-checked")).toBe("false")
    act(() => createdTime?.click())
    expect(onVisibilityChange).toHaveBeenCalledWith({
      hiddenFields: [],
      visibleSystemFields: ["_created_time"],
    })
  })

  it("resets regular and system visibility together", () => {
    act(() => {
      root.render(
        <EidosFileViewMenu
          fields={fields}
          hiddenFields={["status"]}
          visibleSystemFields={["_id"]}
          onVisibilityChange={onVisibilityChange}
        />
      )
    })
    const reset = Array.from(container.querySelectorAll("button")).find(
      (item) => item.textContent?.trim() === "Reset field visibility"
    )
    act(() => reset?.click())
    expect(onVisibilityChange).toHaveBeenCalledWith({
      hiddenFields: [],
      visibleSystemFields: [],
    })
  })
})
