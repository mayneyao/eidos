// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  UpdateEidosFileFieldInput,
} from "@eidos.space/eidos-file"
import {
  decodeEidosFileValues,
  encodeEidosFileAttachmentPaths,
  type FileEntry,
} from "@eidos.space/eidos-file"
import { EidosFileRecordPropertyEditor } from "./eidos-file-record-property-editor"
import { EidosFileUIProvider } from "./context"

const field = (type: EidosFileFieldInfo["type"]): EidosFileFieldInfo => ({
  id: "value",
  tableId: "property-tests",
  tableName: "tb_test",
  tableColumnName: "value",
  name: "Value",
  type,
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
})
function inputValue(
  input: HTMLTextAreaElement | HTMLInputElement,
  value: string
) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}
describe("record property type editing", () => {
  let root: Root, host: HTMLDivElement
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    HTMLElement.prototype.scrollIntoView = vi.fn()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })
  it("edits text inline, retaining an active draft across a row refresh and IME Enter", async () => {
    const save = vi.fn(async () => {})
    const render = (row: EidosFileRow) =>
      root.render(
        <EidosFileUIProvider>
          <EidosFileRecordPropertyEditor
            field={field("text")}
            row={row}
            disabled={false}
            onChange={save}
          />
        </EidosFileUIProvider>
      )
    await act(async () => render({ _id: "A", value: "Initial" }))
    const input = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Value"]'
    )!
    await act(async () => input.focus())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => inputValue(input, "中文 draft"))
    await act(async () => render({ _id: "A", value: "External value" }))
    expect(host.querySelector("textarea")).toBe(input)
    expect(input.value).toBe("中文 draft")
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
        })
      )
    )
    expect(save).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    )
    expect(save).toHaveBeenCalledExactlyOnceWith("中文 draft")
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it.each([null, ""])(
    "preserves %j when opening and closing without changing text",
    async (value) => {
      const save = vi.fn(async () => {})
      await act(async () =>
        root.render(
          <EidosFileRecordPropertyEditor
            field={field("text")}
            row={{ _id: "A", value }}
            disabled={false}
            onChange={save}
          />
        )
      )
      const input = host.querySelector<HTMLTextAreaElement>("textarea")!
      await act(async () => input.focus())
      await act(async () =>
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        )
      )
      expect(save).not.toHaveBeenCalled()
    }
  )
  it("sets and clears ratings directly in the row, including keyboard navigation", async () => {
    const save = vi.fn(async () => {})
    const render = (value: number | null, readOnly = false) =>
      root.render(
        <EidosFileRecordPropertyEditor
          field={field("rating")}
          row={{ _id: "A", value }}
          disabled={false}
          readOnly={readOnly}
          onChange={save}
        />
      )
    await act(async () => render(null))
    const star = (rating: number) =>
      host.querySelector<HTMLButtonElement>(`[aria-label="Rate ${rating}"]`)!
    await act(async () => star(3).click())
    expect(save).toHaveBeenLastCalledWith(3)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => render(3))
    await act(async () => {
      star(3).focus()
      star(3).dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          cancelable: true,
        })
      )
    })
    expect(document.activeElement).toBe(star(4))
    expect(save).toHaveBeenLastCalledWith(4)
    await act(async () => render(4))
    await act(async () => star(4).click())
    expect(save).toHaveBeenLastCalledWith(null)
    await act(async () => render(4, true))
    await act(async () => star(2).click())
    expect(save).toHaveBeenCalledTimes(3)
  })
  it("toggles a historical nullable checkbox and exposes its inline clear action", async () => {
    const save = vi.fn(async () => {})
    const render = (value: boolean | null) =>
      root.render(
        <EidosFileRecordPropertyEditor
          field={{ ...field("checkbox"), nullable: true }}
          row={{ _id: "A", value }}
          disabled={false}
          onChange={save}
        />
      )
    await act(async () => render(null))
    const check = host.querySelector<HTMLButtonElement>('[role="checkbox"]')!
    expect(check.getAttribute("aria-checked")).toBe("mixed")
    await act(async () => check.click())
    expect(save).toHaveBeenLastCalledWith(1)
    await act(async () => render(true))
    expect(check.getAttribute("aria-checked")).toBe("true")
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Clear Value"]')!
        .click()
    )
    expect(save).toHaveBeenLastCalledWith(null)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it.each(["select", "multi-select"] as const)(
    "guards creation inside an already-open shared %s editor without losing its query",
    async (type) => {
      const create = vi.fn(
        async (
          _field: EidosFileFieldInfo,
          _changes: UpdateEidosFileFieldInput
        ) => {}
      )
      const save = vi.fn(async () => {})
      const optionField = {
        ...field(type),
        property: {
          options: [
            { name: "Todo", color: "blue", description: "retained metadata" },
          ],
        },
      }
      const render = (readOnly: boolean) =>
        root.render(
          <EidosFileRecordPropertyEditor
            field={optionField}
            row={{ _id: "A", value: null }}
            disabled={false}
            readOnly={readOnly}
            onFieldUpdate={create}
            onChange={save}
          />
        )
      await act(async () => render(false))
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[aria-label="Value"]')!.click()
      )
      const input = document.querySelector<HTMLInputElement>("[cmdk-input]")!
      await act(async () => {
        input.focus()
        inputValue(input, "New")
      })
      await act(async () => render(true))
      const option = Array.from(
        document.querySelectorAll<HTMLElement>("[cmdk-item]")
      ).find((element) => element.textContent?.includes("Create"))!
      expect(option).not.toBeNull()
      await act(async () => option.click())
      expect(create).not.toHaveBeenCalled()
      expect(save).not.toHaveBeenCalled()
      expect(input.value).toBe("New")
      expect(document.activeElement).toBe(input)
      await act(async () => render(false))
      await act(async () => option.click())
      expect(create).toHaveBeenCalledOnce()
      expect(create.mock.calls[0]?.[1]).toMatchObject({
        property: {
          options: expect.arrayContaining([
            expect.objectContaining({
              name: "Todo",
              description: "retained metadata",
            }),
            expect.objectContaining({ name: "New" }),
          ]),
        },
      })
    }
  )
  it("uses Grid's date picker and configured timezone for Datetime", async () => {
    const save = vi.fn(async () => {})
    await act(async () =>
      root.render(
        <EidosFileUIProvider timeZone="Asia/Shanghai">
          <EidosFileRecordPropertyEditor
            field={field("datetime")}
            row={{ _id: "A", value: "2026-11-16T02:50:12.345Z" }}
            disabled={false}
            onChange={save}
          />
        </EidosFileUIProvider>
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Value"]')!.click()
    )
    const input = document.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]'
    )!
    expect(input.value).toBe("2026-11-16T10:50")
    expect(
      document.querySelector("[data-eidos-file-grid-editor-surface]")
    ).not.toBeNull()
    await act(async () => inputValue(input, "2026-11-17T11:15"))
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    )
    expect(save).toHaveBeenCalledExactlyOnceWith("2026-11-17T03:15:00.000Z")
  })
  it("commits the date picker's local draft on Tab before moving to the next record property", async () => {
    const save = vi.fn(async () => {})
    await act(async () =>
      root.render(
        <div data-eidos-file-detail-panel="record">
          <EidosFileRecordPropertyEditor
            field={field("date")}
            row={{ _id: "A", value: "2026-11-16" }}
            disabled={false}
            onChange={save}
          />
          <button data-next="">Next property</button>
        </div>
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Value"]')!.click()
    )
    const input =
      document.querySelector<HTMLInputElement>('input[type="date"]')!
    await act(async () => inputValue(input, "2026-12-04"))
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
      )
    )
    expect(save).toHaveBeenCalledExactlyOnceWith("2026-12-04")
    expect(document.activeElement).toBe(host.querySelector("[data-next]"))
  })
  it("cancels Int64 changes and commits exact decimal input through the shared Grid adapter", async () => {
    const save = vi.fn(async () => {})
    await act(async () =>
      root.render(
        <EidosFileRecordPropertyEditor
          field={field("integer")}
          row={{ _id: "A", value: 9223372036854775807n }}
          disabled={false}
          onChange={save}
        />
      )
    )
    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="Value"]'
    )!
    await act(async () => input.focus())
    expect(input.value).toBe("9223372036854775807")
    await act(async () => inputValue(input, "-9223372036854775808"))
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
    expect(save).not.toHaveBeenCalled()
    expect(input.value).toBe("9223372036854775807")
    await act(async () => input.focus())
    await act(async () => inputValue(input, "-9223372036854775808"))
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    )
    expect(save).toHaveBeenCalledExactlyOnceWith(-9223372036854775808n)
  })
  it("does not apply a late File import to a newer record editor session", async () => {
    let resolveImport!: (entries: FileEntry[]) => void
    const acquire = vi.fn(
      () =>
        new Promise<FileEntry[]>((resolve) => {
          resolveImport = resolve
        })
    )
    const save = vi.fn(async () => {})
    const render = (id: string) =>
      root.render(
        <EidosFileRecordPropertyEditor
          field={field("file")}
          row={{ _id: id, value: null }}
          disabled={false}
          onChange={save}
          onImportFiles={acquire}
        />
      )
    await act(async () => render("A"))
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Value"]')!.click()
    )
    await act(async () =>
      Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
      )
        .find((button) => button.textContent === "Add files")!
        .click()
    )
    expect(acquire).toHaveBeenCalledOnce()
    await act(async () => render("B"))
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Value"]')!.click()
    )
    await act(async () =>
      resolveImport(
        decodeEidosFileValues(
          encodeEidosFileAttachmentPaths(["assets/old-session.txt"])
        )
      )
    )
    expect(save).not.toHaveBeenCalled()
    expect(
      document.querySelector('[role="dialog"]')!.textContent
    ).not.toContain("old-session.txt")
  })
})
