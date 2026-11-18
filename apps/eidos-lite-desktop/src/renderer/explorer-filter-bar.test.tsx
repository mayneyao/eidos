// @vitest-environment jsdom
import { act, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { ExplorerFilterBar } from "./explorer-filter-bar"
import { ExplorerLayoutSwitch } from "./explorer-layout-switch"
import type { ExplorerLayout } from "./explorer-layout"
import type { ExplorerFilterFieldsResult } from "../shared/explorer-calendar"
import { explorerBuiltinFields } from "./explorer-filter-adapter"
import {
  countExplorerFilterRules,
  matchesExplorerFileFilter,
  type ExplorerFileFilter,
} from "./explorer-file-filter"

vi.mock("./i18n", () => ({
  useEidosLiteI18n: () => ({ locale: "en", t: (text: string) => text }),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)
Element.prototype.scrollIntoView = vi.fn()
const originalApi = Object.getOwnPropertyDescriptor(window, "eidosLite")
afterEach(() => {
  if (originalApi) Object.defineProperty(window, "eidosLite", originalApi)
  else Reflect.deleteProperty(window, "eidosLite")
})

async function setup(
  initial: ExplorerFileFilter = [],
  metadata?: ExplorerFilterFieldsResult
) {
  const status = {
    ...explorerBuiltinFields((text) => text)[0]!,
    id: "status",
    name: "Status",
    type: "select" as const,
    property: {
      options: [
        { name: "Todo", color: "blue" },
        { name: "Done", color: "green" },
      ],
    },
  }
  Object.defineProperty(window, "eidosLite", {
    configurable: true,
    value: { getExplorerFilterFields: vi.fn(async () => metadata ?? [status]) },
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  let current = initial
  let ignored = true
  function Harness() {
    const [filter, setFilter] = useState(initial)
    const [open, setOpen] = useState(false)
    const [respectGitignore, setRespectGitignore] = useState(true)
    const [layout, setLayout] = useState<ExplorerLayout>("tree")
    const trigger = useRef<HTMLButtonElement>(null)
    return (
      <>
        <ExplorerLayoutSwitch value={layout} onChange={setLayout} />
        <button ref={trigger} onClick={() => setOpen(!open)}>
          Filter files
        </button>
        <ExplorerFilterBar
          filter={filter}
          triggerRef={trigger}
          open={open}
          onChange={(next) => {
            current = next
            setFilter(next)
          }}
          onClose={() => setOpen(false)}
          respectGitignore={respectGitignore}
          onRespectGitignoreChange={(next) => {
            ignored = next
            setRespectGitignore(next)
          }}
        />
      </>
    )
  }
  await act(async () => root.render(<Harness />))
  const click = async (label: string) => {
    const item = [
      ...document.querySelectorAll<HTMLElement>("button, [cmdk-item]"),
    ].find(
      (item) =>
        item.textContent?.trim() === label ||
        item.getAttribute("aria-label") === label
    )
    expect(item, label).toBeTruthy()
    await act(async () => item!.click())
  }
  const input = (label: string) =>
    document.querySelector<HTMLInputElement>(
      'input[aria-label="' + label + '"]'
    )!
  const select = async (label: string, option: string) => {
    await click(label)
    const item = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((item) => item.textContent?.trim() === option)
    expect(item, option).toBeTruthy()
    await act(async () => item!.click())
  }
  const type = async (element: HTMLInputElement, text: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(element, text)
      element.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  const escape = async () => {
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
  }
  return {
    host,
    click,
    input,
    select,
    type,
    escape,
    current: () => current,
    ignored: () => ignored,
    dispose: async () => {
      await act(async () => {
        root.unmount()
        // Radix restores focus from a task after unmount. Drain it while this
        // jsdom realm still owns Event, before Vitest tears the environment down.
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      host.remove()
    },
  }
}

it("uses the table date picker and relative windows in a Space without a catalog", async () => {
  const ui = await setup([], { fields: [] })
  try {
    await ui.click("Filter files")
    const fileProperties = document.querySelector("[cmdk-group]")!
    expect(fileProperties.textContent).toContain("Created time")
    expect(fileProperties.textContent).toContain("Modified time")
    expect(fileProperties.textContent).toContain("File size")
    await ui.click("Modified time")
    await ui.click("Choose date")
    expect(document.querySelector(".eidos-date-filter-calendar")).toBeTruthy()
    await ui.escape()
    await ui.select("Filter operator", "is between")
    await ui.click("Choose date")
    await ui.type(ui.input("Starting date"), "2026-11-01")
    expect(countExplorerFilterRules(ui.current())).toBe(0)
    await ui.type(ui.input("Ending date"), "2026-11-07")
    expect(ui.current()).toMatchObject({
      children: [
        {
          field: "file-system",
          value: {
            field: "explorer:modifiedAt",
            operator: "is-between",
            value: ["2026-11-01", "2026-11-07"],
          },
        },
      ],
    })
    await ui.escape()
    await ui.select("Filter operator", "Is relative to today")
    await ui.select("Period relation", "Past")
    expect(ui.current()).toMatchObject({
      children: [
        {
          field: "file-system",
          value: {
            field: "explorer:modifiedAt",
            operator: "is-in-calendar-window",
            value: { direction: "past", count: 1, unit: "day" },
          },
        },
      ],
    })
  } finally {
    await ui.dispose()
  }
})

it("keeps period-only extension dates gated to complete calendar periods", async () => {
  const due = {
    ...explorerBuiltinFields((text) => text).find(
      (field) => field.type === "date"
    )!,
    id: "due",
    name: "Due date",
  }
  const ui = await setup([], {
    fields: [due],
    queryCapabilities: {
      calendarQueryVersion: 2,
      calendarPeriodTimeZoneData: ["2026f"],
    },
  })
  try {
    await ui.click("Filter files")
    await ui.click("Due date")
    await ui.select("Filter operator", "Is relative to today")
    await ui.select("Period relation", "Last")
    expect(ui.current()).toMatchObject({
      children: [
        {
          field: "property",
          value: {
            field: "due",
            operator: "is-in-calendar-period",
            value: { offset: -1, unit: "day" },
          },
        },
      ],
    })
  } finally {
    await ui.dispose()
  }
})

it("compares sizes in bytes, retaining partial ranges until both limits are set", async () => {
  const ui = await setup([], { fields: [] })
  try {
    await ui.click("Filter files")
    await ui.click("File size")
    await ui.select("File size unit", "MB")
    await ui.type(ui.input("File size"), "1.5")
    expect(ui.current()).toMatchObject({
      children: [
        {
          field: "file-system",
          value: {
            field: "explorer:size",
            operator: "greater-than",
            value: 1_500_000,
          },
        },
      ],
    })
    await ui.escape()
    await ui.click("Filter files")
    expect(ui.input("File size").value).toBe("1.5")
    await ui.select("Filter operator", "is between")
    await ui.select("File size unit", "GB")
    await ui.type(ui.input("Minimum file size"), "2")
    expect(countExplorerFilterRules(ui.current())).toBe(0)
    await ui.type(ui.input("Maximum file size"), "4")
    expect(ui.current()).toMatchObject({
      children: [
        {
          value: {
            operator: "is-between",
            value: [2_000_000_000, 4_000_000_000],
          },
        },
      ],
    })
    await ui.type(ui.input("Maximum file size"), "1")
    expect(countExplorerFilterRules(ui.current())).toBe(0)
    expect(ui.input("Maximum file size").getAttribute("aria-invalid")).toBe(
      "true"
    )
  } finally {
    await ui.dispose()
  }
})

it("shares the ignore checkbox across layouts and keeps it separate from conditions", async () => {
  const ui = await setup([".md"])
  try {
    await ui.click("Filter files")
    const checkbox = () =>
      document.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(checkbox().checked).toBe(true)
    await act(async () => checkbox().click())
    expect(ui.ignored()).toBe(false)
    expect(ui.current()).toEqual([".md"])
    await ui.escape()
    await ui.click("Recent files")
    await ui.click("Filter files")
    expect(checkbox().checked).toBe(false)
    await ui.click("Clear")
    expect(ui.ignored()).toBe(false)
    expect(ui.current()).toEqual([])
    await act(async () => checkbox().click())
    await ui.escape()
    await ui.click("Folders")
    await ui.click("Filter files")
    expect(checkbox().checked).toBe(true)
  } finally {
    await ui.dispose()
  }
})

it("uses the shared searchable field picker and keeps conditions entirely in the popover", async () => {
  const ui = await setup()
  try {
    await ui.click("Filter files")
    expect(document.querySelector("[cmdk-input]")).toBeTruthy()
    expect(
      [...document.querySelectorAll("[cmdk-group-heading]")].map(
        (heading) => heading.textContent
      )
    ).toEqual(["File properties", "Extended properties"])
    await ui.click("File name")
    await ui.type(ui.input("Value"), "report")
    expect(matchesExplorerFileFilter("report.md", ui.current())).toBe(true)
    expect(matchesExplorerFileFilter("notes.md", ui.current())).toBe(false)
    expect(document.querySelector(".eidos-filter-rule")).toBeTruthy()
    expect(ui.host.querySelector(".eidos-filter-rule")).toBeNull()
    await ui.escape()
    expect(
      document.querySelector("[data-eidos-file-filter-popover]")
    ).toBeNull()
    expect(countExplorerFilterRules(ui.current())).toBe(1)
    expect(document.activeElement?.textContent).toBe("Filter files")
    await ui.click("Filter files")
    expect(ui.input("Value").value).toBe("report")
  } finally {
    await ui.dispose()
  }
})

it("supports arbitrary compound suffixes through the shared condition row", async () => {
  const ui = await setup([".md"])
  try {
    await ui.click("Filter files")
    await ui.click(".md")
    await ui.type(ui.input("Suffix values"), ".tar.gz,")
    expect(matchesExplorerFileFilter("archive.TAR.GZ", ui.current())).toBe(true)
    expect(matchesExplorerFileFilter("notes.csv", ui.current())).toBe(false)
    await ui.escape()
    await ui.click("Remove filter")
    expect(countExplorerFilterRules(ui.current())).toBe(0)
  } finally {
    await ui.dispose()
  }
})

it("uses the table's Select value control with catalog colors for custom properties", async () => {
  const ui = await setup()
  try {
    await ui.click("Filter files")
    await ui.type(
      document.querySelector<HTMLInputElement>("[cmdk-input]")!,
      "Status"
    )
    expect(document.querySelectorAll("[cmdk-item]")).toHaveLength(1)
    expect(
      document
        .querySelector("[cmdk-group][hidden]")
        ?.querySelector("[cmdk-group-heading]")?.textContent
    ).toBe("File properties")
    await ui.click("Status")
    await ui.click("Choose option")
    const done = [
      ...document.querySelectorAll<HTMLElement>("[cmdk-item]"),
    ].find((item) => item.textContent?.trim() === "Done")!
    expect(
      done.querySelector('[data-eidos-file-option-color="green"]')
    ).toBeTruthy()
    await act(async () => done.click())
    expect(ui.current()).toMatchObject({
      children: [
        {
          field: "property",
          value: { field: "status", operator: "equals", value: "Done" },
        },
      ],
    })
    await ui.click("Clear")
    expect(countExplorerFilterRules(ui.current())).toBe(0)
  } finally {
    await ui.dispose()
  }
})

it("does not apply partial IME composition", async () => {
  const ui = await setup()
  try {
    await ui.click("Filter files")
    await ui.click("File name")
    const value = ui.input("Value")
    await act(async () =>
      value.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true })
      )
    )
    await ui.type(value, "报告")
    expect(countExplorerFilterRules(ui.current())).toBe(0)
    await act(async () =>
      value.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true, data: "报告" })
      )
    )
    expect(matchesExplorerFileFilter("年度报告.md", ui.current())).toBe(true)
  } finally {
    await ui.dispose()
  }
})
