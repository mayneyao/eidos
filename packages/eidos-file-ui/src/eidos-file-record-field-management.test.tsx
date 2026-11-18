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
      { name: "Content", type: "text" },
    ],
  })
  const table = original.tables[0]!
  const title = table.fields.find((field) => field.name === "Title")!
  const status = table.fields.find((field) => field.name === "Status")!
  const content = table.fields.find((field) => field.name === "Content")!
  const row = (
    await source.insertRow(table.table.id, {
      [title.id]: "Record A",
      [content.id]: "# Saved content",
    })
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
  let setDefaultHidden!: (value: boolean) => void
  let setReadOnly!: (value: boolean) => void
  let acceptSnapshot!: (next: EidosFileSnapshot) => void
  const savedScope = `canonical-test-${crypto.randomUUID()}`
  let acceptedSnapshot = original
  const renderers = {
    grid: (props: EidosFileViewRendererProps) => (
      <EidosFileRecordInspector
        row={row}
        fields={props.table.fields.filter(
          (field) => field.systemRole == null && field.id !== status.id
        )}
        variant={props.recordPresentation}
        contentField={props.table.fields.find(
          (field) => field.id === content.id
        )}
        onCellEdit={(record, field, value) =>
          source.updateRow(props.table.table.id, String(record._id), {
            [field.id]: value,
          })
        }
      />
    ),
  }
  function Fixture() {
    const [snapshot, setSnapshot] = useState<EidosFileSnapshot>(original)
    const [scope, changeScope] = useState(savedScope)
    const [variant, changeVariant] = useState<"page" | "panel">("page")
    const [tableIndex, changeTableIndex] = useState(0)
    const [defaultHidden, changeDefaultHidden] = useState(false)
    const [readonly, changeReadOnly] = useState(false)
    setDefaultHidden = changeDefaultHidden
    setReadOnly = changeReadOnly
    acceptSnapshot = (next) => {
      acceptedSnapshot = next
      setSnapshot(next)
    }
    setScope = changeScope
    setVariant = changeVariant
    setTableIndex = changeTableIndex
    const current = snapshot.tables[tableIndex]!
    return (
      <EidosFileUIProvider
        recordPropertyScope={scope}
        defaultHideSystemFieldsInRecords={defaultHidden}
        markdownEditingMode="wysiwyg"
      >
        <EidosFileEditorView
          source={source}
          table={current}
          tables={snapshot.tables}
          onSnapshot={(next) => {
            acceptedSnapshot = next
            setSnapshot(next)
          }}
          disabled={readonly}
          recordPresentation={variant}
          renderers={renderers}
        />
      </EidosFileUIProvider>
    )
  }
  // Old local flags, including per-system IDs, must not override the new policy.
  storage.set(
    "eidos-record-properties-v1:" +
      JSON.stringify([savedScope, table.table.id]),
    JSON.stringify({
      hideSystemFields: true,
      hiddenFields: table.fields
        .filter((field) => field.systemRole != null)
        .map((field) => field.id),
    })
  )
  const systemRows = () =>
    container.querySelectorAll("[data-eidos-record-system-role]")
  const property = (id: string) =>
    container.querySelector('[data-eidos-record-property="' + id + '"]')
  const dialog = () => document.querySelector('[role="dialog"]')!
  const buttonText = (text: string, scope: ParentNode = document) =>
    [...scope.querySelectorAll("button")].find(
      (node) => node.textContent?.trim() === text
    ) ?? null
  const closeMenu = () =>
    act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
  const assign = async (value: boolean | null) => {
    const next = await source.updateTable(table.table.id, {
      hideSystemFieldsInRecords: value,
    })
    await act(async () => acceptSnapshot(next))
  }
  try {
    await act(async () => root.render(<Fixture />))
    expect(systemRows()).toHaveLength(3)
    expect(byLabel("Manage record properties")).toBeNull()
    expect(
      container.querySelector("[data-eidos-file-record-properties-toggle]")
    ).toBeNull()
    const label = byLabel("Edit Status properties")!.closest(
      "[data-eidos-file-record-property-label]"
    )!
    expect(
      label.querySelector('[data-eidos-file-field-type-icon="text"]')
    ).not.toBeNull()
    expect(
      label.querySelector("[data-eidos-file-record-property-handle]")
    ).toBe(byLabel("Reorder Status"))
    await click(byLabel("Edit Status properties"))
    expect(
      dialog().querySelector('[data-eidos-file-detail-panel="field"]')
    ).toBeNull()
    expect(dialog().textContent).toContain("Field changes affect every record")
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
    await closeMenu()
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(byLabel("Edit Stage properties"))
    )
    const stage = acceptedSnapshot.tables[0]!.fields.find(
      (field) => field.name === "Stage"
    )!
    await click(byLabel("Edit Stage properties"))
    await click(buttonText("Hide in records on this device", dialog()))
    expect(property(stage.id)).toBeNull()
    expect(buttonText("1 more property", container)).not.toBeNull()
    expect(buttonText("Add a property", container)).toBeNull()
    await act(async () => setScope("another-file"))
    expect(property(stage.id)).not.toBeNull()
    await act(async () => setScope(savedScope))
    expect(property(stage.id)).toBeNull()
    const preferencesBeforePeek = storage.get(
      "eidos-record-properties-v1:" +
        JSON.stringify([savedScope, table.table.id])
    )
    await click(buttonText("1 more property", container))
    expect(property(stage.id)).not.toBeNull()
    expect(buttonText("Hide 1 property", container)).not.toBeNull()
    expect(buttonText("Add a property", container)).not.toBeNull()
    expect(
      storage.get(
        "eidos-record-properties-v1:" +
          JSON.stringify([savedScope, table.table.id])
      )
    ).toBe(preferencesBeforePeek)
    await click(buttonText("Hide 1 property", container))
    expect(property(stage.id)).toBeNull()
    await click(buttonText("1 more property", container))
    await click(byLabel("Edit Stage properties"))
    await click(buttonText("Show in records on this device", dialog()))
    expect(property(stage.id)).not.toBeNull()
    expect(
      container.querySelector(
        "[data-eidos-file-record-hidden-properties-toggle]"
      )
    ).toBeNull()
    const contentEditor = "textarea[aria-label='Markdown content']"
    const draft = "# Unsaved content"
    await vi.waitFor(() =>
      expect(container.querySelector(contentEditor)).not.toBeNull()
    )
    const editor = container.querySelector<HTMLTextAreaElement>(contentEditor)!
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      )!.set!.call(editor, draft)
      editor.dispatchEvent(new Event("input", { bubbles: true }))
    })
    const addProperty = buttonText("Add a property", container)
    expect(addProperty?.disabled).toBe(false)
    expect(byLabel("Edit Stage properties")).toBeNull()
    await click(addProperty)
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
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeNull()
    )
    expect(container.querySelector(contentEditor)).toBe(editor)
    expect(editor.value).toBe(draft)
    expect(
      (await source.getRow(table.table.id, String(row._id)))?.[content.id]
    ).toBe("# Saved content")
    await act(async () => {
      editor.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          metaKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    })
    await vi.waitFor(async () =>
      expect(
        (await source.getRow(table.table.id, String(row._id)))?.[content.id]
      ).toBe(draft)
    )
    await act(async () => setDefaultHidden(true))
    expect(systemRows()).toHaveLength(0)
    expect(container.textContent).toContain("Record ID") // ordinary homonym
    expect(
      container.querySelector("[data-eidos-record-properties-footer]")
        ?.textContent
    ).not.toMatch(/system fields/i)
    await assign(false)
    expect(systemRows()).toHaveLength(3)
    await act(async () => setDefaultHidden(false))
    await assign(true)
    expect(systemRows()).toHaveLength(0)
    await act(async () => setScope("other-device-scope"))
    expect(systemRows()).toHaveLength(0) // persisted Table policy, not personal local storage
    await assign(null)
    expect(systemRows()).toHaveLength(3)
    await act(async () => setDefaultHidden(true))
    expect(systemRows()).toHaveLength(0)
    await act(async () => setVariant("panel"))
    expect(systemRows()).toHaveLength(0)
    expect(
      container.querySelector("[data-eidos-record-properties-footer]")
        ?.textContent
    ).not.toMatch(/system fields/i)
    await act(async () => setTableIndex(1))
    expect(systemRows()).toHaveLength(0) // another unset table follows the current default
    await act(async () => setDefaultHidden(false))
    expect(systemRows()).toHaveLength(3)
    await act(async () => setTableIndex(0))
    expect(systemRows()).toHaveLength(3)
    await click(byLabel("Edit Stage properties"))
    await click(buttonText("Hide in records on this device", dialog()))
    await act(async () => setReadOnly(true))
    expect(byLabel("Edit Stage properties")).toBeNull()
    expect(buttonText("Add a property", container)).toBeNull()
    await click(buttonText("1 more property", container))
    expect(property(stage.id)).not.toBeNull()
    expect(systemRows()).toHaveLength(3)
    await click(buttonText("Hide 1 property", container))
    expect(property(stage.id)).toBeNull()
    expect(JSON.stringify((await source.getSnapshot()).tables[0]!.views)).toBe(
      beforeViews
    )
    const current = await source.getRow!(table.table.id, String(row._id))
    expect(current?.[title.id]).toBe("Record A")
  } finally {
    act(() => root.unmount())
    container.remove()
    port.close()
  }
})
