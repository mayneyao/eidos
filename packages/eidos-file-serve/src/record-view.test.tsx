// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import type { EidosFileEditorViewProps } from "@eidos.space/eidos-file-ui/eidos-file-editor-view"
import type { EidosFileRelatedRecordPanelProps } from "@eidos.space/eidos-file-ui/eidos-file-related-record-panel"
import { BrowserEidosFileEditorView } from "./record-view"

const observed = vi.hoisted(() => ({
  view: null as EidosFileEditorViewProps | null,
  panel: null as EidosFileRelatedRecordPanelProps | null,
}))
vi.mock("@eidos.space/eidos-file-ui/eidos-file-editor-view", () => ({
  EidosFileEditorView: (props: EidosFileEditorViewProps) => {
    observed.view = props
    return null
  },
}))
vi.mock("@eidos.space/eidos-file-ui/eidos-file-related-record-panel", () => ({
  EidosFileRelatedRecordPanel: (props: EidosFileRelatedRecordPanelProps) => {
    observed.panel = props
    return <div data-record-panel="" />
  },
}))

it("owns non-grid record opening, presentation, navigation and reloads", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  const root = createRoot(document.createElement("div"))
  // These adapters are not called: the test exercises the browser controller's wiring.
  const props = {
    source: {},
    table: { table: { id: "notes" }, fields: [], views: [] },
    view: { id: "feed", type: "feed", properties: {}, sorts: [] },
    search: "needle",
  } as unknown as EidosFileEditorViewProps
  try {
    await act(async () =>
      root.render(<BrowserEidosFileEditorView {...props} />)
    )
    await act(async () => observed.view?.onInspectedRowChange?.("first"))
    expect(observed.panel?.target).toEqual({
      tableId: "notes",
      rowId: "first",
      title: "",
    })
    await act(async () => observed.panel?.onPresentationToggle?.())
    expect(observed.panel?.presentation).toBe("page")
    await act(async () => observed.panel?.onNavigate?.("second"))
    expect(observed.panel?.target.rowId).toBe("second")
    expect(observed.view?.inspectedRowId).toBe("second")
    await act(async () => observed.panel?.onClose())
    expect(observed.view?.inspectedRowId).toBeNull()
  } finally {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
  }
})
