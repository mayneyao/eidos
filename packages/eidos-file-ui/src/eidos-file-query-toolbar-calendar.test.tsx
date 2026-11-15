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
const calendar = {
  day: "today" as const,
  timeZone: "Europe/Berlin",
  timeZoneData: "2026f",
}

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
          calendarDayTimeZoneData={supported}
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
  function assertReadOnlyZone(zone: string) {
    expect(
      document.querySelector("[data-eidos-file-calendar-time-zone]")
        ?.textContent
    ).toContain(zone)
    expect(
      document.querySelector('select[aria-label="Calendar time zone"]')
    ).toBeNull()
    expect(document.querySelectorAll("select")).toHaveLength(0)
    expect(document.body.textContent).not.toMatch(
      /Calendar rules|2026f|Use it for this condition/
    )
  }
  it("creates from the configured zone when the browser uses a different zone", async () => {
    const options = new Intl.DateTimeFormat().resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...options,
      timeZone: "Pacific/Honolulu",
    })
    await mount(group(rule("is-empty")), "America/New_York")
    await select("Filter operator", "Calendar day")
    assertReadOnlyZone("America/New_York")
    await apply()
    expect(change).toHaveBeenCalledWith(
      group(
        rule("is-on-calendar-day", {
          ...calendar,
          timeZone: "America/New_York",
        })
      )
    )
  })
  it.each([undefined, "system"])(
    "resolves the system preference %s to a saved IANA zone",
    async (timeZone) => {
      const options = new Intl.DateTimeFormat().resolvedOptions()
      vi.spyOn(
        Intl.DateTimeFormat.prototype,
        "resolvedOptions"
      ).mockReturnValue({ ...options, timeZone: "Pacific/Honolulu" })
      await mount(group(rule("is-empty")), timeZone)
      await select("Filter operator", "Calendar day")
      assertReadOnlyZone("Pacific/Honolulu")
      await apply()
      expect(change.mock.calls[0]?.[0]).toEqual(
        group(
          rule("is-on-calendar-day", {
            ...calendar,
            timeZone: "Pacific/Honolulu",
          })
        )
      )
    }
  )
  it("preserves an existing zone on open and an unrelated Apply", async () => {
    const title: EidosFileFilterRule = {
      type: "rule",
      field: fields[2]!.id,
      operator: "contains",
      value: "old",
    }
    const original = group(rule("is-on-calendar-day", calendar), title)
    await mount(original, "America/New_York")
    assertReadOnlyZone("Europe/Berlin")
    expect(change).not.toHaveBeenCalled()
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
      group(rule("is-on-calendar-day", calendar), {
        ...title,
        value: "updated",
      })
    )
    expect(original.children[0]).toEqual(rule("is-on-calendar-day", calendar))
  })
  it("keeps the saved zone when changing only the calendar day", async () => {
    await mount(group(rule("is-on-calendar-day", calendar)), "America/New_York")
    await select("Calendar day", "Tomorrow")
    assertReadOnlyZone("Europe/Berlin")
    await apply()
    expect(change).toHaveBeenCalledWith(
      group(rule("is-on-calendar-day", { ...calendar, day: "tomorrow" }))
    )
  })
  it.each(["en", "zh"] as const)(
    "keeps UTC and rolling units clear in %s with help only on demand",
    async (locale) => {
      const original = group(
        rule("is-relative-to-today", { direction: "past", unit: "week" })
      )
      const t = (message: string) => translateEidosFileUI(locale, message)
      await mount(original, "America/New_York", locale)
      expect(document.body.textContent).toContain(t("Date range (UTC)"))
      expect(document.body.textContent).toContain(t("7 days"))
      expect(document.body.textContent).not.toContain(
        "inclusive rolling windows"
      )
      expect(
        document.querySelector("[data-eidos-file-date-range-help]")
      ).toBeNull()
      await click(
        document.querySelector(`button[aria-label="${t("About date ranges")}"]`)
      )
      expect(
        document.querySelector("[data-eidos-file-date-range-help]")?.textContent
      ).toBe(
        t("Measured from now. Dates without a time include both end dates.")
      )
      await act(async () =>
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
        )
      )
      await apply(locale)
      expect(change).toHaveBeenCalledWith(original)
    }
  )
  it("keeps calendar creation unavailable when the Runtime does not advertise support", async () => {
    await mount(group(rule("is-empty")), "America/New_York", "en", [])
    await click(document.querySelector('button[aria-label="Filter operator"]'))
    expect(
      [...document.querySelectorAll('[role="option"]')].some(
        (option) => option.textContent?.trim() === "Calendar day"
      )
    ).toBe(false)
  })
})
