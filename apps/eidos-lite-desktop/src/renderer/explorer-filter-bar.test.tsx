// @vitest-environment jsdom
import { act, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { ExplorerFilterBar } from "./explorer-filter-bar"
import { ExplorerLayoutSwitch } from "./explorer-layout-switch"
import type { ExplorerLayout } from "./explorer-layout"
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

async function setup(initial: ExplorerFileFilter = []) {
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
    value: { getExplorerFilterFields: vi.fn(async () => [status]) },
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
