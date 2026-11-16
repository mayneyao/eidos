// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { EidosFileRecordFieldEditor } from "./eidos-file-record-field-editor"
import { EidosFileRecordAttachmentEditor } from "./eidos-file-record-attachment-editor"

const field: EidosFileFieldInfo = {
  id: "options",
  tableId: "lock-test",
  name: "Tags",
  tableName: "tb_test",
  tableColumnName: "tags",
  type: "multi-select",
  valueKind: "source",
  storageCodec: "json_array",
  isDerived: false,
  isHidden: false,
  property: { options: [{ name: "Existing", color: "blue" }] },
  sourceTableColumnName: null,
  dependsOn: null,
}
describe("record mutation lock", () => {
  let root: Root
  let host: HTMLDivElement
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })
  it.each(["select", "multi-select"] as const)(
    "blocks creation in an already open %s portal through saving/failure, then unlocks",
    async (type) => {
      const create = vi.fn(async () => {})
      const change = vi.fn(async () => {})
      const render = (readOnly: boolean) =>
        root.render(
          <EidosFileRecordFieldEditor
            field={{ ...field, type }}
            row={{ _id: "A", tags: null }}
            disabled={false}
            readOnly={readOnly}
            onChange={change}
            onCreateOption={create}
          />
        )
      await act(async () => render(false))
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[aria-label="Tags"]')!.click()
      )
      const input = document.querySelector<HTMLInputElement>(
        '[aria-label="Search or create an option…"]'
      )!
      await act(async () => {
        input.focus()
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(input, "New option")
        input.dispatchEvent(new Event("input", { bubbles: true }))
      })
      for (const _phase of ["saving", "failed"]) {
        await act(async () => render(true))
        expect(document.activeElement).toBe(input)
        expect(input.disabled).toBe(false)
        expect(input.readOnly).toBe(true)
        expect(input.value).toBe("New option")
        await act(async () =>
          input.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
          )
        )
        expect(create).not.toHaveBeenCalled()
        await act(async () =>
          Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
            .find((b) => b.textContent?.includes("Create option:"))!
            .click()
        )
        expect(create).not.toHaveBeenCalled()
        expect(change).not.toHaveBeenCalled()
      }
      await act(async () => render(false))
      await act(async () =>
        input.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        )
      )
      expect(create).toHaveBeenCalledExactlyOnceWith("New option")
    }
  )
  it("keeps attachment actions bright while blocking import before acquisition", async () => {
    const acquire = vi.fn(async () => [])
    const change = vi.fn(async () => {})
    const render = (readOnly: boolean) =>
      root.render(
        <EidosFileRecordAttachmentEditor
          value={null}
          disabled={false}
          readOnly={readOnly}
          onChange={change}
          onImportFiles={acquire}
        />
      )
    await act(async () => render(true))
    const add = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Add files"
    )!
    expect(add.disabled).toBe(false)
    await act(async () => add.click())
    expect(acquire).not.toHaveBeenCalled()
    await act(async () => render(false))
    await act(async () => add.click())
    expect(acquire).toHaveBeenCalledOnce()
  })
})
