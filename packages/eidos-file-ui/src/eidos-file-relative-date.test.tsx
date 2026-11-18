import React, { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { EidosFileUIProvider } from "./context"
import {
  EidosFileRelativeDateControls,
  type RelativeDateSelection,
} from "./eidos-file-relative-date-controls"
import { EidosFileFieldFilterEditor } from "./eidos-file-query-toolbar"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
} from "@eidos.space/eidos-file"

const roots: ReturnType<typeof createRoot>[] = []
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(Element.prototype, "scrollIntoView", {
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
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ""
})
function mount(node: React.ReactNode) {
  const div = document.createElement("div")
  document.body.append(div)
  const root = createRoot(div)
  roots.push(root)
  act(() => root.render(node))
  return div
}
async function select(label: string, value: string) {
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
      .click()
  )
  const item = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent?.trim() === value)!
  expect(item).toBeDefined()
  await act(async () => item.click())
}
function input(value: string) {
  act(() => {
    const element = document.querySelector<HTMLInputElement>(
      'input[type="number"]'
    )!
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(element, value)
    element.dispatchEvent(new Event("input", { bubbles: true }))
    element.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
it("shows count only for Past/Next, pluralizes units and resets after This", async () => {
  const change = vi.fn()
  function Fixture() {
    const [value, setValue] = useState<RelativeDateSelection>({
      direction: "this",
      count: 1,
      unit: "week",
    })
    return (
      <EidosFileUIProvider>
        <EidosFileRelativeDateControls
          value={value}
          onChange={(next) => {
            change(next)
            setValue(next)
          }}
        />
      </EidosFileUIProvider>
    )
  }
  mount(<Fixture />)
  expect(document.querySelector('input[type="number"]')).toBeNull()
  await select("Period relation", "Past")
  input("2")
  expect(
    document.querySelector('[aria-label="Calendar unit"]')?.textContent
  ).toContain("weeks")
  await select("Period relation", "Next")
  expect(change.mock.lastCall?.[0].count).toBe(2)
  const calls = change.mock.calls.length
  input("")
  input("0")
  input("1.5")
  expect(change.mock.calls).toHaveLength(calls)
  await select("Period relation", "This")
  expect(document.querySelector('input[type="number"]')).toBeNull()
  await select("Period relation", "Past")
  expect(
    document.querySelector<HTMLInputElement>('input[type="number"]')?.value
  ).toBe("1")
})

const field: EidosFileFieldInfo = {
  id: "instant",
  tableId: "table",
  name: "Created time",
  type: "datetime",
  tableName: "Records",
  tableColumnName: "instant",
  physicalName: "instant",
  isRecordLabel: false,
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}
it("saves a single-field window immediately and retains its read-only calendar", async () => {
  const change = vi.fn(),
    close = vi.fn()
  const value: EidosFileFilterGroup = {
    type: "group",
    conjunction: "and",
    children: [
      {
        type: "rule",
        field: "instant",
        operator: "is-in-calendar-period",
        value: { unit: "week", offset: 0 },
      },
    ],
  }
  mount(
    <EidosFileUIProvider
      calendarWindowVersion={1}
      calendarPeriodTimeZoneData={["2026f"]}
      timeZone="Asia/Shanghai"
    >
      <EidosFileFieldFilterEditor
        field={field}
        value={value}
        onChange={change}
        onClose={close}
        onBack={() => {}}
      />
    </EidosFileUIProvider>
  )
  expect(
    document.querySelectorAll("[data-eidos-file-relative-calendar] td")
  ).toHaveLength(42)
  await select("Period relation", "Past")
  expect(change.mock.lastCall?.[0].children[0]).toMatchObject({
    operator: "is-in-calendar-window",
    value: { direction: "past", count: 1, unit: "week" },
  })
  expect(close).not.toHaveBeenCalled()
  expect(
    document.querySelectorAll("[data-eidos-file-relative-calendar] td")
  ).toHaveLength(42)
  expect(document.body.textContent).not.toContain("Apply")
})

it("keeps an unadvertised window visibly distinct from a complete legacy period", () => {
  const change = vi.fn()
  const value: EidosFileFilterGroup = {
    type: "group",
    conjunction: "and",
    children: [
      {
        type: "rule",
        field: "instant",
        operator: "is-in-calendar-window",
        value: { direction: "past", count: 2, unit: "month" },
      },
    ],
  }
  mount(
    <EidosFileUIProvider calendarPeriodTimeZoneData={["2026f"]}>
      <EidosFileFieldFilterEditor
        field={field}
        value={value}
        onChange={change}
        onClose={() => {}}
        onBack={() => {}}
      />
    </EidosFileUIProvider>
  )
  const count = document.querySelector<HTMLInputElement>(
    'input[type="number"]'
  )!
  expect(count.value).toBe("2")
  expect(count.matches(":disabled")).toBe(true)
  expect(
    document.querySelector('[aria-label="Period relation"]')?.textContent
  ).toContain("Past")
  expect(change).not.toHaveBeenCalled()
})
