// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "./context"
import { EidosFileMobileCellEditor } from "./eidos-file-mobile-cell-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const field: EidosFileFieldInfo = {
  id: "option",
  tableId: "table",
  tableName: "tb_items",
  tableColumnName: "status",
  name: "Status",
  type: "select",
  property: { options: [{ name: "Open", color: "blue" }] },
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})
async function search(value: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>(
      ".eidos-mobile-option-search"
    )!
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function click(label: string) {
  const button = Array.from(
    document.querySelectorAll<HTMLButtonElement>("button")
  ).find(
    (item) =>
      item.getAttribute("aria-label") === label || item.textContent === label
  )!
  expect(button).toBeDefined()
  await act(async () => button.click())
}
async function renderField(
  type: EidosFileFieldInfo["type"],
  value: string | number | null,
  timeZone?: string
) {
  const save = vi.fn().mockResolvedValue(undefined)
  const close = vi.fn()
  await act(async () =>
    root.render(
      <EidosFileUIProvider interactionMode="mobile" timeZone={timeZone}>
        <EidosFileMobileCellEditor
          field={{ ...field, type }}
          row={{ _id: "row", status: value }}
          onSave={save}
          onClose={close}
        />
      </EidosFileUIProvider>
    )
  )
  return { save, close }
}
async function inputValue(label: string, value: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>(
      `input[aria-label="${label}"]`
    )!
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
it("opens the calendar directly and saves a selected day without a second picker", async () => {
  const { save, close } = await renderField("date", "2026-10-04")
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  expect(document.querySelector('input[type="date"]')).toBeNull()
  const day = Array.from(
    document.querySelectorAll<HTMLButtonElement>('button[name="day"]')
  ).find((button) => button.textContent === "5")!
  expect(day).toBeDefined()
  await act(async () => day.click())
  expect(save).not.toHaveBeenCalled()
  await click("Done")
  expect(save).toHaveBeenCalledWith("2026-10-05")
  expect(close).toHaveBeenCalledOnce()
})
it("validates dates, supports clearing, and retains failed saves for retry", async () => {
  const { save, close } = await renderField("date", "2026-10-04")
  await inputValue("Date", "2026-02-30")
  await click("Done")
  expect(save).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain("Enter a valid date.")
  await click("Clear")
  save.mockRejectedValueOnce(new Error("Offline write failed"))
  await click("Done")
  expect(close).not.toHaveBeenCalled()
  await click("Done")
  expect(save).toHaveBeenLastCalledWith(null)
  expect(close).toHaveBeenCalledOnce()
})
it("preserves timestamp precision if unchanged and rejects ambiguous local times", async () => {
  const { save, close } = await renderField(
    "datetime",
    "2026-10-04T12:30:45.123Z",
    "America/New_York"
  )
  await click("Done")
  expect(save).not.toHaveBeenCalled()
  close.mockClear()
  await inputValue("Date", "2026-11-01")
  await inputValue("Time", "01:30:00")
  await click("Done")
  expect(save).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
  await inputValue("Time", "03:30:00")
  await click("Done")
  expect(save).toHaveBeenCalledWith("2026-11-01T08:30:00.000Z")
})
it("shows checkbox states directly and cancels without writing", async () => {
  const { save, close } = await renderField("checkbox", 0)
  expect(document.querySelector('[role="combobox"]')).toBeNull()
  await click("Checked")
  await click("Cancel")
  expect(save).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
})
it("edits ratings through direct star choices", async () => {
  const { save } = await renderField("rating", 2)
  expect(document.querySelector("input")).toBeNull()
  await click("Rate 4")
  await click("Done")
  expect(save).toHaveBeenCalledWith(4)
})
it.each(["text", "number", "integer", "url"] as const)(
  "focuses the %s editor on opening",
  async (type) => {
    await renderField(type, null)
    expect(document.activeElement?.tagName).toBe(
      type === "text" ? "TEXTAREA" : "INPUT"
    )
  }
)
it("keeps a failed option creation retryable and does not save a nonexistent option", async () => {
  const create = vi
    .fn()
    .mockRejectedValueOnce(new Error("Schema write failed"))
    .mockResolvedValue(undefined)
  const save = vi.fn().mockResolvedValue(undefined)
  const close = vi.fn()
  await act(async () =>
    root.render(
      <EidosFileUIProvider interactionMode="mobile">
        <EidosFileMobileCellEditor
          field={field}
          row={{ _id: "row", status: "Open" }}
          onCreateOptions={create}
          onSave={save}
          onClose={close}
        />
      </EidosFileUIProvider>
    )
  )
  await search("New")
  await click('Create "New"')
  expect(document.body.textContent).toContain("Schema write failed")
  expect(save).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
  await click('Create "New"')
  await click("Done")
  expect(save).toHaveBeenCalledWith("New")
  expect(close).toHaveBeenCalledOnce()
})
it("rejects case-insensitive duplicate options and cancels a value change without saving", async () => {
  const create = vi.fn()
  const save = vi.fn()
  const close = vi.fn()
  await act(async () =>
    root.render(
      <EidosFileUIProvider interactionMode="mobile">
        <EidosFileMobileCellEditor
          field={field}
          row={{ _id: "row", status: null }}
          onCreateOptions={create}
          onSave={save}
          onClose={close}
        />
      </EidosFileUIProvider>
    )
  )
  await search(" open ")
  expect(document.body.textContent).not.toContain('Create "open"')
  await search("")
  await click("Open")
  await click("Cancel")
  expect(save).not.toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
})
it("keeps the draft open when saving fails and supports retry", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("Row write failed"))
    .mockResolvedValue(undefined)
  const close = vi.fn()
  await act(async () =>
    root.render(
      <EidosFileUIProvider interactionMode="mobile">
        <EidosFileMobileCellEditor
          field={field}
          row={{ _id: "row", status: null }}
          onSave={save}
          onClose={close}
        />
      </EidosFileUIProvider>
    )
  )
  await click("Open")
  await click("Done")
  expect(document.body.textContent).toContain("Row write failed")
  expect(close).not.toHaveBeenCalled()
  await click("Done")
  expect(save).toHaveBeenLastCalledWith("Open")
  expect(close).toHaveBeenCalledOnce()
})
