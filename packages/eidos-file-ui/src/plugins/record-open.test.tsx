import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileRow } from "@eidos.space/eidos-file"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { EidosFileUIProvider } from "../context"
import type { EidosFileViewRendererProps } from "../eidos-file-editor-view"
import type * as GalleryModule from "../eidos-file-gallery-view"
import type * as KanbanModule from "../eidos-file-kanban-view"
import type * as CalendarModule from "../eidos-file-calendar-view"
import type * as FeedModule from "../eidos-file-feed-view"
import { eidosFileGalleryPlugin } from "./gallery"
import { eidosFileKanbanPlugin } from "./kanban"
import { eidosFileCalendarPlugin } from "./calendar"
import { eidosFileFeedPlugin } from "./feed"

// Exercise the host/plugin boundary independently of each layout's rendering.
function RecordSurface({
  onOpenRecord,
}: {
  onOpenRecord?: (row: EidosFileRow) => void
}) {
  return (
    <button onClick={() => onOpenRecord?.({ _id: "record-a" })}>
      Open record
    </button>
  )
}
vi.mock("../eidos-file-gallery-view", async (original) => ({
  ...(await original<typeof GalleryModule>()),
  EidosFileGalleryView: RecordSurface,
}))
vi.mock("../eidos-file-kanban-view", async (original) => ({
  ...(await original<typeof KanbanModule>()),
  EidosFileKanbanView: RecordSurface,
}))
vi.mock("../eidos-file-calendar-view", async (original) => ({
  ...(await original<typeof CalendarModule>()),
  EidosFileCalendarView: RecordSurface,
}))
vi.mock("../eidos-file-feed-view", async (original) => ({
  ...(await original<typeof FeedModule>()),
  EidosFileFeedView: RecordSurface,
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

it.each([
  eidosFileGalleryPlugin,
  eidosFileKanbanPlugin,
  eidosFileCalendarPlugin,
  eidosFileFeedPlugin,
])(
  "$id honors host record navigation and restores inspection when the host stops routing",
  async (plugin) => {
    const contribution = plugin.views![0]!
    const Renderer = contribution.renderer
    const open = vi.fn()
    const inspect = vi.fn()
    const props = {
      table: { table: { id: "files" }, fields: [] },
      view: { id: "view", type: contribution.type },
      source: { getGroupCounts: vi.fn() },
      query: {},
      onInspectedRowChange: inspect,
    } as unknown as EidosFileViewRendererProps
    await act(async () =>
      root.render(
        <EidosFileUIProvider>
          <Renderer {...props} onOpenRecord={open} />
        </EidosFileUIProvider>
      )
    )
    act(() => host.querySelector("button")!.click())
    expect(open).toHaveBeenCalledExactlyOnceWith("record-a")
    expect(inspect).not.toHaveBeenCalled()
    await act(async () =>
      root.render(
        <EidosFileUIProvider>
          <Renderer {...props} />
        </EidosFileUIProvider>
      )
    )
    act(() => host.querySelector("button")!.click())
    expect(inspect).toHaveBeenCalledExactlyOnceWith("record-a")
  }
)
