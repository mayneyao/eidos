// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"

import { EidosFileLookupEditor } from "./eidos-file-lookup-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const titleField: EidosFileFieldInfo = {
  name: "title",
  type: "title",
  tableName: "tb_people",
  tableColumnName: "title",
  property: null,
  storageCodec: "scalar",
  valueKind: "system",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}
const relationField: EidosFileFieldInfo = {
  ...titleField,
  name: "Owners",
  type: "link",
  tableName: "tb_projects",
  tableColumnName: "owners",
  property: {
    targetTableId: "people",
    targetField: "title",
    multiple: true,
  },
  storageCodec: "relation",
  valueKind: "relation",
}
const lookupField: EidosFileFieldInfo = {
  ...titleField,
  name: "Owner count",
  type: "lookup",
  tableName: "tb_projects",
  tableColumnName: "owner_count",
  property: {
    relationField: "owners",
    targetField: "title",
    aggregate: "count",
    displayType: "number",
  },
  valueKind: "derived",
  isDerived: true,
  dependsOn: ["owners"],
}
const people: EidosFileTableSnapshot = {
  table: {
    id: "people",
    name: "People",
    rawTableName: "tb_people",
    position: 1,
    icon: null,
    description: null,
    createdAt: "2026-07-12",
    updatedAt: "2026-07-12",
  },
  fields: [titleField],
  views: [],
  rowCount: 0,
}

function submitLookup() {
  document.body
    .querySelector("form")
    ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
}

describe("EidosFileLookupEditor", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("updates lookup settings inside an anchored popover", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <EidosFileLookupEditor
          field={lookupField}
          fields={[relationField, lookupField]}
          tables={[people]}
          open
          onOpenChange={vi.fn()}
          onSave={onSave}
        />
      )
    })
    expect(document.body.querySelector('[aria-modal="true"]')).toBeNull()
    await act(async () => {
      submitLookup()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith({
      relationField: "owners",
      targetField: "title",
      aggregate: "count",
      displayType: "number",
    })
  })

  it("allows another lookup as the target field", async () => {
    const nestedTarget: EidosFileFieldInfo = {
      ...titleField,
      name: "Owner count",
      type: "lookup",
      tableColumnName: "owner_count",
      property: {
        relationField: "members",
        targetField: "title",
        aggregate: "count",
        displayType: "number",
      },
      valueKind: "derived",
      isDerived: true,
      dependsOn: ["members"],
    }
    const onSave = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <EidosFileLookupEditor
          field={lookupField}
          fields={[relationField, lookupField]}
          tables={[{ ...people, fields: [nestedTarget] }]}
          open
          onOpenChange={vi.fn()}
          onSave={onSave}
        />
      )
    })

    await act(async () => {
      submitLookup()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith({
      relationField: "owners",
      targetField: "owner_count",
      aggregate: "count",
      displayType: "number",
    })
  })

  it("keeps its session state and error when recovery replaces the field", async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error("Lookup file is read-only"))
      .mockResolvedValueOnce(undefined)
    const onOpenChange = vi.fn()
    const renderEditor = async (field: EidosFileFieldInfo) => {
      await act(async () => {
        root.render(
          <EidosFileLookupEditor
            field={field}
            fields={[relationField, field]}
            tables={[people]}
            open
            onOpenChange={onOpenChange}
            onSave={onSave}
          />
        )
      })
    }

    await renderEditor(lookupField)
    await act(async () => {
      submitLookup()
      await Promise.resolve()
    })
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "Lookup file is read-only"
    )
    expect(onOpenChange).not.toHaveBeenCalled()

    await renderEditor({
      ...lookupField,
      property: { ...lookupField.property, aggregate: "first" },
    })
    expect(
      Array.from(document.body.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Count"
      )
    ).toBe(true)
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "Lookup file is read-only"
    )

    await act(async () => {
      submitLookup()
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("prevents duplicate lookup writes while one is pending", async () => {
    let resolveSave: (() => void) | undefined
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve
        })
    )
    const onOpenChange = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileLookupEditor
          field={lookupField}
          fields={[relationField, lookupField]}
          tables={[people]}
          open
          onOpenChange={onOpenChange}
          onSave={onSave}
        />
      )
    })

    await act(async () => {
      submitLookup()
      submitLookup()
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(
      Array.from(document.body.querySelectorAll("button")).find(
        (button) => button.textContent === "Cancel"
      )?.disabled
    ).toBe(true)

    await act(async () => {
      resolveSave?.()
      await Promise.resolve()
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
