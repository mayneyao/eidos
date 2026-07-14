// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseFieldInfo } from "@eidos.space/base"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseRecordInspector } from "./base-record-inspector"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

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
  {
    name: "Done",
    type: "checkbox",
    tableName: "tb_tasks",
    tableColumnName: "done",
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
    name: "Formula",
    type: "formula",
    tableName: "tb_tasks",
    tableColumnName: "formula",
    property: { expression: "1 + 1" },
    storageCodec: "scalar",
    valueKind: "derived",
    isHidden: false,
    isDerived: true,
    sourceTableColumnName: null,
    dependsOn: null,
  },
]

describe("BaseRecordInspector", () => {
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

  it("autosaves editable fields and keeps derived values readonly", async () => {
    const row = {
      _id: "row_1",
      title: "Write RFC",
      done: 0,
      formula: 2,
    }
    const onCellEdit = vi.fn(async (current, field, value) => ({
      tableId: "tasks",
      row: { ...current, [field.tableColumnName]: value },
      rowCount: 1,
    }))
    await act(async () => {
      root.render(
        <BaseRecordInspector
          row={row}
          fields={fields}
          onClose={vi.fn()}
          onCopyRecordId={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
    })

    expect(
      container.querySelector('[data-base-detail-panel="record"]')?.classList
    ).toContain("base-detail-panel")
    const title = container.querySelector<HTMLTextAreaElement>("textarea")
    await act(async () => {
      if (!title) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set
      setter?.call(title, "Ship Base")
      title.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      title?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenCalledWith(row, fields[0], "Ship Base")
    expect(container.textContent).toContain("Ship Base")

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[role="switch"]')?.click()
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Ship Base" }),
      fields[1],
      1
    )
    expect(container.textContent).toContain("Formula")
    expect(container.textContent).toContain("2")
    expect(container.querySelectorAll("textarea")).toHaveLength(1)
  })

  it("keeps a failed draft recoverable while persisted data refreshes", async () => {
    const row = {
      _id: "row_1",
      title: "Write RFC",
      done: 0,
      formula: 2,
    }
    const savedRow = { ...row, title: "Ship Base" }
    const onCellEdit = vi
      .fn()
      .mockRejectedValueOnce(new Error("Record is read-only"))
      .mockResolvedValueOnce({
        tableId: "tasks",
        row: savedRow,
        rowCount: 1,
      })
    const onError = vi.fn()
    const render = (nextRow = row) =>
      root.render(
        <BaseRecordInspector
          row={nextRow}
          fields={fields}
          onClose={vi.fn()}
          onCopyRecordId={vi.fn()}
          onCellEdit={onCellEdit}
          onError={onError}
        />
      )

    await act(async () => render())
    const title = container.querySelector<HTMLTextAreaElement>("textarea")
    await act(async () => {
      if (!title) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set
      setter?.call(title, "Ship Base")
      title.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      title?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onCellEdit).toHaveBeenCalledOnce()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Record is read-only"
    )
    expect(title?.value).toBe("Ship Base")
    expect(onError).not.toHaveBeenCalled()

    await act(async () => render({ ...row }))
    expect(
      container.querySelector<HTMLTextAreaElement>("textarea")?.value
    ).toBe("Ship Base")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onCellEdit).toHaveBeenCalledTimes(2)
    expect(onCellEdit).toHaveBeenLastCalledWith(row, fields[0], "Ship Base")
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(
      container.querySelector<HTMLTextAreaElement>("textarea")?.value
    ).toBe("Ship Base")
  })

  it("announces full-record loading and offers a recoverable load error", async () => {
    const row = {
      _id: "row_1",
      title: "Write RFC",
    }
    const onRetryLoad = vi.fn()
    const render = (loading: boolean, loadError: string | null = null) =>
      root.render(
        <BaseRecordInspector
          row={row}
          fields={fields}
          loading={loading}
          loadError={loadError}
          onRetryLoad={onRetryLoad}
          onClose={vi.fn()}
          onCopyRecordId={vi.fn()}
          onCellEdit={vi.fn()}
        />
      )

    await act(async () => render(true))

    expect(
      container
        .querySelector('[data-base-detail-panel="record"]')
        ?.getAttribute("aria-busy")
    ).toBe("true")
    expect(container.textContent).toContain("Loading record details…")
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(container.querySelector("textarea")).toBeNull()

    await act(async () => render(false, "Record no longer exists"))

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Record no longer exists"
    )
    expect(container.querySelector("textarea")).toBeNull()
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")
        ?.click()
    })
    expect(onRetryLoad).toHaveBeenCalledOnce()
  })

  it("promotes the current record from the side panel into a tab", async () => {
    const row = { _id: "row_1", title: "Write RFC", done: 0, formula: 2 }
    const onOpenInTab = vi.fn()
    await act(async () => {
      root.render(
        <BaseRecordInspector
          row={row}
          fields={fields}
          onClose={vi.fn()}
          onOpenInTab={onOpenInTab}
          onCopyRecordId={vi.fn()}
        />
      )
    })

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Open record in tab"]')
        ?.click()
    })

    expect(onOpenInTab).toHaveBeenCalledWith(row)
  })

  it("uses a wider responsive field layout for a full record page", async () => {
    await act(async () => {
      root.render(
        <BaseRecordInspector
          variant="page"
          row={{ _id: "row_1", title: "Write RFC", done: 0, formula: 2 }}
          fields={fields}
          onClose={vi.fn()}
          onOpenInTab={vi.fn()}
          onCopyRecordId={vi.fn()}
        />
      )
    })

    const page = container.querySelector<HTMLElement>(
      '[data-base-record-layout="page"]'
    )
    expect(page?.className).toContain("max-w-[760px]")
    expect(
      container.querySelector('[aria-label="Open record in tab"]')
    ).toBeNull()
    expect(
      container.querySelector('[aria-label="Close record details"]')
    ).toBeNull()
    expect(page?.querySelector<HTMLElement>(".grid")?.className).toContain(
      "sm:grid-cols-"
    )
  })

  it("exposes relation search as a keyboard-navigable combobox", async () => {
    const ownersField: BaseFieldInfo = {
      name: "Owners",
      type: "link",
      tableName: "tb_tasks",
      tableColumnName: "owners",
      property: {
        targetTableId: "people",
        targetField: "title",
        multiple: true,
      },
      storageCodec: "json_array",
      valueKind: "relation",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    }
    const row = { _id: "row_1", title: "Write RFC", owners: null }
    const onCellEdit = vi.fn(async (current, field, value) => ({
      tableId: "tasks",
      row: { ...current, [field.tableColumnName]: value },
      rowCount: 1,
    }))
    const onSearchRelation = vi.fn().mockResolvedValue([
      { id: "row_ada", title: "Ada Lovelace" },
      { id: "row_grace", title: "Grace Hopper" },
    ])

    await act(async () => {
      root.render(
        <BaseRecordInspector
          row={row}
          fields={[fields[0], ownersField]}
          onClose={vi.fn()}
          onCopyRecordId={vi.fn()}
          onCellEdit={onCellEdit}
          onSearchRelation={onSearchRelation}
        />
      )
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Owners"]')
        ?.click()
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    const combobox = document.body.querySelector<HTMLInputElement>(
      '[role="combobox"][aria-label="Search records for Owners"]'
    )
    const listbox = document.body.querySelector<HTMLElement>(
      '[role="listbox"][aria-label="Owners relation records"]'
    )
    expect(combobox?.getAttribute("aria-controls")).toBe(listbox?.id)
    expect(listbox?.querySelectorAll('[role="option"]')).toHaveLength(2)

    act(() => {
      combobox?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "End" })
      )
    })
    expect(combobox?.getAttribute("aria-activedescendant")).toBe(
      listbox?.querySelectorAll<HTMLElement>('[role="option"]')[1]?.id
    )
    await act(async () => {
      combobox?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })
      )
      await Promise.resolve()
    })

    expect(onCellEdit).toHaveBeenCalledWith(row, ownersField, '["row_grace"]')
  })
})
