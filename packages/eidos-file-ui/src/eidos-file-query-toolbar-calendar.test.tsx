import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type {
  EidosFileFieldInfo,
  EidosFileFilterGroup,
  EidosFileFilterRule,
} from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "./context"
import { EidosFileQueryToolbar } from "./eidos-file-query-toolbar"
import { translateEidosFileUI, type EidosFileUILocale } from "./i18n"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const fields: EidosFileFieldInfo[] = (
  ["date", "datetime", "text"] as const
).map((type, index) => ({
  id: `field-${index}`,
  tableId: "records",
  tableName: "Records",
  tableColumnName: `field-${index}`,
  name: ["日期", "时间", "Title"][index]!,
  type,
  isRecordLabel: type === "text",
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}))
const rule = (
  operator: EidosFileFilterRule["operator"],
  value?: EidosFileFilterRule["value"]
): EidosFileFilterRule => ({
  type: "rule",
  field: fields[0]!.id,
  operator,
  ...(value === undefined ? {} : { value }),
})
const group = (...children: EidosFileFilterRule[]): EidosFileFilterGroup => ({
  type: "group",
  conjunction: "and",
  children,
})
const calendar = { unit: "day" as const, offset: 0 as const }

describe("calendar filter feedback", () => {
  let root: Root
  let container: HTMLDivElement
  const change = vi.fn()
  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    change.mockReset()
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
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  async function mount(
    filter: EidosFileFilterGroup,
    timeZone?: string,
    locale: EidosFileUILocale = "en",
    supported = ["2026f"]
  ) {
    await act(async () =>
      root.render(
        <EidosFileUIProvider
          locale={locale}
          timeZone={timeZone}
          calendarPeriodTimeZoneData={supported}
        >
          <EidosFileQueryToolbar
            fields={fields}
            filter={filter}
            sorts={[]}
            search=""
            onSearchChange={() => {}}
            onFilterChange={change}
            onSortsChange={() => {}}
          />
        </EidosFileUIProvider>
      )
    )
    await click(
      document.querySelector(
        `button[aria-label="${translateEidosFileUI(locale, "Filter Eidos File rows")}"]`
      )
    )
  }
  async function click(element: Element | null | undefined) {
    expect(element).toBeTruthy()
    await act(async () => {
      ;(element as HTMLElement).click()
    })
  }
  async function select(label: string, option: string) {
    await click(document.querySelector(`button[aria-label="${label}"]`))
    await click(
      [...document.querySelectorAll('[role="option"]')].find(
        (element) => element.textContent?.trim() === option
      )
    )
  }
  async function apply(locale: EidosFileUILocale = "en") {
    await click(
      [...document.querySelectorAll("button")].find(
        (element) =>
          element.textContent?.trim() === translateEidosFileUI(locale, "Apply")
      )
    )
  }
  function assertSingleModel() {
    expect(document.querySelectorAll("select")).toHaveLength(0)
    expect(document.body.textContent).not.toMatch(
      /Calendar rules|2026f|UTC|Date range|日历日|日期范围/
    )
    expect(
      document.querySelector("[data-eidos-file-calendar-time-zone]")
    ).toBeNull()
    expect(
      document.querySelector("[data-eidos-file-date-range-help]")
    ).toBeNull()
  }
  it("creates only a period, without persisting the configured or browser zone", async () => {
    const options = new Intl.DateTimeFormat().resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...options,
      timeZone: "Pacific/Honolulu",
    })
    await mount(group(rule("is-empty")), "America/New_York")
    await select("Filter operator", "Relative date")
    assertSingleModel()
    await apply()
    expect(change).toHaveBeenCalledWith(
      group(rule("is-in-calendar-period", calendar))
    )
  })
  it.each([undefined, "system"])(
    "does not freeze resolved system preference %s in a condition",
    async (timeZone) => {
      await mount(group(rule("is-empty")), timeZone)
      await select("Filter operator", "Relative date")
      await apply()
      expect(change).toHaveBeenCalledWith(
        group(rule("is-in-calendar-period", calendar))
      )
    }
  )
  it("keeps period semantics during an unrelated Apply without a second time-zone authority", async () => {
    const title: EidosFileFilterRule = {
      type: "rule",
      field: fields[2]!.id,
      operator: "contains",
      value: "old",
    }
    await mount(
      group(rule("is-in-calendar-period", calendar), title),
      "America/New_York"
    )
    assertSingleModel()
    const input = document.querySelector<HTMLInputElement>(
      'input[placeholder="Value"]'
    )!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(input, "updated")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await apply()
    expect(change).toHaveBeenCalledWith(
      group(rule("is-in-calendar-period", calendar), {
        ...title,
        value: "updated",
      })
    )
  })
  it("persists a complete next week instead of a rolling duration", async () => {
    await mount(
      group(rule("is-in-calendar-period", calendar)),
      "America/New_York"
    )
    await select("Relative date", "Next week")
    await apply()
    expect(change).toHaveBeenCalledWith(
      group(rule("is-in-calendar-period", { unit: "week", offset: 1 }))
    )
  })
  it.each(["en", "zh"] as const)(
    "offers the same twelve calendar periods in %s",
    async (locale) => {
      const t = (message: string) => translateEidosFileUI(locale, message)
      await mount(
        group(rule("is-in-calendar-period", calendar)),
        "America/New_York",
        locale
      )
      assertSingleModel()
      await click(
        document.querySelector(`button[aria-label="${t("Relative date")}"]`)
      )
      expect(document.querySelectorAll('[role="option"]')).toHaveLength(12)
      for (const label of [
        "Yesterday",
        "Today",
        "Tomorrow",
        "Last week",
        "This week",
        "Next week",
        "Last month",
        "This month",
        "Next month",
        "Last year",
        "This year",
        "Next year",
      ])
        expect(
          [...document.querySelectorAll('[role="option"]')].map((node) =>
            node.textContent?.trim()
          )
        ).toContain(t(label))
      expect(document.body.textContent).not.toMatch(
        /UTC|24 hours|7 days|24 小时|7 天/
      )
      await click(
        [...document.querySelectorAll('[role="option"]')].find(
          (node) => node.textContent?.trim() === t("Last year")
        )
      )
      await apply(locale)
      expect(change).toHaveBeenCalledWith(
        group(rule("is-in-calendar-period", { unit: "year", offset: -1 }))
      )
    }
  )
  it("does not offer new calendar conditions to an unadvertised Runtime", async () => {
    await mount(group(rule("is-empty")), "America/New_York", "en", [])
    await click(document.querySelector('button[aria-label="Filter operator"]'))
    expect(
      [...document.querySelectorAll('[role="option"]')].some(
        (option) => option.textContent?.trim() === "Relative date"
      )
    ).toBe(false)
  })
})
