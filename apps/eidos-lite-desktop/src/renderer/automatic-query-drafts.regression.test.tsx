// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
  EidosFileCsvImportPlan,
} from "@eidos.space/eidos-file"
import {
  EidosFileUIProvider,
  EidosFileQueryToolbar,
  EidosFileCsvImportPopover,
} from "@eidos.space/eidos-file-ui"
import { AutomaticMaterializationFence } from "./automatic-materialization"
import {
  Popover,
  PopoverContent,
  Input,
} from "../../../../packages/eidos-file-ui/src/ui/primitives"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const field: EidosFileFieldInfo = {
  id: "title",
  tableId: "tasks",
  tableName: "tasks",
  name: "Title",
  type: "text",
  tableColumnName: "title",
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  isRecordLabel: true,
  sourceTableColumnName: null,
  dependsOn: null,
}
const filter: EidosFileFilterGroup = {
  type: "group",
  conjunction: "and",
  children: [
    { type: "rule", field: "title", operator: "equals", value: "Saved filter" },
  ],
}
const sorts: [] = []
let host: HTMLDivElement
let root: Root
let fence: AutomaticMaterializationFence
const onFilter = vi.fn()
const onSort = vi.fn()
const pending = (id: string, value: boolean) => {
  if (value) fence.pending.add(id)
  else fence.pending.delete(id)
}
const button = (label: string) =>
  document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label} Eidos File rows"]`
  ) ??
  Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
    (item) => item.textContent?.trim() === label
  )!
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value() {},
  })
  onFilter.mockReset()
  onSort.mockReset()
  host = document.createElement("div")
  host.dataset.eidosFileWorkbench = ""
  document.body.append(host)
  root = createRoot(host)
  fence = new AutomaticMaterializationFence(() => {})
  fence.connect()
})
afterEach(async () => {
  fence.dispose()
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})
async function render(key = 0, protect = true) {
  await act(async () =>
    root.render(
      <EidosFileUIProvider onPendingEditChange={protect ? pending : undefined}>
        <EidosFileQueryToolbar
          key={key}
          fields={[field]}
          filter={filter}
          sorts={sorts}
          search=""
          onSearchChange={() => {}}
          onFilterChange={onFilter}
          onSortsChange={onSort}
        />
      </EidosFileUIProvider>
    )
  )
}
async function typeFilter() {
  await act(async () => button("Filter").click())
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Value"]'
  )!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "Unapplied filter")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  return input
}

it("reproduces an unapplied real toolbar filter being lost on a forced host rekey without a pending callback", async () => {
  await render(0, false)
  const input = await typeFilter()
  expect(input.value).toBe("Unapplied filter")
  expect(onFilter).not.toHaveBeenCalled()
  await render(1, false)
  await act(async () => button("Filter").click())
  expect(
    document.querySelector<HTMLInputElement>('input[aria-label="Value"]')!.value
  ).toBe("Saved filter")
  expect(onFilter).not.toHaveBeenCalled()
})

it("reproduces an unapplied real toolbar sort being lost on a forced host rekey without a pending callback", async () => {
  await render(0, false)
  await act(async () => {
    button("Sort").click()
  })
  await act(async () => button("Add sort").click())
  expect(document.querySelector('[aria-label="Sort field 1"]')).not.toBeNull()
  expect(onSort).not.toHaveBeenCalled()
  await render(1, false)
  await act(async () => button("Sort").click())
  expect(document.querySelector('[aria-label="Sort field 1"]')).toBeNull()
  expect(onSort).not.toHaveBeenCalled()
})

it("holds automatic apply for a real unapplied filter, preserves its input, and resumes on explicit close", async () => {
  await render()
  expect(fence.pending.size).toBe(0)
  const input = await typeFilter()
  expect(fence.prepare("filter-draft", "space", "space")).toBe(false)
  expect(input.value).toBe("Unapplied filter")
  expect(onFilter).not.toHaveBeenCalled()
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  )
  expect(fence.pending.size).toBe(0)
  expect(fence.prepare("closed-filter", "space", "space")).toBe(true)
  await fence.release("closed-filter")
})

it("holds automatic apply for real sort configuration and a failed Apply until explicit close", async () => {
  await render()
  await act(async () => button("Sort").click())
  await act(async () => button("Add sort").click())
  expect(fence.prepare("sort-draft", "space", "space")).toBe(false)
  expect(onSort).not.toHaveBeenCalled()
  onSort.mockRejectedValueOnce(new Error("Sort save failed"))
  await act(async () => button("Apply").click())
  expect(document.body.textContent).toContain("Sort save failed")
  expect(fence.prepare("failed-sort", "space", "space")).toBe(false)
  const dialog = document.querySelector("[data-eidos-file-sort-popover]")!
  await act(async () =>
    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  )
  expect(fence.pending.size).toBe(0)
})

it("fences a real shared configuration portal that mounts after atomic apply admission", async () => {
  await render()
  expect(fence.prepare("apply", "space", "space")).toBe(true)
  const onChange = vi.fn()
  await act(async () =>
    root.render(
      <EidosFileUIProvider>
        <Popover open>
          <PopoverContent>
            <Input
              aria-label="Late configuration"
              defaultValue="Saved"
              onChange={onChange}
            />
          </PopoverContent>
        </Popover>
      </EidosFileUIProvider>
    )
  )
  const input = document.querySelector<HTMLInputElement>(
    'input[aria-label="Late configuration"]'
  )!
  const portal = input.closest("[data-eidos-file-root]")!
  expect(host.contains(input)).toBe(false)
  expect(portal.hasAttribute("inert")).toBe(true)
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: "typed during apply",
  })
  expect(input.dispatchEvent(event)).toBe(false)
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "Blocked native input")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  expect(onChange).not.toHaveBeenCalled()
  await act(async () => fence.release("apply"))
  expect(portal.hasAttribute("inert")).toBe(false)
})

it("keeps real CSV selection and unapplied import options pending without importing automatically", async () => {
  const plan: EidosFileCsvImportPlan = {
    fileName: "contacts.csv",
    tableName: "Contacts",
    rowCount: 1,
    skippedRowCount: 0,
    columns: [
      {
        sourceIndex: 0,
        sourceName: "Name",
        name: "Name",
        columnName: "Name",
        type: "record-label",
      },
    ],
    sampleRows: [["Ada"]],
    issues: [],
  }
  let select!: (value: {
    canceled: false
    token: string
    fileName: string
  }) => void
  const onSelect = vi.fn(
    () =>
      new Promise<{ canceled: false; token: string; fileName: string }>(
        (resolve) => {
          select = resolve
        }
      )
  )
  const onImport = vi.fn(async () => {})
  await act(async () =>
    root.render(
      <EidosFileUIProvider onPendingEditChange={pending}>
        <EidosFileCsvImportPopover
          onSelect={onSelect}
          onPreview={async () => plan}
          onImport={onImport}
          onProgress={async () => null}
          onCancel={async () => true}
        />
      </EidosFileUIProvider>
    )
  )
  expect(fence.pending.size).toBe(0)
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Import CSV into Eidos File"]'
      )!
      .click()
  )
  expect(fence.prepare("csv-selecting", "space", "space")).toBe(false)
  await act(async () => {
    select({
      canceled: false,
      token: "synthetic-csv",
      fileName: "contacts.csv",
    })
    await Promise.resolve()
  })
  const input = document.querySelector<HTMLInputElement>(
    "#eidos-file-csv-table-name"
  )!
  expect(input).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, "Unapplied import target")
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 350))
  })
  expect(fence.prepare("csv-options", "space", "space")).toBe(false)
  expect(input.value).toBe("Unapplied import target")
  expect(onImport).not.toHaveBeenCalled()
  await act(async () =>
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    )
  )
  expect(fence.pending.size).toBe(0)
})
