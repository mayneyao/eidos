// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileRow,
  RecordNeighbors,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useFileSidebarRecordOpen } from "./use-file-sidebar-record-open"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const table = {
  table: {
    id: "files",
    settings: { vtabModule: "fs_meta", vtabConfig: { root: ".." } },
  },
  fields: [
    { name: "path", tableColumnName: "path", settings: { isSystem: true } },
  ],
} as unknown as EidosFileTableSnapshot
type Options = Parameters<typeof useFileSidebarRecordOpen>[0]
let root: Root
let host: HTMLDivElement
let options: Options
let open: ReturnType<typeof useFileSidebarRecordOpen>["openRecord"]
let routing: ReturnType<typeof useFileSidebarRecordOpen>
const inspect = vi.fn()
const preview = vi.fn()
const getRow = vi.fn<(_: string, id: string) => Promise<EidosFileRow | null>>()
const getRecordNeighbors =
  vi.fn<(_: string, id: string) => Promise<RecordNeighbors>>()
const getPage = vi.fn()

function Harness() {
  routing = useFileSidebarRecordOpen(options)
  open = routing.openRecord
  return (
    <div tabIndex={0} onKeyDownCapture={routing.onKeyDown} data-record-view>
      <input />
      <textarea />
      <div contentEditable />
    </div>
  )
}
async function render(changes: Partial<Options> = {}) {
  options = { ...options, ...changes }
  await act(async () => root.render(<Harness />))
}
function deferred() {
  let resolve!: (value: EidosFileRow | null) => void
  const promise = new Promise<EidosFileRow | null>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
  getRow.mockImplementation(async (_, id) => ({ _id: id, path: `${id}.md` }))
  getRecordNeighbors.mockImplementation(async (_, id) => {
    const ids = ["a", "b", "c"]
    const index = ids.indexOf(id)
    return index < 0
      ? { found: false }
      : {
          found: true,
          previousId: ids[index - 1] ?? null,
          nextId: ids[index + 1] ?? null,
        }
  })
  getPage.mockResolvedValue({ rows: [{ _id: "a", path: "a.md" }] })
  options = {
    enabled: true,
    source: { getRow, getRecordNeighbors, getPage },
    table,
    relativePath: ".eidos/files.eidos",
    scope: "gallery:",
    onOpenFile: preview,
    onInspectRecord: inspect,
  }
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

it("switches mapped files without changing the main record route", async () => {
  const focus = vi.fn()
  await render({ onRecordFocus: focus })
  await act(async () => open?.("a"))
  expect(preview).toHaveBeenCalledExactlyOnceWith("a.md")
  expect(inspect).not.toHaveBeenCalled()
  expect(getRow).toHaveBeenCalledExactlyOnceWith("files", "a")
  expect(focus).toHaveBeenCalledExactlyOnceWith({ _id: "a", path: "a.md" })
})

it("leaves the original open behavior available when the sidebar is closed or hidden", async () => {
  await render({ enabled: false })
  expect(open).toBeUndefined()
  await render({ enabled: true })
  expect(open).toBeTypeOf("function")
  await render({ enabled: false })
  expect(open).toBeUndefined()
  expect(getRow).not.toHaveBeenCalled()
})

it("keeps ordinary Eidos tables and hosts without a file target on their original route", async () => {
  await render({ table: { ...table, table: { ...table.table, settings: {} } } })
  expect(open).toBeUndefined()
  await render({ table, onOpenFile: undefined })
  expect(open).toBeUndefined()
  await render({ onOpenFile: preview, source: {} })
  expect(open).toBeUndefined()
})

it.each([
  null,
  { _id: "a" },
  { _id: "a", path: "../outside.md" },
] as Array<EidosFileRow | null>)(
  "falls back to record details when there is no safe mapped target: %j",
  async (row) => {
    getRow.mockResolvedValue(row)
    await render()
    await act(async () => open?.("a"))
    expect(inspect).toHaveBeenCalledExactlyOnceWith("a")
    expect(preview).not.toHaveBeenCalled()
  }
)

it("falls back when reading or opening the mapped file fails", async () => {
  await render()
  getRow.mockRejectedValueOnce(new Error("read failed"))
  await act(async () => open?.("a"))
  expect(inspect).toHaveBeenLastCalledWith("a")
  preview.mockRejectedValueOnce(new Error("open failed"))
  await act(async () => open?.("b"))
  expect(inspect).toHaveBeenLastCalledWith("b")
})

it("only opens C when A, B and C finish out of order", async () => {
  const focus = vi.fn()
  const a = deferred()
  const b = deferred()
  const c = deferred()
  getRow
    .mockReturnValueOnce(a.promise)
    .mockReturnValueOnce(b.promise)
    .mockReturnValueOnce(c.promise)
  await render({ onRecordFocus: focus })
  act(() => {
    open?.("a")
    open?.("b")
    open?.("c")
  })
  await act(async () => c.resolve({ _id: "c", path: "c.md" }))
  await act(async () => b.resolve({ _id: "b", path: "b.md" }))
  await act(async () => a.resolve({ _id: "a", path: "a.md" }))
  expect(preview).toHaveBeenCalledExactlyOnceWith("c.md")
  expect(focus).toHaveBeenCalledExactlyOnceWith({ _id: "c", path: "c.md" })
  expect(inspect).not.toHaveBeenCalled()
})

it.each(["close", "reopen", "view", "table", "file", "unmount"])(
  "discards a pending open after %s",
  async (change) => {
    const pending = deferred()
    getRow.mockReturnValueOnce(pending.promise)
    await render()
    act(() => open?.("a"))
    if (change === "close" || change === "reopen")
      await render({ enabled: false })
    if (change === "reopen") await render({ enabled: true })
    if (change === "view") await render({ scope: "kanban:" })
    if (change === "table")
      await render({
        table: { ...table, table: { ...table.table, id: "other" } },
      })
    if (change === "file") await render({ relativePath: "other.eidos" })
    if (change === "unmount") act(() => root.render(null))
    await act(async () => pending.resolve({ _id: "a", path: "a.md" }))
    expect(preview).not.toHaveBeenCalled()
    expect(inspect).not.toHaveBeenCalled()
  }
)

async function press(
  key: string,
  selector = "[data-record-view]",
  modifiers: KeyboardEventInit = {}
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  })
  await act(async () => {
    host.querySelector(selector)!.dispatchEvent(event)
    for (let index = 0; index < 20; index++) await Promise.resolve()
  })
  return event
}

it("uses the current query order for all four arrow keys and stays at the boundaries", async () => {
  const query = {
    search: "notes",
    sorts: [{ field: "path", direction: "desc" as const }],
  }
  await render({ query })
  act(() => routing.rememberRecord("b"))
  expect((await press("ArrowDown")).defaultPrevented).toBe(true)
  expect(preview).toHaveBeenLastCalledWith("c.md")
  await press("ArrowRight")
  expect(preview).toHaveBeenCalledTimes(1)
  await press("ArrowLeft")
  expect(preview).toHaveBeenLastCalledWith("b.md")
  await press("ArrowUp")
  expect(preview).toHaveBeenLastCalledWith("a.md")
  expect(getRecordNeighbors).toHaveBeenCalledWith("files", "b", query)
  expect(getPage).not.toHaveBeenCalled()
  expect(inspect).not.toHaveBeenCalled()
})

it("starts from the record explicitly opened in the sidebar, including while the sidebar was closed", async () => {
  await render({ enabled: false })
  act(() => routing.rememberRecord("b"))
  await render({ enabled: true })
  await press("ArrowDown")
  expect(preview).toHaveBeenCalledExactlyOnceWith("c.md")
})

it("opens the first visible record when there is no current preview record", async () => {
  await render()
  await press("ArrowDown")
  expect(getPage).toHaveBeenCalledExactlyOnceWith("files", 0, 1, {})
  expect(preview).toHaveBeenCalledExactlyOnceWith("a.md")
})

it("uses the latest clicked record as the arrow anchor while its read is still pending", async () => {
  const pending = deferred()
  getRow.mockReturnValueOnce(pending.promise)
  await render()
  act(() => open?.("b"))
  await press("ArrowDown")
  expect(preview).toHaveBeenCalledExactlyOnceWith("c.md")
  await act(async () => pending.resolve({ _id: "b", path: "b.md" }))
  expect(preview).toHaveBeenCalledTimes(1)
})

it("preserves consecutive arrow steps while their reads are pending", async () => {
  await render()
  act(() => routing.rememberRecord("a"))
  const view = host.querySelector("[data-record-view]")!
  await act(async () => {
    view.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    )
    view.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    )
    for (let index = 0; index < 30; index++) await Promise.resolve()
  })
  expect(preview.mock.calls).toEqual([["b.md"], ["c.md"]])
})

it.each([
  "input",
  "textarea",
  "[contenteditable]",
  "[role=menu]",
  "[role=dialog]",
  ".eidos-file-detail-panel",
])("preserves arrow keys inside %s", async (selector) => {
  await render()
  const protectedArea = document.createElement("div")
  protectedArea.innerHTML =
    '<div role="menu"></div><div role="dialog"></div><div class="eidos-file-detail-panel"></div>'
  host.querySelector("[data-record-view]")!.append(protectedArea)
  expect((await press("ArrowDown", selector)).defaultPrevented).toBe(false)
  expect(getRecordNeighbors).not.toHaveBeenCalled()
  expect(getPage).not.toHaveBeenCalled()
})

it.each(["altKey", "ctrlKey", "metaKey", "shiftKey"])(
  "preserves %s + ArrowDown",
  async (modifier) => {
    await render()
    expect(
      (await press("ArrowDown", "[data-record-view]", { [modifier]: true }))
        .defaultPrevented
    ).toBe(false)
    expect(getPage).not.toHaveBeenCalled()
  }
)

it("does not handle arrow keys while the sidebar is hidden", async () => {
  await render({ enabled: false })
  expect((await press("ArrowDown")).defaultPrevented).toBe(false)
  expect(getPage).not.toHaveBeenCalled()
})

it("handles arrow keys after a context menu restores focus to the document", async () => {
  await render()
  act(() => routing.rememberRecord("a"))
  const event = new KeyboardEvent("keydown", {
    key: "ArrowDown",
    bubbles: true,
    cancelable: true,
  })
  await act(async () => {
    document.body.dispatchEvent(event)
    for (let index = 0; index < 20; index++) await Promise.resolve()
  })
  expect(event.defaultPrevented).toBe(true)
  expect(preview).toHaveBeenCalledExactlyOnceWith("b.md")
})

it("handles arrow keys on the sidebar image and Gallery cover button", async () => {
  await render()
  act(() => routing.rememberRecord("a"))
  const sidebar = document.createElement("aside")
  sidebar.className = "file-sidebar"
  sidebar.innerHTML = '<img tabindex="0" /><input />'
  document.body.append(sidebar)
  try {
    await act(async () => {
      sidebar
        .querySelector("img")!
        .dispatchEvent(
          new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
        )
      for (let index = 0; index < 20; index++) await Promise.resolve()
    })
    expect(preview).toHaveBeenLastCalledWith("b.md")
    const cover = document.createElement("button")
    cover.setAttribute("data-eidos-file-entry-cover", "")
    host.querySelector("[data-record-view]")!.append(cover)
    await press("ArrowRight", "[data-eidos-file-entry-cover]")
    expect(preview).toHaveBeenLastCalledWith("c.md")
    const typing = new KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true,
    })
    await act(async () => sidebar.querySelector("input")!.dispatchEvent(typing))
    expect(typing.defaultPrevented).toBe(false)
    expect(preview).toHaveBeenCalledTimes(2)
  } finally {
    sidebar.remove()
  }
})

it("cancels a pending arrow step when a record is clicked or the query changes", async () => {
  let finish!: (result: RecordNeighbors) => void
  getRecordNeighbors.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  await render()
  act(() => routing.rememberRecord("a"))
  await press("ArrowDown")
  await act(async () => open?.("c"))
  await act(async () => finish({ found: true, previousId: null, nextId: "b" }))
  expect(preview).toHaveBeenCalledExactlyOnceWith("c.md")
  getRecordNeighbors.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  await press("ArrowUp")
  await render({ query: { search: "new filter" } })
  await act(async () => finish({ found: true, previousId: "b", nextId: null }))
  expect(preview).toHaveBeenCalledTimes(1)
})
