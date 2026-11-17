// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { Runtime, type EidosFileSnapshot } from "@eidos.space/eidos-file"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"
import { EidosFileUIProvider } from "./context"
import {
  EidosFileEditorView,
  type EidosFileViewRendererProps,
} from "./eidos-file-editor-view"
import { EidosFileRecordInspector } from "./eidos-file-record-inspector"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
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
afterEach(() => {
  document.body.innerHTML = ""
})
const click = async (node: Element | null) => {
  expect(node).not.toBeNull()
  await act(async () => (node as HTMLElement).click())
}
const byLabel = (label: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll("button,input")].find(
    (node) => node.getAttribute("aria-label") === label
  ) ?? null
const input = async (node: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(node, value)
    node.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

it("manages canonical fields inside a record and keeps personal visibility separate from saved Views", async () => {
  // Node's experimental global Web Storage can shadow jsdom's Storage in Vitest.
  const storage = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  const port = await createTestWasmConnection()
  const { service } = await Runtime.create(
    port,
    {
      clock: {
        nowInstant: () => "2026-11-17T00:00:00.000Z",
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (n) => crypto.getRandomValues(new Uint8Array(n)),
      },
    },
    { title: "Record fixture" },
    {
      cancellation: { cancelled: () => false, onCancel: () => () => undefined },
    }
  )
  const source = new EidosRuntimeEditorDataSource(
    service,
    "/fixture/record-management.eidos"
  )
  await source.initialize()
  let original = await source.createTable({
    name: "Tasks",
    fields: [
      { name: "Title", type: "text" },
      { name: "Status", type: "text" },
      { name: "Record ID", type: "text" },
    ],
  })
  const table = original.tables[0]!
  const title = table.fields.find((field) => field.name === "Title")!
  const row = (
    await source.insertRow(table.table.id, { [title.id]: "Record A" })
  ).row
  const beforeViews = JSON.stringify(table.views)
  original = await source.createTable({
    name: "Other table",
    fields: [{ name: "Name", type: "text" }],
  })
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  let setScope!: (scope: string) => void
  let setVariant!: (variant: "page" | "panel") => void
  let setTableIndex!: (index: number) => void
  const savedScope = `canonical-test-${crypto.randomUUID()}`
  let acceptedSnapshot = original
  const renderers = {
    grid: (props: EidosFileViewRendererProps) => (
      <EidosFileRecordInspector
        row={row}
        fields={props.table.fields}
        variant={props.recordPresentation}
      />
    ),
  }
  function Fixture() {
    const [snapshot, setSnapshot] = useState<EidosFileSnapshot>(original)
    const [scope, changeScope] = useState(savedScope)
    const [variant, changeVariant] = useState<"page" | "panel">("page")
    const [tableIndex, changeTableIndex] = useState(0)
    setScope = changeScope
    setVariant = changeVariant
    setTableIndex = changeTableIndex
    const current = snapshot.tables[tableIndex]!
    return (
      <EidosFileUIProvider recordPropertyScope={scope}>
        <EidosFileEditorView
          source={source}
          table={current}
          tables={snapshot.tables}
          onSnapshot={(next) => {
            acceptedSnapshot = next
            setSnapshot(next)
          }}
          disabled={false}
          recordPresentation={variant}
          renderers={renderers}
        />
      </EidosFileUIProvider>
    )
  }
  try {
    await act(async () => root.render(<Fixture />))
    expect(
      container.querySelectorAll("[data-eidos-record-system-role]")
    ).toHaveLength(3)
    await click(byLabel("Manage record properties"))
    const dialog = () => document.querySelector('[role="dialog"]')!
    await click(byLabel("Edit Status properties", dialog()))
    const name = dialog().querySelector<HTMLInputElement>("input[id]")!
    await input(name, "Stage")
    await act(async () =>
      name.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    )
    await vi.waitFor(() =>
      expect(
        acceptedSnapshot.tables[0]!.fields.some(
          (field) => field.name === "Stage"
        )
      ).toBe(true)
    )
    expect(
      (await source.getSnapshot()).tables[0]!.fields.some(
        (field) => field.name === "Stage"
      )
    ).toBe(true)
    await click(byLabel("Close field properties", dialog()))
    const hide = dialog().querySelector('input[type="checkbox"]')!
    expect((hide as HTMLInputElement).disabled).toBe(false)
    await click(hide)
    expect(
      dialog().querySelector('[role="alert"]')?.textContent
    ).toBeUndefined()
    expect((hide as HTMLInputElement).checked).toBe(true)
    expect(
      container.querySelectorAll("[data-eidos-record-system-role]")
    ).toHaveLength(0)
    expect(container.textContent).toContain("Record ID") // ordinary homonym remains
    expect(container.textContent).toContain("Properties (2)")
    await click(byLabel("Show Stage", dialog()))
    expect(container.textContent).not.toContain("Stage")
    expect(JSON.stringify((await source.getSnapshot()).tables[0]!.views)).toBe(
      beforeViews
    )
    const newField = [...dialog().querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === "New field"
    )!
    await click(newField)
    const createName = dialog().querySelector<HTMLInputElement>("input[id]")!
    await input(createName, "Priority")
    await act(async () =>
      dialog()
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    )
    await vi.waitFor(() =>
      expect(
        acceptedSnapshot.tables[0]!.fields.some(
          (field) => field.name === "Priority"
        )
      ).toBe(true)
    )
    expect(
      (await source.getSnapshot()).tables[0]!.fields.some(
        (field) => field.name === "Priority"
      )
    ).toBe(true)
    await act(async () => setVariant("panel"))
    expect(
      container.querySelectorAll("[data-eidos-record-system-role]")
    ).toHaveLength(0)
    await act(async () => setScope(`other-file-${crypto.randomUUID()}`))
    expect(
      container.querySelectorAll("[data-eidos-record-system-role]")
    ).toHaveLength(3)
    await act(async () => setScope(savedScope))
    expect(
      container.querySelectorAll("[data-eidos-record-system-role]")
    ).toHaveLength(0)
    await act(async () => setTableIndex(1))
    expect(
      container.querySelectorAll("[data-eidos-record-system-role]")
    ).toHaveLength(3)
    await act(async () => setTableIndex(0))
    expect(
      container.querySelectorAll("[data-eidos-record-system-role]")
    ).toHaveLength(0)
    const current = await source.getRow!(table.table.id, String(row._id))
    expect(current?.[title.id]).toBe("Record A")
  } finally {
    act(() => root.unmount())
    container.remove()
    port.close()
  }
})
