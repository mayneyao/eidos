// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileFieldInfo,
  EidosFileRow,
  EidosFileRowMutationResult,
} from "@eidos.space/eidos-file"
import { EidosFileRecordInspector } from "./eidos-file-record-inspector"

const field = (name: string): EidosFileFieldInfo => ({
  id: name,
  tableId: "continuity-test",
  tableName: "tb_test",
  name,
  tableColumnName: name,
  type: "text",
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  property: null,
  sourceTableColumnName: null,
  dependsOn: null,
})
const fields = [
  { ...field("Title"), isRecordLabel: true },
  field("Description"),
  field("Content"),
]
const row = {
  _id: "A",
  Title: "Title A",
  Description: "Details",
  Content: "# Body",
}
function type(input: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )!.set!.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}
describe("record continuity", () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })
  it("rejects an old save after A → B → A navigation", async () => {
    let finish!: (result: EidosFileRowMutationResult) => void
    const save = vi.fn(
      () =>
        new Promise<EidosFileRowMutationResult>((resolve) => {
          finish = resolve
        })
    )
    const render = (next: EidosFileRow) =>
      root.render(
        <EidosFileRecordInspector
          row={next}
          fields={fields}
          variant="page"
          contentField={fields[2]}
          onCellEdit={save}
        />
      )
    await act(async () => render(row))
    const title = container.querySelector<HTMLTextAreaElement>(
      '[aria-label="Title"]'
    )!
    await act(async () => type(title, "Old save"))
    await act(async () =>
      title.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    )
    await act(async () => render({ ...row, _id: "B", Title: "Title B" }))
    await act(async () => render({ ...row, Title: "New session A" }))
    await act(async () =>
      finish({
        tableId: "continuity-test",
        row: { ...row, Title: "Old save" },
        rowCount: 1,
      })
    )
    expect(title.value).toBe("New session A")
  })
  it.each(["page", "panel"] as const)(
    "keeps %s edits optimistic without a saving indicator",
    async (variant) => {
      let finish!: (result: EidosFileRowMutationResult) => void
      const save = vi.fn(
        () =>
          new Promise<EidosFileRowMutationResult>((resolve) => {
            finish = resolve
          })
      )
      await act(async () =>
        root.render(
          <EidosFileRecordInspector
            row={row}
            fields={fields}
            variant={variant}
            contentField={fields[2]}
            onCellEdit={save}
          />
        )
      )
      const title = container.querySelector<HTMLTextAreaElement>(
        '[aria-label="Title"]'
      )!
      const body = container.querySelector("[data-eidos-file-record-content]")
      await act(async () => {
        type(title, "Saved title")
      })
      await act(async () =>
        title.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
      )
      expect(save).toHaveBeenCalledOnce()
      expect(title.value).toBe("Saved title")
      expect(title.disabled).toBe(false)
      expect(title.readOnly).toBe(true)
      expect(container.querySelector("header")?.textContent).not.toContain(
        "Saving"
      )
      expect(container.querySelector('header [role="status"]')).toBeNull()
      expect(container.querySelector("header .animate-spin")).toBeNull()
      expect(container.querySelector("[data-eidos-file-record-content]")).toBe(
        body
      )
      await act(async () =>
        finish({
          tableId: "continuity-test",
          row: { ...row, Title: "Saved title" },
          rowCount: 1,
        })
      )
      expect(title.value).toBe("Saved title")
      expect(title.readOnly).toBe(false)
      expect(container.querySelector('[role="alert"]')).toBeNull()
    }
  )
  it("keeps collapsed properties mounted and remembers the choice across rows", async () => {
    const render = (next: EidosFileRow) =>
      root.render(
        <EidosFileRecordInspector
          row={next}
          fields={fields}
          variant="panel"
          contentField={fields[2]}
          onCellEdit={vi.fn()}
        />
      )
    await act(async () => render(row))
    const input = container.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Title"]'
    )!
    await act(async () => type(input, "Unsubmitted draft"))
    const disclosure = container.querySelector<HTMLButtonElement>(
      "[data-eidos-file-record-properties-toggle]"
    )
    expect(disclosure).not.toBeNull()
    await act(async () => disclosure!.click())
    expect(disclosure!.getAttribute("aria-expanded")).toBe("false")
    expect(container.querySelector('textarea[aria-label="Title"]')).toBe(input)
    expect(input.value).toBe("Unsubmitted draft")
    await act(async () => render({ ...row, _id: "B", Title: "Title B" }))
    expect(disclosure!.getAttribute("aria-expanded")).toBe("false")
    await act(async () => disclosure!.click())
    expect(input.value).toBe("Title B")
  })
})
