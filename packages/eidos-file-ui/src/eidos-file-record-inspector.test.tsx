// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileUIProvider } from "./context"
import { EidosFileRecordInspector } from "./eidos-file-record-inspector"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
})

const fields: EidosFileFieldInfo[] = [
  {
    id: "0198c72d-82b5-7000-8000-000000000001",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
    name: "Title",
    type: "text",
    isRecordLabel: true,
    tableName: "tb_tasks",
    tableColumnName: "title",
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
    id: "0198c72d-82b5-7000-8000-000000000002",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
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
    id: "0198c72d-82b5-7000-8000-000000000003",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
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

describe("EidosFileRecordInspector", () => {
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
        <EidosFileRecordInspector
          row={row}
          fields={fields}
          onClose={vi.fn()}
          onCopyRecordId={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
    })

    expect(
      container.querySelector('[data-eidos-file-detail-panel="record"]')
        ?.classList
    ).toContain("eidos-file-detail-panel")
    expect(
      container.querySelector('[data-eidos-file-detail-panel="record"]')
        ?.classList
    ).toContain("eidos-file-record-panel")
    expect(
      container.querySelector<HTMLElement>("[data-eidos-file-record-title]")
        ?.style.overflowY
    ).toBe("hidden")
    const title = container.querySelector<HTMLTextAreaElement>("textarea")
    expect(title?.rows).toBe(1)
    expect(title?.classList).toContain("resize-none")
    await act(async () => {
      if (!title) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set
      setter?.call(title, "Ship Eidos File")
      title.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      title?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenCalledWith(row, fields[0], "Ship Eidos File")
    expect(container.textContent).toContain("Ship Eidos File")

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Done"]')?.click()
      await Promise.resolve()
    })
    const checked = Array.from(
      document.body.querySelectorAll<HTMLElement>('[role="option"]')
    ).find((option) => option.textContent?.trim() === "Checked")
    await act(async () => {
      checked?.click()
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Ship Eidos File" }),
      fields[1],
      1
    )
    expect(container.textContent).toContain("Formula")
    expect(container.textContent).toContain("2")
    expect(container.querySelectorAll("textarea")).toHaveLength(1)
  })

  it("renders disabled records as readable values and keeps URLs activatable", async () => {
    const uri = "https://example.com/published-record"
    const activateUrl = vi.fn(async () => undefined)
    const urlField: EidosFileFieldInfo = {
      ...fields[0],
      name: "Website",
      type: "url",
      tableColumnName: "website",
    }

    await act(async () => {
      root.render(
        <EidosFileUIProvider activateUrl={activateUrl}>
          <EidosFileRecordInspector
            row={{ _id: "row_1", website: uri }}
            fields={[urlField]}
            disabled
            onClose={vi.fn()}
            onCopyRecordId={vi.fn()}
            onCellEdit={vi.fn()}
          />
        </EidosFileUIProvider>
      )
    })

    expect(container.querySelector("input, textarea, [role=switch]")).toBeNull()
    const link = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes(uri)
    )
    expect(link).toBeTruthy()

    await act(async () => {
      link?.click()
      await Promise.resolve()
    })
    expect(activateUrl).toHaveBeenCalledWith(uri)
  })

  it("keeps a failed draft recoverable while persisted data refreshes", async () => {
    const row = {
      _id: "row_1",
      title: "Write RFC",
      done: 0,
      formula: 2,
    }
    const savedRow = { ...row, title: "Ship Eidos File" }
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
        <EidosFileRecordInspector
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
      setter?.call(title, "Ship Eidos File")
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
    expect(title?.value).toBe("Ship Eidos File")
    expect(onError).not.toHaveBeenCalled()

    await act(async () => render({ ...row }))
    expect(
      container.querySelector<HTMLTextAreaElement>("textarea")?.value
    ).toBe("Ship Eidos File")

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")
        ?.click()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onCellEdit).toHaveBeenCalledTimes(2)
    expect(onCellEdit).toHaveBeenLastCalledWith(
      row,
      fields[0],
      "Ship Eidos File"
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(
      container.querySelector<HTMLTextAreaElement>("textarea")?.value
    ).toBe("Ship Eidos File")
  })

  it("announces full-record loading and offers a recoverable load error", async () => {
    const row = {
      _id: "row_1",
      title: "Write RFC",
    }
    const onRetryLoad = vi.fn()
    const render = (loading: boolean, loadError: string | null = null) =>
      root.render(
        <EidosFileRecordInspector
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
        .querySelector('[data-eidos-file-detail-panel="record"]')
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
        <EidosFileRecordInspector
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
    const contentField: EidosFileFieldInfo = {
      ...fields[0],
      id: "0198c72d-82b5-7000-8000-000000000004",
      name: "Body",
      physicalName: "body",
      tableColumnName: "body",
      isRecordLabel: false,
    }
    const onCellEdit = vi.fn(async (current, field, value) => ({
      tableId: "tasks",
      row: { ...current, [field.tableColumnName]: value },
      rowCount: 1,
    }))
    await act(async () => {
      root.render(
        <EidosFileRecordInspector
          variant="page"
          row={{
            _id: "row_1",
            title: "Write RFC",
            done: 0,
            formula: 2,
            body: "## Design\n\n**Local first.** <script>alert(1)</script>",
          }}
          fields={[...fields, contentField]}
          contentField={contentField}
          onClose={vi.fn()}
          onOpenInTab={vi.fn()}
          onCopyRecordId={vi.fn()}
          onCellEdit={onCellEdit}
        />
      )
    })

    const page = container.querySelector<HTMLElement>(
      '[data-eidos-file-record-layout="page"]'
    )
    expect(page?.className).toContain("absolute")
    expect(
      container.querySelector('[aria-label="Open record in tab"]')
    ).toBeNull()
    expect(
      container.querySelector('[aria-label="Close record details"]')
    ).not.toBeNull()
    expect(
      container.querySelector<HTMLElement>(
        '[data-eidos-file-record-page-scroll=""]'
      )?.className
    ).toContain("overflow-y-auto")
    expect(
      container.querySelector<HTMLElement>(
        '[aria-label="Close record details"]'
      )?.className
    ).not.toContain("fixed")
    const properties = container.querySelector<HTMLElement>(
      '[data-eidos-file-record-properties=""]'
    )
    expect(
      properties?.querySelector<HTMLElement>(".eidos-file-record-field")
        ?.className
    ).toContain("sm:grid-cols-")
    expect(properties?.textContent).not.toContain("Title")
    expect(properties?.textContent).not.toContain("Body")
    const pageTitle = container.querySelector<HTMLTextAreaElement>(
      '[data-eidos-file-record-title=""] textarea[aria-label="Title"]'
    )
    expect(pageTitle?.className).toContain("border-0")
    expect(container.textContent).toContain("Design")
    expect(container.textContent).toContain("Local first.")
    expect(container.querySelector("script")).toBeNull()
    expect(container.textContent).toContain("<script>alert(1)</script>")
    expect(container.textContent).toContain("Body")

    await act(async () => {
      if (!pageTitle) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set
      setter?.call(pageTitle, "Updated RFC")
      pageTitle.dispatchEvent(new Event("input", { bubbles: true }))
      pageTitle.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Write RFC" }),
      fields[0],
      "Updated RFC"
    )

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("Edit content"))
        ?.click()
    })
    const editor = container.querySelector<HTMLTextAreaElement>(
      '[data-eidos-file-markdown-editor="source"] textarea'
    )
    expect(editor?.className).toContain("overflow-hidden")
    expect(editor?.className).toContain("resize-none")
    expect(editor?.style.height).not.toBe("")
    await act(async () => {
      if (!editor) return
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )?.set
      setter?.call(editor, "# Updated")
      editor.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.trim() === "Save")
        ?.click()
      await Promise.resolve()
    })
    expect(onCellEdit).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("Design") }),
      contentField,
      "# Updated"
    )
  })

  it("exposes relation search as a keyboard-navigable combobox", async () => {
    const adaId = "0198c72d-82b5-7968-b163-98be4b7477df"
    const graceId = "0198c72d-82b5-7969-8163-98be4b7477df"
    const ownersField: EidosFileFieldInfo = {
      id: "0198c72d-82b5-7000-8000-000000000004",
      tableId: "0198c72d-82b5-7000-8000-000000000010",
      name: "Owners",
      type: "relation",
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
      { id: adaId, title: "Ada Lovelace" },
      { id: graceId, title: "Grace Hopper" },
    ])

    await act(async () => {
      root.render(
        <EidosFileRecordInspector
          row={row}
          fields={[fields[0], ownersField]}
          onClose={vi.fn()}
          onCopyRecordId={vi.fn()}
          onCellEdit={onCellEdit}
          onSearchRelation={onSearchRelation}
        />
      )
    })
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Owners"]')
        ?.click()
    })
    await act(async () => {
      await vi.waitFor(() => expect(onSearchRelation).toHaveBeenCalledOnce())
      await Promise.resolve()
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

    expect(onCellEdit).toHaveBeenCalledWith(
      row,
      ownersField,
      JSON.stringify([graceId])
    )
  })

  it("does not expose an editor for a Runtime-readonly inverse Relation", async () => {
    const inverseRelation: EidosFileFieldInfo = {
      id: "0198c72d-82b5-7000-8000-000000000005",
      tableId: "0198c72d-82b5-7000-8000-000000000010",
      name: "Referenced by",
      type: "relation",
      tableName: "tb_tasks",
      tableColumnName: "referenced_by",
      property: {
        direction: "inverse",
        targetTableId: "notes",
        sourceFieldId: "note-task",
        multiple: true,
      },
      storageCodec: "relation",
      valueKind: "relation",
      writable: false,
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    }
    const onSearchRelation = vi.fn().mockResolvedValue([])
    await act(async () => {
      root.render(
        <EidosFileRecordInspector
          row={{
            _id: "row_1",
            title: "Write RFC",
            referenced_by: null,
          }}
          fields={[fields[0]!, inverseRelation]}
          onClose={vi.fn()}
          onCopyRecordId={vi.fn()}
          onCellEdit={vi.fn()}
          onSearchRelation={onSearchRelation}
        />
      )
    })

    expect(
      container.querySelector('button[aria-label="Referenced by"]')
    ).toBeNull()
    expect(container.textContent).toContain("Empty")
    expect(onSearchRelation).not.toHaveBeenCalled()
  })
})
