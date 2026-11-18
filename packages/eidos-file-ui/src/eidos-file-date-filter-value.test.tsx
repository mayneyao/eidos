import React, { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
  EidosFileFilterOperator,
  EidosFileFilterRuleValue,
} from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "./context"
import {
  EidosFileDateFilterValue,
  focusInvalidDateFilter,
} from "./eidos-file-date-filter-value"
import { EidosFileFieldFilterEditor } from "./eidos-file-query-toolbar"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
})
const roots: ReturnType<typeof createRoot>[] = []
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ""
})
function mount(node: React.ReactNode, zone = "Asia/Shanghai") {
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  roots.push(root)
  act(() =>
    root.render(
      <EidosFileUIProvider
        locale="en"
        timeZone={zone}
        calendarPeriodTimeZoneData={["2026f"]}
        calendarWindowVersion={1}
      >
        {node}
      </EidosFileUIProvider>
    )
  )
  return host
}
async function clickDay(day: string) {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.rdp button[name="day"]')
  ).find((button) => button.textContent === day)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function select(label: string, value: string) {
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
      .click()
  )
  const option = Array.from(
    document.querySelectorAll<HTMLElement>('[role="option"]')
  ).find((option) => option.textContent === value)
  expect(option).toBeDefined()
  await act(async () => option!.click())
}
function Harness({
  type = "datetime",
  initial = "2026-11-16T04:15:37.123Z",
  range = false,
  inline = true,
  changed,
}: {
  type?: "date" | "datetime"
  initial?: EidosFileFilterRuleValue
  range?: boolean
  inline?: boolean
  changed(value: EidosFileFilterRuleValue): void
}) {
  const [value, setValue] = useState(initial)
  return (
    <EidosFileDateFilterValue
      type={type}
      value={value}
      range={range}
      inline={inline}
      onChange={(value) => {
        changed(value)
        setValue(value)
      }}
    />
  )
}

it("opens and navigates a calendar without changing a filter", async () => {
  const changed = vi.fn()
  const host = mount(
    <Harness initial="2026-11-16" type="date" changed={changed} />
  )
  expect(host.querySelector(".rdp")).not.toBeNull()
  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[name="next-month"]')!.click()
  )
  expect(changed).not.toHaveBeenCalled()
  await clickDay("17")
  expect(changed).toHaveBeenLastCalledWith("2026-12-17")
})

it("changes a wall date while preserving time, seconds, and milliseconds in the application zone", async () => {
  const changed = vi.fn()
  const host = mount(<Harness changed={changed} />)
  expect(host.querySelector<HTMLInputElement>("input")!.value).toBe(
    "2026-11-16T12:15:37.123"
  )
  await clickDay("17")
  expect(changed).toHaveBeenLastCalledWith("2026-11-17T04:15:37.123Z")
  await select("Hour", "09")
  expect(changed).toHaveBeenLastCalledWith("2026-11-17T01:15:37.123Z")
  await select("Minute", "42")
  expect(changed).toHaveBeenLastCalledWith("2026-11-17T01:42:37.123Z")
})

it("edits both range endpoints without changing their clock precision", async () => {
  const changed = vi.fn()
  mount(
    <Harness
      initial={["2026-11-16T04:15:37.123Z", "2026-11-20T10:45:23.456Z"]}
      range
      changed={changed}
    />
  )
  await clickDay("17")
  expect(changed).toHaveBeenLastCalledWith([
    "2026-11-17T04:15:37.123Z",
    "2026-11-20T10:45:23.456Z",
  ])
  await clickDay("19")
  expect(changed).toHaveBeenLastCalledWith([
    "2026-11-17T04:15:37.123Z",
    "2026-11-19T10:45:23.456Z",
  ])
})

it("marks only the interval as selected and advances naturally to the ending input", async () => {
  const changed = vi.fn()
  const host = mount(
    <Harness
      initial={["2026-11-16", "2026-11-20"]}
      type="date"
      range
      changed={changed}
    />
  )
  const selectedDays = () =>
    Array.from(
      host.querySelectorAll('button[name="day"][aria-selected="true"]')
    ).map((button) => button.textContent)
  expect(selectedDays()).toEqual(["16", "17", "18", "19", "20"])
  expect(host.querySelector(".eidos-date-filter-endpoints")).toBeNull()
  await clickDay("17")
  expect(document.activeElement).toBe(
    host.querySelector('input[aria-label="Ending date"]')
  )
  expect(selectedDays()).toEqual(["17", "18", "19", "20"])
  await act(async () =>
    host
      .querySelector<HTMLInputElement>('input[aria-label="Starting date"]')!
      .focus()
  )
  await clickDay("18")
  expect(changed).toHaveBeenLastCalledWith(["2026-11-18", "2026-11-20"])
  expect(selectedDays()).toEqual(["18", "19", "20"])
})

it("keeps the calendar popover open while choosing both range endpoints", async () => {
  const changed = vi.fn()
  const host = mount(
    <Harness
      initial={["2026-11-16", "2026-11-20"]}
      type="date"
      range
      inline={false}
      changed={changed}
    />
  )
  expect(host.querySelector("input")).toBeNull()
  expect(
    host.querySelectorAll(".eidos-date-filter-summary-endpoint")
  ).toHaveLength(2)
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="Choose date"]')!
      .click()
  )
  await clickDay("17")
  expect(document.querySelector(".eidos-date-filter-popover")).not.toBeNull()
  expect(document.activeElement).toBe(
    document.querySelector('input[aria-label="Ending date"]')
  )
  await clickDay("19")
  expect(changed).toHaveBeenLastCalledWith(["2026-11-17", "2026-11-19"])
  expect(document.querySelector(".eidos-date-filter-popover")).not.toBeNull()
})

it("opens an incomplete compact value on validation and blocks invalid portalled drafts", async () => {
  const changed = vi.fn()
  const host = mount(
    <Harness
      initial={["", ""]}
      type="date"
      range
      inline={false}
      changed={changed}
    />
  )
  await act(async () => expect(focusInvalidDateFilter(host)).toBe(true))
  expect(
    document.querySelectorAll(".eidos-date-filter-popover input")
  ).toHaveLength(2)
  await clickDay("17")
  await clickDay("19")
  expect(changed).toHaveBeenLastCalledWith(["2026-11-17", "2026-11-19"])
  expect(focusInvalidDateFilter(host)).toBe(false)
  const ending = document.querySelector<HTMLInputElement>(
    'input[aria-label="Ending date"]'
  )!
  await fill(ending, "2026-11-16")
  await act(async () => expect(focusInvalidDateFilter(host)).toBe(true))
  expect(changed).toHaveBeenCalledTimes(1)
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "ending date"
  )
})

it("keeps datetime precision and zone in the compact calendar popover", async () => {
  const host = mount(
    <Harness
      initial={["2026-11-16T04:15:37.123Z", "2026-11-20T10:45:23.456Z"]}
      range
      inline={false}
      changed={() => {}}
    />
  )
  expect(host.querySelector("input")).toBeNull()
  expect(host.querySelector("button")!.title).toContain("Asia/Shanghai")
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Choose date & time"]'
      )!
      .click()
  )
  expect(
    Array.from(
      document.querySelectorAll<HTMLInputElement>(
        ".eidos-date-filter-popover input"
      ),
      (i) => i.value
    )
  ).toEqual(["2026-11-16T12:15:37.123", "2026-11-20T18:45:23.456"])
  expect(document.querySelector('button[aria-label="Hour"]')).not.toBeNull()
})

it.each(["2026-03-08T02:30:00", "2026-11-01T01:30:00"])(
  "keeps the last valid condition for a DST gap/fold: %s",
  async (invalid) => {
    const changed = vi.fn()
    const host = mount(<Harness changed={changed} />, "America/New_York")
    await fill(host.querySelector("input")!, invalid)
    expect(changed).not.toHaveBeenCalled()
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      "ambiguous or unavailable"
    )
    expect(focusInvalidDateFilter(host)).toBe(true)
  }
)

it("keeps an incomplete or reversed range out of the canonical condition", async () => {
  const changed = vi.fn()
  const host = mount(
    <Harness
      initial={["2026-11-16", "2026-11-20"]}
      type="date"
      range
      changed={changed}
    />
  )
  const inputs = host.querySelectorAll("input")
  await fill(inputs[1]!, "2026-11-15")
  expect(changed).not.toHaveBeenCalled()
  expect(host.querySelector('[role="alert"]')!.textContent).toContain(
    "ending date"
  )
  await fill(inputs[1]!, "")
  expect(changed).not.toHaveBeenCalled()
  expect(inputs[1]!.checkValidity()).toBe(false)
  await fill(inputs[1]!, "2026-11-21")
  expect(changed).toHaveBeenLastCalledWith(["2026-11-16", "2026-11-21"])
})

const field: EidosFileFieldInfo = {
  id: "day",
  tableId: "table",
  tableName: "Dates",
  tableColumnName: "day",
  name: "Date",
  type: "date",
  isRecordLabel: false,
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}
const operators: EidosFileFilterOperator[] = [
  "equals",
  "not-equals",
  "less-than",
  "greater-than",
  "less-than-or-equal",
  "greater-than-or-equal",
  "is-between",
]
it.each(operators)(
  "renders a calendar for the existing %s operator and preserves Apply/Cancel",
  async (operator) => {
    const changed = vi.fn(),
      close = vi.fn()
    const filter: EidosFileFilterGroup = {
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: "day",
          operator,
          value:
            operator === "is-between"
              ? ["2026-11-16", "2026-11-20"]
              : "2026-11-16",
        },
      ],
    }
    const host = mount(
      <EidosFileFieldFilterEditor
        field={field}
        value={filter}
        onChange={changed}
        onClose={close}
        onBack={close}
      />
    )
    expect(host.querySelector(".rdp")).not.toBeNull()
    await clickDay("17")
    expect(changed).not.toHaveBeenCalled()
    const apply = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent === "Apply")!
    await act(async () => apply.click())
    expect(changed).toHaveBeenCalledWith({
      ...filter,
      children: [
        {
          type: "rule",
          field: "day",
          operator,
          value:
            operator === "is-between"
              ? ["2026-11-17", "2026-11-20"]
              : "2026-11-17",
        },
      ],
    })
  }
)

it("blocks an invalid Apply and Cancel leaves the saved condition unchanged", async () => {
  const changed = vi.fn(),
    close = vi.fn()
  const filter: EidosFileFilterGroup = {
    type: "group",
    conjunction: "and",
    children: [
      { type: "rule", field: "day", operator: "equals", value: "2026-11-16" },
    ],
  }
  const host = mount(
    <EidosFileFieldFilterEditor
      field={field}
      value={filter}
      onChange={changed}
      onClose={close}
      onBack={close}
    />
  )
  await fill(host.querySelector("input")!, "")
  await act(async () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find((b) => b.textContent === "Apply")!
      .click()
  )
  expect(changed).not.toHaveBeenCalled()
  await act(async () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
      .find((b) => b.textContent === "Cancel")!
      .click()
  )
  expect(changed).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
  expect(filter.children[0]).toMatchObject({ value: "2026-11-16" })
})

it.each(["is-empty", "is-not-empty"] as const)(
  "does not add date inputs for %s",
  (operator) => {
    const host = mount(
      <EidosFileFieldFilterEditor
        field={field}
        value={{
          type: "group",
          conjunction: "and",
          children: [{ type: "rule", field: "day", operator }],
        }}
        onChange={() => {}}
        onClose={() => {}}
        onBack={() => {}}
      />
    )
    expect(host.querySelector(".rdp")).toBeNull()
    expect(host.querySelector("input")).toBeNull()
  }
)
