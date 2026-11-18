import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "./context"
import { EidosFileFieldPropertyPanel } from "./eidos-file-field-property-panel"
import { EidosFileFieldCreatePopover } from "./eidos-file-field-create-popover"
import { EidosFileRecordInspector } from "./eidos-file-record-inspector"
import { EidosFileFormView } from "./eidos-file-form-view"
import type { EidosFileEditorDataSource } from "./data-source"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const dateField: EidosFileFieldInfo = {
  id: "date",
  tableId: "table",
  name: "Day",
  type: "date",
  tableName: "Dates",
  tableColumnName: "Day",
  nullable: true,
  writable: true,
  property: { defaultValue: "now" },
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}
const instantField: EidosFileFieldInfo = {
  ...dateField,
  id: "instant",
  name: "When",
  tableColumnName: "When",
  type: "datetime",
}
const view: EidosFileViewInfo = {
  id: "form",
  tableId: "table",
  name: "Form",
  type: "form",
  query: "",
  properties: {},
  filter: null,
  sorts: [],
  hiddenFields: [],
  orderMap: null,
  position: 0,
  createdAt: "",
  updatedAt: "",
}
const table: EidosFileTableSnapshot = {
  table: {
    id: "table",
    name: "Dates",
    rawTableName: "Dates",
    position: 0,
    icon: null,
    description: null,
    createdAt: "",
    updatedAt: "",
  },
  fields: [dateField, instantField],
  temporalDefaultsVersion: 1,
  views: [view],
  rowCount: 0,
}
let root: Root, container: HTMLDivElement
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  })
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-16T16:00:00.123Z"))
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function choose(label: string, option: string) {
  await act(async () => {
    document
      .querySelector<HTMLElement>(`[aria-label="${label}"]`)!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
  })
  const item = Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"]')
  ).find((element) => element.textContent?.trim() === option)
  expect(item).toBeTruthy()
  await act(async () => item!.click())
}
function inputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )!.set!.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

it.each([dateField, instantField])(
  "configures and disables a $type default through the field panel",
  async (field) => {
    const onUpdate = vi.fn(async () => undefined)
    await act(async () =>
      root.render(
        <EidosFileFieldPropertyPanel
          field={{ ...field, property: {} }}
          tables={[table]}
          disabled={false}
          onClose={vi.fn()}
          onDelete={vi.fn()}
          onUpdate={onUpdate}
        />
      )
    )
    await choose(
      "Default value",
      field.type === "date" ? "Current date" : "Current time"
    )
    expect(onUpdate).toHaveBeenLastCalledWith(expect.anything(), {
      property: { defaultValue: "now" },
    })
    await act(async () =>
      root.render(
        <EidosFileFieldPropertyPanel
          field={field}
          tables={[table]}
          disabled={false}
          onClose={vi.fn()}
          onDelete={vi.fn()}
          onUpdate={onUpdate}
        />
      )
    )
    await choose("Default value", "No default")
    expect(onUpdate).toHaveBeenLastCalledWith(field, {
      property: { defaultValue: null },
    })
  }
)

it("keeps the control off system/read-only fields and services without the capability", async () => {
  for (const [field, tables] of [
    [
      { ...instantField, valueKind: "system", systemRole: "created-time" },
      [table],
    ],
    [{ ...dateField, settings: { writable: false } }, [table]],
    [dateField, [{ ...table, temporalDefaultsVersion: undefined }]],
  ] as const) {
    await act(async () =>
      root.render(
        <EidosFileFieldPropertyPanel
          field={field}
          tables={[...tables]}
          disabled={false}
          onClose={vi.fn()}
          onDelete={vi.fn()}
          onUpdate={vi.fn()}
        />
      )
    )
    expect(document.querySelector('[aria-label="Default value"]')).toBeNull()
  }
})

it("saves the selected rule when creating a new Date field", async () => {
  const onCreate = vi.fn(async () => undefined)
  await act(async () =>
    root.render(
      <EidosFileFieldCreatePopover
        open
        embedded
        table={table}
        tables={[table]}
        allowedTypes={["date"]}
        onOpenChange={vi.fn()}
        onCreate={onCreate}
      />
    )
  )
  await choose("Default value", "Current date")
  await act(async () => inputValue(container.querySelector("input")!, "Due"))
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  )
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Due",
      type: "date",
      property: { defaultValue: "now" },
    })
  )
})

it("retains one unsaved draft instant through a failed-save retry and zone/clock changes", async () => {
  let fail = true
  const commits = vi.fn(async (_field: EidosFileFieldInfo, _value: unknown) => {
    if (fail) throw new Error("Synthetic failure")
  })
  function Draft({ zone = "Asia/Shanghai" }: { zone?: string }) {
    const [row, setRow] = useState<EidosFileRow>({ _id: "draft" })
    return (
      <EidosFileUIProvider timeZone={zone} calendarTimeZoneData="2026f">
        <EidosFileRecordInspector
          row={row}
          fields={[dateField, instantField]}
          isNewRecord
          onCellEdit={async (previous, field, value) => {
            await commits(field, value)
            const next = { ...previous, [field.tableColumnName]: value }
            setRow((current) => ({
              ...current,
              [field.tableColumnName]: value,
            }))
            return { tableId: "table", row: next, rowCount: 0 }
          }}
        />
      </EidosFileUIProvider>
    )
  }
  await act(async () => root.render(<Draft />))
  expect(commits).toHaveBeenLastCalledWith(dateField, "2026-11-17")
  expect(container.textContent).toContain("Synthetic failure")
  vi.setSystemTime(new Date("2026-11-20T12:00:00.999Z"))
  await act(async () => root.render(<Draft zone="America/Los_Angeles" />))
  expect(commits).toHaveBeenCalledTimes(1)
  fail = false
  await act(async () =>
    Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Retry")!
      .click()
  )
  expect(
    commits.mock.calls.map(([field, value]) => [field.type, value])
  ).toEqual([
    ["date", "2026-11-17"],
    ["date", "2026-11-17"],
    ["datetime", "2026-11-16T16:00:00.123Z"],
  ])
  await act(async () => root.render(<Draft />))
  expect(commits).toHaveBeenCalledTimes(3)
})

it.each([
  {
    row: { _id: "explicit", Day: null, When: "2000-01-01T00:00:00.000Z" },
    isNewRecord: true,
    loading: false,
  },
  { row: { _id: "existing" }, isNewRecord: false, loading: false },
  { row: { _id: "loading" }, isNewRecord: true, loading: true },
])(
  "does not seed explicit values or existing/loading records ($row._id)",
  async ({ row, isNewRecord, loading }) => {
    const onCellEdit = vi.fn()
    await act(async () =>
      root.render(
        <EidosFileRecordInspector
          row={row as EidosFileRow}
          fields={[dateField, instantField]}
          isNewRecord={isNewRecord}
          loading={loading}
          onCellEdit={onCellEdit}
        />
      )
    )
    expect(onCellEdit).not.toHaveBeenCalled()
  }
)

it("previews dates in Form and keeps a cleared field empty across clock/zone changes", async () => {
  const source = {} as EidosFileEditorDataSource
  const render = (zone: string) =>
    root.render(
      <EidosFileUIProvider timeZone={zone}>
        <EidosFileFormView
          source={source}
          table={table}
          view={view}
          query={{}}
          search=""
          disabled={false}
          reloadToken={0}
          commands={[]}
          selection={{ rowIds: [] }}
          state={{ formMode: "preview" }}
          capabilities={{
            read: true,
            mutate: true,
            resolveAssets: true,
            rawFile: false,
            nativeFileSystem: false,
          }}
        />
      </EidosFileUIProvider>
    )
  await act(async () => render("Asia/Shanghai"))
  const input = () =>
    container.querySelector<HTMLInputElement>('input[type="date"]')!
  expect(input().value).toBe("2026-11-17")
  await act(async () => inputValue(input(), ""))
  await act(async () =>
    input().dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
  )
  vi.setSystemTime(new Date("2026-11-21T00:00:00.000Z"))
  await act(async () => render("America/New_York"))
  expect(input().value).toBe("")
})
