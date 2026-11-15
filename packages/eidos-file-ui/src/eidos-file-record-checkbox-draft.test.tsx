// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileSqlPrimitive,
} from "@eidos.space/eidos-file"
import { EidosFileRecordFieldEditor } from "./eidos-file-record-field-editor"
import { EidosFileRecordInspector } from "./eidos-file-record-inspector"
import { EidosFileUIProvider } from "./context"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const checkbox: EidosFileFieldInfo = {
  id: "flag",
  tableId: "table",
  name: "Flag",
  type: "checkbox",
  tableName: "Records",
  tableColumnName: "flag",
  nullable: false,
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}

describe("Checkbox defaults in an explicit new-record draft", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it("shows an omitted required stored Checkbox as unchecked in the Android share draft shape", async () => {
    const onChange = vi.fn()
    await act(async () =>
      root.render(
        <EidosFileRecordFieldEditor
          field={checkbox}
          row={{ _id: "share-draft" }}
          isNewRecord
          appearance="record-property"
          disabled={false}
          onChange={onChange}
        />
      )
    )
    expect(
      container.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")
    ).toBe("false")
    expect(onChange).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: "explicit NULL in a new record",
      row: { flag: null },
      isNewRecord: true,
      field: checkbox,
    },
    {
      label: "unprojected value in an existing record",
      row: {},
      isNewRecord: false,
      field: checkbox,
    },
    {
      label: "legacy nullable omission",
      row: {},
      isNewRecord: true,
      field: { ...checkbox, nullable: true },
    },
    {
      label: "legacy nullable NULL",
      row: { flag: null },
      isNewRecord: true,
      field: { ...checkbox, nullable: true },
    },
    {
      label: "derived Boolean omission",
      row: {},
      isNewRecord: true,
      field: { ...checkbox, isDerived: true, valueKind: "derived" as const },
    },
  ])(
    "preserves the empty state for $label",
    async ({ row, isNewRecord, field }) => {
      const record: EidosFileRow = { _id: "share-draft" }
      Object.assign(record, row)
      await act(async () =>
        root.render(
          <EidosFileRecordFieldEditor
            field={field}
            row={record}
            isNewRecord={isNewRecord}
            appearance="record-property"
            disabled={false}
            onChange={vi.fn()}
          />
        )
      )
      expect(
        container
          .querySelector('[role="checkbox"]')
          ?.getAttribute("aria-checked")
      ).toBe("mixed")
    }
  )

  it("does not interpret an explicitly present undefined property as an omitted create input", async () => {
    const row: EidosFileRow = { _id: "draft" }
    Object.defineProperty(row, "flag", { value: undefined, enumerable: true })
    await act(async () =>
      root.render(
        <EidosFileRecordFieldEditor
          field={checkbox}
          row={row}
          isNewRecord
          appearance="record-property"
          disabled={false}
          onChange={vi.fn()}
        />
      )
    )
    expect(
      container.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")
    ).toBe("mixed")
  })

  it("toggles the default in both directions and restores an omitted draft on cancel without an eager write", async () => {
    const changes: EidosFileSqlPrimitive[] = []
    function Draft() {
      const [row, setRow] = useState<EidosFileRow>({ _id: "any-new-record" })
      return (
        <>
          <EidosFileRecordFieldEditor
            field={checkbox}
            row={row}
            isNewRecord
            appearance="record-property"
            disabled={false}
            onChange={async (value) => {
              changes.push(value)
              setRow((current) => ({ ...current, flag: value }))
            }}
          />
          <button
            data-cancel-draft
            onClick={() => setRow({ _id: "another-new-record" })}
          >
            Cancel draft
          </button>
        </>
      )
    }
    await act(async () => root.render(<Draft />))
    const input = () =>
      container.querySelector<HTMLButtonElement>('[role="checkbox"]')!
    expect(input().getAttribute("aria-checked")).toBe("false")
    expect(changes).toEqual([])
    await act(async () => input().click())
    expect(input().getAttribute("aria-checked")).toBe("true")
    await act(async () => input().click())
    expect(input().getAttribute("aria-checked")).toBe("false")
    expect(changes).toEqual([1, 0])
    await act(async () =>
      container.querySelector<HTMLButtonElement>("[data-cancel-draft]")!.click()
    )
    expect(input().getAttribute("aria-checked")).toBe("false")
    expect(changes).toEqual([1, 0])
  })

  it.each([
    { isNewRecord: true, loading: false, expected: "false" },
    { isNewRecord: false, loading: false, expected: "mixed" },
    { isNewRecord: true, loading: true, expected: "mixed" },
  ])(
    "passes new-record context through the inspector without defaulting a loading record ($isNewRecord/$loading)",
    async ({ isNewRecord, loading, expected }) => {
      await act(async () =>
        root.render(
          <EidosFileUIProvider interactionMode="mobile">
            <EidosFileRecordInspector
              row={{ _id: "share-draft" }}
              fields={[checkbox]}
              isNewRecord={isNewRecord}
              loading={loading}
              preserveContentWhileLoading
              onCellEdit={vi.fn()}
            />
          </EidosFileUIProvider>
        )
      )
      expect(
        container
          .querySelector('[role="checkbox"]')
          ?.getAttribute("aria-checked")
      ).toBe(expected)
    }
  )
})
