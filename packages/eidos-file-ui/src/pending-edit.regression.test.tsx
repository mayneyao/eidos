// @vitest-environment jsdom
import { act, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  GridCellKind,
  getDefaultTheme,
  textCellRenderer,
} from "@glideapps/glide-data-grid"
import type DataGridOverlayEditorType from "../node_modules/@glideapps/glide-data-grid/dist/dts/internal/data-grid-overlay-editor/data-grid-overlay-editor.js"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "./context"
import { EidosFileRecordInspector } from "./eidos-file-record-inspector"
import { pendingEditEditor } from "./use-pending-edit"
import { acquireGlideDataGridPortal } from "./use-glide-data-grid-portal"

const overlayModule =
  "../node_modules/@glideapps/glide-data-grid/dist/esm/internal/data-grid-overlay-editor/data-grid-overlay-editor.js"
const { default: DataGridOverlayEditor } = (await import(overlayModule)) as {
  default: typeof DataGridOverlayEditorType
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value() {},
})
const field: EidosFileFieldInfo = {
  id: "title",
  tableId: "tasks",
  tableName: "tasks",
  name: "Title",
  type: "text",
  tableColumnName: "title",
  property: null,
  storageCodec: "scalar",
  valueKind: "source",
  isHidden: false,
  isDerived: false,
  isRecordLabel: true,
  sourceTableColumnName: null,
  dependsOn: null,
}
const number: EidosFileFieldInfo = {
  ...field,
  id: "score",
  name: "Score",
  tableColumnName: "score",
  type: "number",
  isRecordLabel: false,
}
const body: EidosFileFieldInfo = {
  ...field,
  id: "body",
  name: "Body",
  tableColumnName: "body",
  isRecordLabel: false,
}
const row = { _id: "one", title: "Saved", score: 1, body: "Saved markdown" }
function input(element: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value)
  element.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("real editor state across host materialization rekey", () => {
  let host: HTMLDivElement
  let root: Root
  let releasePortal: () => void
  const pending = new Set<string>()
  const onPending = (id: string, value: boolean) => {
    if (value) pending.add(id)
    else pending.delete(id)
  }
  beforeEach(() => {
    pending.clear()
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    releasePortal = acquireGlideDataGridPortal()
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    releasePortal()
  })

  it("reproduces losing Glide's unsubmitted text overlay on rekey and reports its actual lifetime", async () => {
    const finish = vi.fn()
    const content = {
      kind: GridCellKind.Text as const,
      data: "Saved",
      displayData: "Saved",
      allowOverlay: true,
    }
    const render = async (key: number) =>
      act(async () =>
        root.render(
          <EidosFileUIProvider onPendingEditChange={onPending}>
            <DataGridOverlayEditor
              key={key}
              id="real-grid-editor"
              cell={[0, 0]}
              target={{ x: 0, y: 0, width: 200, height: 32 }}
              content={content}
              theme={getDefaultTheme()}
              forceEditMode
              highlight={false}
              onFinishEditing={finish}
              getCellRenderer={() =>
                textCellRenderer as ReturnType<
                  ComponentProps<
                    typeof DataGridOverlayEditor
                  >["getCellRenderer"]
                >
              }
              provideEditor={(cell) => {
                const editor = textCellRenderer.provideEditor?.(
                  cell as typeof content
                )
                return editor
                  ? pendingEditEditor(
                      editor as NonNullable<
                        ReturnType<
                          NonNullable<
                            ComponentProps<
                              typeof DataGridOverlayEditor
                            >["provideEditor"]
                          >
                        >
                      >
                    )
                  : undefined
              }}
            />
          </EidosFileUIProvider>
        )
      )
    await render(0)
    const editor =
      document.querySelector<HTMLTextAreaElement>("#portal textarea")!
    expect(editor).not.toBeNull()
    await act(async () => input(editor, "Unsubmitted grid text"))
    expect(editor.value).toBe("Unsubmitted grid text")
    expect(pending.size).toBe(1)
    expect(finish).not.toHaveBeenCalled()
    await render(1)
    expect(
      document.querySelector<HTMLTextAreaElement>("#portal textarea")!.value
    ).toBe("Saved")
    expect(finish).not.toHaveBeenCalled()
    await act(async () => root.render(null))
    expect(pending.size).toBe(0)
  })

  it("reports invalid field input until corrected or explicitly unmounted; rekey loses it", async () => {
    const save = vi.fn()
    const render = async (key: number) =>
      act(async () =>
        root.render(
          <EidosFileUIProvider onPendingEditChange={onPending}>
            <EidosFileRecordInspector
              key={key}
              row={row}
              fields={[field, number]}
              onCellEdit={save}
            />
          </EidosFileUIProvider>
        )
      )
    await render(0)
    expect(pending.size).toBe(0)
    const editor = host.querySelector<HTMLInputElement>(
      'input[aria-label="Score"]'
    )!
    await act(async () => {
      editor.focus()
      input(editor, "invalid")
      editor.blur()
    })
    expect(pending.size).toBeGreaterThan(0)
    expect(save).not.toHaveBeenCalled()
    expect(editor.value).toBe("invalid")
    await render(1)
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="Score"]')!.value
    ).toBe("1")
    expect(pending.size).toBe(0)
  })

  it("reports a failed inspector save after its field becomes clean; rekey loses the retryable value", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Disk rejected edit"))
    const render = async (key: number) =>
      act(async () =>
        root.render(
          <EidosFileUIProvider onPendingEditChange={onPending}>
            <EidosFileRecordInspector
              key={key}
              row={row}
              fields={[field]}
              onCellEdit={save}
            />
          </EidosFileUIProvider>
        )
      )
    await render(0)
    const editor = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Title"]'
    )!
    await act(async () => {
      editor.focus()
      input(editor, "Failed text")
      editor.blur()
    })
    expect(save).toHaveBeenCalledOnce()
    expect(host.textContent).toContain("Disk rejected edit")
    expect(pending.size).toBeGreaterThan(0)
    await render(1)
    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Title"]')!
        .value
    ).toBe("Saved")
    expect(host.textContent).not.toContain("Disk rejected edit")
  })

  it("reports real Markdown source drafts without automatically saving them; rekey loses the draft", async () => {
    await import("./eidos-file-markdown-source-editor")
    const save = vi.fn()
    const render = async (key: number) =>
      act(async () =>
        root.render(
          <EidosFileUIProvider
            onPendingEditChange={onPending}
            markdownEditingMode="wysiwyg"
          >
            <EidosFileRecordInspector
              key={key}
              variant="page"
              row={row}
              fields={[field, body]}
              contentField={body}
              onCellEdit={save}
            />
          </EidosFileUIProvider>
        )
      )
    await render(0)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    const editor = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Markdown content"]'
    )!
    expect(editor).not.toBeNull()
    await act(async () => input(editor, "Unsubmitted markdown"))
    expect(pending.size).toBeGreaterThan(0)
    expect(save).not.toHaveBeenCalled()
    await render(1)
    expect(
      host.querySelector<HTMLTextAreaElement>(
        'textarea[aria-label="Markdown content"]'
      )!.value
    ).toBe("Saved markdown")
    expect(save).not.toHaveBeenCalled()
    expect(pending.size).toBe(0)
  })
})
