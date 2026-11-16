import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileTableSnapshot } from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "./context"
import { EidosFileFieldCreatePopover } from "./eidos-file-field-create-popover"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const table: EidosFileTableSnapshot = {
  table: {
    id: "records",
    name: "Records",
    rawTableName: "tb_records",
    position: 0,
    icon: null,
    description: null,
    createdAt: "2026-11-16T00:00:00Z",
    updatedAt: "2026-11-16T00:00:00Z",
  },
  fields: [],
  views: [],
  rowCount: 0,
}
const tables = [table]
let root: Root
let host: HTMLDivElement

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
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function mount(
  locale: "en" | "zh" = "en",
  create = vi.fn(async () => {})
) {
  function Form() {
    const [open, setOpen] = useState(true)
    return (
      <EidosFileUIProvider locale={locale}>
        <button data-reopen onClick={() => setOpen(true)}>
          Reopen
        </button>
        <EidosFileFieldCreatePopover
          open={open}
          onOpenChange={setOpen}
          table={table}
          tables={tables}
          onCreate={create}
        />
      </EidosFileUIProvider>
    )
  }
  await act(async () => root.render(<Form />))
  return create
}
const nameInput = () =>
  document.body.querySelector<HTMLInputElement>("form input")!
async function enterName(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(nameInput(), value)
    nameInput().dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function choose(type: string) {
  await act(async () =>
    document.body
      .querySelector<HTMLButtonElement>("[data-eidos-file-field-type-trigger]")!
      .click()
  )
  await act(async () =>
    document.body
      .querySelector<HTMLElement>(`[data-eidos-file-field-type="${type}"]`)!
      .click()
  )
}
async function submit() {
  await act(async () =>
    document.body
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  )
}

it.each([
  {
    locale: "en" as const,
    text: "Text",
    integer: "Integer",
    checkbox: "Checkbox",
  },
  { locale: "zh" as const, text: "文本", integer: "整数", checkbox: "复选框" },
])(
  "uses $locale type labels only after selection and follows untouched automatic names",
  async ({ locale, text, integer, checkbox }) => {
    const create = await mount(locale)
    expect(nameInput().value).toBe("")
    await choose("text")
    expect(nameInput().value).toBe(text)
    await choose("integer")
    expect(nameInput().value).toBe(integer)
    await choose("checkbox")
    expect(nameInput().value).toBe(checkbox)
    await submit()
    expect(create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: checkbox, type: "checkbox" })
    )
  }
)

it("preserves manual names, including a manual name equal to a type label", async () => {
  await mount()
  await choose("integer")
  expect(nameInput().value).toBe("Integer")
  await enterName("Number")
  await choose("date")
  expect(nameInput().value).toBe("Number")
  await enterName("我的日期")
  await choose("checkbox")
  expect(nameInput().value).toBe("我的日期")
})

it("regenerates cleared or whitespace names and resets naming ownership after cancel", async () => {
  const create = await mount()
  await enterName("   ")
  await choose("date")
  expect(nameInput().value).toBe("Date")
  await enterName("")
  await choose("checkbox")
  expect(nameInput().value).toBe("Checkbox")
  await act(async () =>
    Array.from(document.body.querySelectorAll("button"))
      .find((b) => b.textContent === "Cancel")!
      .click()
  )
  expect(create).not.toHaveBeenCalled()
  await act(async () =>
    host.querySelector<HTMLButtonElement>("[data-reopen]")!.click()
  )
  expect(nameInput().value).toBe("")
  await choose("text")
  expect(nameInput().value).toBe("Text")
})

it("retains the automatic draft on a rejected create and allows choosing another name", async () => {
  const create = vi
    .fn(async () => {})
    .mockRejectedValueOnce(new Error("A field named Number already exists"))
  await mount("en", create)
  await choose("number")
  await submit()
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "already exists"
  )
  expect(nameInput().value).toBe("Number")
  await choose("date")
  expect(nameInput().value).toBe("Date")
  await submit()
  expect(create).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: "Date", type: "date" })
  )
  expect(create).toHaveBeenCalledTimes(2)
})
