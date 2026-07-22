// @vitest-environment jsdom

import { act } from "react"
import { flushSync } from "react-dom"
import { createRoot, type Root } from "react-dom/client"
import {
  encodeEidosFileAttachmentPaths,
  type EidosFileRowPage,
  type EidosFileTableSnapshot,
  type EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileGalleryView } from "./eidos-file-gallery-view"
import {
  EIDOS_FILE_VIRTUAL_SCROLL_MAX_ITEMS,
  EIDOS_FILE_VIRTUAL_SCROLL_MAX_SIZE,
} from "./eidos-file-virtual-scroll"

const contextMocks = vi.hoisted(() => ({
  translate: (message: string, values: Record<string, string | number> = {}) =>
    Object.entries(values).reduce(
      (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
      message
    ),
}))

vi.mock("./context", () => ({
  useEidosFileUI: () => ({
    themeName: "light",
    translate: contextMocks.translate,
    resolveAssetUrl: (path: string) => `/~/${path}`,
    resolveFilePreview: (path: string) => path,
  }),
}))

vi.mock("./eidos-file-record-inspector", () => ({
  EidosFileRecordInspector: ({
    row,
    disabled,
    loading,
    loadError,
    onOpenInTab,
  }: {
    row: { title?: string; notes?: string }
    disabled?: boolean
    loading?: boolean
    loadError?: string | null
    onOpenInTab?: (row: { title?: string; notes?: string }) => void
  }) => (
    <aside
      data-testid="record-inspector"
      data-disabled={String(Boolean(disabled))}
      data-loading={String(Boolean(loading))}
      data-load-error={loadError ?? ""}
    >
      {row.title}:{row.notes ?? "preview"}
      <button type="button" onClick={() => onOpenInTab?.(row)}>
        Open mocked record in tab
      </button>
    </aside>
  ),
}))

vi.mock("./eidos-file-record-delete-dialog", () => ({
  EidosFileRecordDeleteDialog: ({
    row,
    disabled,
    onDelete,
    onOpenChange,
  }: {
    row: { _id?: string; title?: string } | null
    disabled?: boolean
    onDelete: (row: { _id?: string; title?: string }) => Promise<void>
    onOpenChange: (open: boolean) => void
  }) =>
    row ? (
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onDelete(row).then(() => onOpenChange(false))}
      >
        Confirm delete {row.title}
      </button>
    ) : null,
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const table: EidosFileTableSnapshot = {
  table: {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    physicalName: "tb_tasks",
    position: 1,
    icon: null,
    description: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  },
  fields: [
    {
      id: "0198c72d-82b5-7000-8000-000000000001",
      tableId: "0198c72d-82b5-7000-8000-000000000010",
      name: "Title",
      type: "text",
      isRecordLabel: true,
      tableName: "tb_tasks",
      tableColumnName: "title",
      property: null,
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
    {
      id: "0198c72d-82b5-7000-8000-000000000002",
      tableId: "0198c72d-82b5-7000-8000-000000000010",
      name: "Status",
      type: "select",
      tableName: "tb_tasks",
      tableColumnName: "status",
      property: {
        options: [{ value: "todo", color: "blue" }],
      },
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
  ],
  views: [],
  rowCount: 3,
}

const view: EidosFileViewInfo = {
  id: "view_gallery",
  name: "Cards",
  type: "gallery",
  tableId: "tasks",
  query: "SELECT * FROM tb_tasks",
  properties: { cardSize: "medium", hideEmptyFields: true },
  filter: null,
  sorts: [],
  orderMap: null,
  hiddenFields: [],
  position: 1,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
}

describe("EidosFileGalleryView", () => {
  let container: HTMLDivElement
  let root: Root
  const scrollIntoView = vi.fn()
  const scrollTo = vi.fn()

  beforeEach(() => {
    scrollIntoView.mockReset()
    scrollTo.mockReset()
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => 1024,
    })
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 640,
    })
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 1024,
    })
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value(this: HTMLElement, options: ScrollToOptions) {
        scrollTo(options)
        this.scrollTop = typeof options.top === "number" ? options.top : 0
        queueMicrotask(() => this.dispatchEvent(new Event("scroll")))
      },
    })
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    act(() => root.unmount())
    container.remove()
    await new Promise((resolve) => setTimeout(resolve, 200))
    vi.unstubAllGlobals()
  })

  it("loads paged cards and opens the record inspector", async () => {
    const onOpenRecordInTab = vi.fn()
    const loadPage = vi.fn(
      async (offset: number, limit: number, _totalHint?: number) => ({
        tableId: "tasks",
        offset,
        limit,
        total: 3,
        rows:
          offset === 0
            ? [
                { _id: "row_1", title: "Write RFC", status: "todo" },
                { _id: "row_2", title: "Ship Eidos File", status: null },
              ]
            : [{ _id: "row_3", title: "Review UX", status: "todo" }],
      })
    )

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={table}
          view={view}
          loadPage={loadPage}
          onOpenRecordInTab={onOpenRecordInTab}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.firstElementChild?.classList).toContain(
      "eidos-file-detail-layout"
    )
    expect(loadPage).toHaveBeenCalledWith(0, 100)
    expect(container.textContent).toContain("Write RFC")
    expect(container.textContent).toContain("todo")
    expect(container.querySelector('[role="list"]')).not.toBeNull()
    expect(
      container.querySelector('[role="list"] > [role="presentation"]')
    ).not.toBeNull()
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(3)
    expect(
      container
        .querySelector('[data-eidos-file-row-id="row_1"]')
        ?.getAttribute("aria-posinset")
    ).toBe("1")
    expect(
      container
        .querySelector('[data-eidos-file-row-id="row_1"]')
        ?.getAttribute("aria-setsize")
    ).toBe("3")
    expect(
      container
        .querySelector('[data-eidos-file-row-id="row_3"]')
        ?.getAttribute("aria-posinset")
    ).toBe("3")
    expect(
      Array.from(container.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Load more")
      )
    ).toBe(false)

    await act(async () => {
      container
        .querySelector<HTMLElement>('[data-eidos-file-row-id="row_1"] h3')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }))
    })
    expect(
      container.querySelector('[data-testid="record-inspector"]')?.textContent
    ).toContain("Write RFC:preview")
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Open mocked record in tab")
        ?.click()
    })
    expect(onOpenRecordInTab).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "row_1", title: "Write RFC" })
    )

    expect(loadPage).toHaveBeenLastCalledWith(2, 100, 3)
    expect(container.textContent).toContain("Review UX")
  })

  it("loads the complete Gallery record only when its inspector opens", async () => {
    let resolveRow:
      | ((row: { _id: string; title: string; notes: string }) => void)
      | undefined
    const loadRow = vi.fn(
      () =>
        new Promise<{ _id: string; title: string; notes: string }>(
          (resolve) => {
            resolveRow = resolve
          }
        )
    )

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={table}
          view={view}
          loadPage={vi.fn(async (offset, limit) => ({
            tableId: "tasks",
            offset,
            limit,
            total: 1,
            rows: [{ _id: "row_1", title: "Write RFC", status: "todo" }],
          }))}
          loadRow={loadRow}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    await act(async () => {
      container
        .querySelector<HTMLElement>('[data-eidos-file-row-id="row_1"] h3')
        ?.click()
    })
    expect(loadRow).toHaveBeenCalledWith("row_1")
    expect(
      container
        .querySelector('[data-testid="record-inspector"]')
        ?.getAttribute("data-loading")
    ).toBe("true")

    await act(async () => {
      resolveRow?.({
        _id: "row_1",
        title: "Write RFC",
        notes: "Loaded from the Eidos File",
      })
      await Promise.resolve()
    })
    expect(
      container.querySelector('[data-testid="record-inspector"]')?.textContent
    ).toContain("Write RFC:Loaded from the Eidos File")
  })

  it("uses the real viewport width before the first Gallery paint", async () => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => 620,
    })

    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false
    try {
      flushSync(() => {
        root.render(
          <EidosFileGalleryView
            table={table}
            view={view}
            loadPage={vi.fn(
              () => new Promise<EidosFileRowPage>(() => undefined)
            )}
          />
        )
      })

      expect(
        container
          .querySelector("[data-eidos-file-gallery-scroll]")
          ?.getAttribute("data-eidos-file-column-count")
      ).toBe("2")
    } finally {
      ;(
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = true
    }
    await act(async () => Promise.resolve())
  })

  it("loads and reveals a paged search result", async () => {
    const loadPage = vi.fn(
      async (offset: number, limit: number, _totalHint?: number) => ({
        tableId: "tasks",
        offset,
        limit,
        total: 3,
        rows:
          offset === 0
            ? [
                { _id: "row_1", title: "Write RFC", status: "todo" },
                { _id: "row_2", title: "Ship Eidos File", status: null },
              ]
            : [{ _id: "row_3", title: "Review UX", status: "todo" }],
      })
    )
    const onRowCountChange = vi.fn()

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={table}
          view={view}
          searchResultIndex={2}
          loadPage={loadPage}
          onRowCountChange={onRowCountChange}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadPage).toHaveBeenLastCalledWith(2, 100, 3)
    expect(onRowCountChange).toHaveBeenLastCalledWith(3)
    expect(
      container
        .querySelector('[data-eidos-file-row-id="row_3"]')
        ?.getAttribute("aria-current")
    ).toBe("true")
  })

  it("streams repeated local covers without renderer binary copies", async () => {
    const coverTable: EidosFileTableSnapshot = {
      ...table,
      fields: [
        ...table.fields,
        {
          id: "0198c72d-82b5-7000-8000-000000000003",
          tableId: "0198c72d-82b5-7000-8000-000000000010",
          name: "Cover",
          type: "file",
          tableName: "tb_tasks",
          tableColumnName: "cover",
          property: null,
          storageCodec: "json_array",
          valueKind: "source",
          isHidden: false,
          isDerived: false,
          sourceTableColumnName: null,
          dependsOn: null,
        },
      ],
      rowCount: 2,
    }
    const coverView: EidosFileViewInfo = {
      ...view,
      properties: {
        ...view.properties,
        coverField: "0198c72d-82b5-7000-8000-000000000003",
      },
    }
    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={coverTable}
          view={coverView}
          loadPage={vi.fn(async (offset, limit) => ({
            tableId: "tasks",
            offset,
            limit,
            total: 2,
            rows: [
              {
                _id: "row_1",
                title: "First",
                cover: encodeEidosFileAttachmentPaths(["assets/shared.png"]),
              },
              {
                _id: "row_2",
                title: "Second",
                cover: encodeEidosFileAttachmentPaths(["assets/shared.png"]),
              },
            ],
          }))}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(
      container.querySelectorAll('img[src="/~\/assets\/shared.png"]')
    ).toHaveLength(2)
    expect(container.querySelector("img")?.getAttribute("loading")).toBe("lazy")
    expect(container.querySelector("img")?.getAttribute("decoding")).toBe(
      "async"
    )
  })

  it("deletes a loaded card without resetting or reloading the gallery", async () => {
    const rows = [
      { _id: "row_1", title: "First", status: "todo" },
      { _id: "row_2", title: "Second", status: "todo" },
    ]
    const loadPage = vi.fn(
      async (offset: number, limit: number, _totalHint?: number) => ({
        tableId: "tasks",
        offset,
        limit,
        total: rows.length,
        rows,
      })
    )
    const onDeleteRow = vi.fn(async () => undefined)
    const onRowCountChange = vi.fn()

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={{ ...table, rowCount: rows.length }}
          view={view}
          loadPage={loadPage}
          onDeleteRow={onDeleteRow}
          onRowCountChange={onRowCountChange}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="More actions for First"]'
        )
        ?.dispatchEvent(
          new MouseEvent("pointerdown", { bubbles: true, button: 0 })
        )
    })
    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent?.includes("Delete record"))
        ?.click()
    })
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Confirm delete First")
        ?.click()
      await Promise.resolve()
    })

    expect(onDeleteRow).toHaveBeenCalledWith(rows[0])
    expect(container.textContent).not.toContain("First")
    expect(container.textContent).toContain("Second")
    expect(loadPage).toHaveBeenCalledTimes(1)
    expect(onRowCountChange).toHaveBeenLastCalledWith(1)
  })

  it("keeps record details viewable while blocking Gallery mutations", async () => {
    const row = { _id: "row_1", title: "First", status: "todo" }
    const onDeleteRow = vi.fn(async () => undefined)
    const onCellEdit = vi.fn()

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={{ ...table, rowCount: 1 }}
          view={view}
          disabled
          loadPage={vi.fn(async (offset, limit) => ({
            tableId: "tasks",
            offset,
            limit,
            total: 1,
            rows: [row],
          }))}
          onCellEdit={onCellEdit}
          onDeleteRow={onDeleteRow}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      container
        .querySelector<HTMLElement>('[data-eidos-file-row-id="row_1"] h3')
        ?.click()
    })
    expect(
      container.querySelector<HTMLElement>('[data-testid="record-inspector"]')
        ?.dataset.disabled
    ).toBe("true")

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="More actions for First"]'
        )
        ?.dispatchEvent(
          new MouseEvent("pointerdown", { bubbles: true, button: 0 })
        )
    })
    expect(
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      ).some((item) => item.textContent?.includes("Delete record"))
    ).toBe(false)
    expect(onCellEdit).not.toHaveBeenCalled()
    expect(onDeleteRow).not.toHaveBeenCalled()
  })

  it("keeps the virtual window mounted while a page refresh is pending", async () => {
    let resolveRefresh: ((page: EidosFileRowPage) => void) | undefined
    const loadPage = vi
      .fn<(offset: number, limit: number) => Promise<EidosFileRowPage>>()
      .mockResolvedValueOnce({
        tableId: "tasks",
        offset: 0,
        limit: 100,
        total: 1,
        rows: [{ _id: "row_1", title: "Before refresh", status: "todo" }],
      })
      .mockImplementationOnce(
        () =>
          new Promise<EidosFileRowPage>((resolve) => {
            resolveRefresh = resolve
          })
      )

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={{ ...table, rowCount: 1 }}
          view={view}
          reloadToken={0}
          loadPage={loadPage}
        />
      )
      await Promise.resolve()
    })
    expect(container.textContent).toContain("Before refresh")

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={{ ...table, rowCount: 1 }}
          view={view}
          reloadToken={1}
          loadPage={loadPage}
        />
      )
      await Promise.resolve()
    })

    expect(container.textContent).toContain("Before refresh")
    expect(container.textContent).not.toContain("Loading gallery")
    expect(
      container
        .querySelector("[data-eidos-file-gallery-scroll]")
        ?.getAttribute("aria-busy")
    ).toBe("true")

    await act(async () => {
      resolveRefresh?.({
        tableId: "tasks",
        offset: 0,
        limit: 100,
        total: 1,
        rows: [{ _id: "row_2", title: "After refresh", status: "todo" }],
      })
      await Promise.resolve()
    })

    expect(container.textContent).not.toContain("Before refresh")
    expect(container.textContent).toContain("After refresh")
    expect(
      container
        .querySelector("[data-eidos-file-gallery-scroll]")
        ?.getAttribute("aria-busy")
    ).toBe("false")
  })

  it("keeps a million-record gallery bounded and loads the target window on scroll", async () => {
    const loadPage = vi.fn(async (offset: number, limit: number) => ({
      tableId: "tasks",
      offset,
      limit,
      total: 1_000_000,
      rows: Array.from({ length: 100 }, (_, index) => ({
        _id: `row_${offset + index}`,
        title: `Task ${offset + index}`,
        status: "todo",
      })),
    }))

    await act(async () => {
      root.render(
        <EidosFileGalleryView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
    })

    const initialMountedCards =
      container.querySelectorAll('[role="listitem"]').length
    expect(initialMountedCards).toBeGreaterThan(0)
    expect(initialMountedCards).toBeLessThan(100)
    const virtualList = container.querySelector<HTMLElement>(
      '[role="list"][data-eidos-file-physical-size]'
    )
    expect(Number(virtualList?.dataset.eidosFileLogicalSize)).toBeGreaterThan(
      EIDOS_FILE_VIRTUAL_SCROLL_MAX_SIZE
    )
    expect(Number(virtualList?.dataset.eidosFilePhysicalSize)).toBe(
      EIDOS_FILE_VIRTUAL_SCROLL_MAX_SIZE
    )
    expect(Number(virtualList?.dataset.eidosFileMeasurementCount)).toBe(
      EIDOS_FILE_VIRTUAL_SCROLL_MAX_ITEMS
    )

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        "[data-eidos-file-gallery-scroll]"
      )
      if (!scroller) return
      const physicalSize = Number(
        scroller.querySelector<HTMLElement>("[data-eidos-file-physical-size]")
          ?.dataset.eidosFilePhysicalSize
      )
      scroller.scrollTop = Math.max(0, physicalSize - 640)
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadPage).toHaveBeenCalledWith(999_900, 100, 1_000_000)
    expect(
      container
        .querySelector("[data-eidos-file-gallery-scroll]")
        ?.getAttribute("data-eidos-file-window-start")
    ).toBe("999900")
    expect(
      Number(
        container
          .querySelector("[data-eidos-file-gallery-scroll]")
          ?.getAttribute("data-eidos-file-window-size")
      )
    ).toBeLessThanOrEqual(300)
    expect(container.querySelectorAll('[role="listitem"]').length).toBeLessThan(
      100
    )

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        "[data-eidos-file-gallery-scroll]"
      )
      if (!scroller) return
      scroller.scrollTop = 0
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadPage).toHaveBeenLastCalledWith(0, 100, 1_000_000)
    expect(
      container
        .querySelector("[data-eidos-file-gallery-scroll]")
        ?.getAttribute("data-eidos-file-window-start")
    ).toBe("0")
  })

  it("keeps the visible record anchored when responsive columns change", async () => {
    const visibleRowPositions = (scrollTop: number) => {
      const wrappers = Array.from(
        container.querySelectorAll<HTMLElement>('[role="list"] > [data-index]')
      )
        .map((wrapper) => ({
          wrapper,
          start:
            Number(
              wrapper.style.transform.match(
                /translate3d\(0(?:px)?,\s*([\d.]+)px/
              )?.[1]
            ) || 0,
        }))
        .sort((left, right) => left.start - right.start)
      const visible =
        wrappers.find(
          (candidate, index) =>
            candidate.start <= scrollTop &&
            (wrappers[index + 1]?.start ?? Number.POSITIVE_INFINITY) > scrollTop
        ) ?? wrappers.at(0)
      return Array.from(
        visible?.wrapper.querySelectorAll<HTMLElement>("[aria-posinset]") ?? []
      ).map((card) => Number(card.getAttribute("aria-posinset")))
    }
    const rows = Array.from({ length: 100 }, (_, index) => ({
      _id: `row_${index}`,
      title: `Task ${index}`,
      status: "todo",
    }))
    const loadPage = vi.fn(async (offset: number, limit: number) => ({
      tableId: "tasks",
      offset,
      limit,
      total: rows.length,
      rows: rows.slice(offset, offset + limit),
    }))
    const smallView: EidosFileViewInfo = {
      ...view,
      properties: { ...view.properties, cardSize: "small" },
    }

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={{ ...table, rowCount: rows.length }}
          view={smallView}
          loadPage={loadPage}
        />
      )
      await Promise.resolve()
    })

    const scroller = container.querySelector<HTMLElement>(
      "[data-eidos-file-gallery-scroll]"
    )
    expect(scroller).not.toBeNull()
    if (!scroller) return

    await act(async () => {
      scroller.scrollTop = 3_200
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
    })
    const previousScrollTop = scroller.scrollTop
    const previousPositions = visibleRowPositions(previousScrollTop)
    expect(previousPositions.length).toBeGreaterThan(0)
    const anchorPosition = previousPositions[0]
    scrollTo.mockClear()

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={{ ...table, rowCount: rows.length }}
          view={{
            ...smallView,
            properties: { ...smallView.properties, cardSize: "large" },
          }}
          loadPage={loadPage}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 80))
    })

    expect(scrollTo).toHaveBeenCalled()
    expect(scroller.scrollTop).not.toBe(previousScrollTop)
    expect(visibleRowPositions(scroller.scrollTop)).toContain(anchorPosition)
  })

  it("keeps a distant virtual row wrapper mounted when its page arrives", async () => {
    let resolveTargetPage: ((page: EidosFileRowPage) => void) | undefined
    const loadPage = vi.fn((offset: number, limit: number) => {
      if (offset === 0) {
        return Promise.resolve({
          tableId: "tasks",
          offset,
          limit,
          total: 100_000,
          rows: Array.from({ length: 100 }, (_, index) => ({
            _id: `row_${index}`,
            title: `Task ${index}`,
            status: "todo",
          })),
        })
      }
      return new Promise<EidosFileRowPage>((resolve) => {
        resolveTargetPage = resolve
      })
    })

    await act(async () => {
      root.render(
        <EidosFileGalleryView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
    })

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        "[data-eidos-file-gallery-scroll]"
      )
      if (!scroller) return
      const physicalSize = Number(
        scroller.querySelector<HTMLElement>("[data-eidos-file-physical-size]")
          ?.dataset.eidosFilePhysicalSize
      )
      scroller.scrollTop = Math.max(0, physicalSize - 640)
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const targetCall = loadPage.mock.calls.find(([offset]) => offset > 0)
    const targetOffset = targetCall?.[0]
    expect(targetOffset).toBeTypeOf("number")
    expect(resolveTargetPage).toBeTypeOf("function")
    const placeholder = container.querySelector<HTMLElement>(
      "[data-eidos-file-gallery-placeholder]"
    )
    const wrapper = placeholder?.closest<HTMLElement>("[data-index]")
    const virtualIndex = wrapper?.dataset.index
    expect(wrapper).not.toBeNull()
    expect(virtualIndex).toBeTruthy()

    await act(async () => {
      resolveTargetPage?.({
        tableId: "tasks",
        offset: targetOffset ?? 0,
        limit: 100,
        total: 100_000,
        rows: Array.from({ length: 100 }, (_, index) => ({
          _id: `row_${(targetOffset ?? 0) + index}`,
          title: `Task ${(targetOffset ?? 0) + index}`,
          status: "todo",
        })),
      })
      await Promise.resolve()
    })

    expect(container.querySelector(`[data-index="${virtualIndex}"]`)).toBe(
      wrapper
    )
  })

  it("prefetches the next page before visible cards reach the loaded edge", async () => {
    let resolveNextPage: ((page: EidosFileRowPage) => void) | undefined
    const loadPage = vi.fn((offset: number, limit: number) => {
      if (offset === 100) {
        return new Promise<EidosFileRowPage>((resolve) => {
          resolveNextPage = resolve
        })
      }
      return Promise.resolve({
        tableId: "tasks",
        offset,
        limit,
        total: 1_000,
        nextCursor: `rowid:${offset + 100}`,
        rows: Array.from({ length: 100 }, (_, index) => ({
          _id: `row_${offset + index}`,
          title: `Task ${offset + index}`,
          status: "todo",
        })),
      })
    })

    await act(async () => {
      root.render(
        <EidosFileGalleryView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    loadPage.mockClear()

    const scroller = container.querySelector<HTMLElement>(
      "[data-eidos-file-gallery-scroll]"
    )
    for (
      let scrollTop = 500;
      scrollTop <= 20_000 && loadPage.mock.calls.length === 0;
      scrollTop += 500
    ) {
      await act(async () => {
        if (!scroller) return
        scroller.scrollTop = scrollTop
        scroller.dispatchEvent(new Event("scroll"))
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }

    expect(loadPage).toHaveBeenCalledWith(100, 100, 1_000, "rowid:100")
    expect(
      container.querySelectorAll("[data-eidos-file-gallery-placeholder]")
    ).toHaveLength(0)
    expect(
      container
        .querySelector("[data-eidos-file-gallery-progress]")
        ?.classList.contains("h-0")
    ).toBe(true)
    expect(
      container
        .querySelector("[data-eidos-file-gallery-scroll]")
        ?.getAttribute("data-eidos-file-window-start")
    ).toBe("0")

    await act(async () => {
      resolveNextPage?.({
        tableId: "tasks",
        offset: 100,
        limit: 100,
        total: 1_000,
        nextCursor: "rowid:200",
        rows: Array.from({ length: 100 }, (_, index) => ({
          _id: `row_${100 + index}`,
          title: `Task ${100 + index}`,
          status: "todo",
        })),
      })
      await Promise.resolve()
    })

    expect(
      container.querySelector("[data-eidos-file-gallery-progress]")
    ).toBeNull()
  })

  it("stops automatic retries after the first page fails and recovers in place", async () => {
    const onError = vi.fn()
    const loadPage = vi
      .fn<
        (
          offset: number,
          limit: number,
          totalHint?: number
        ) => Promise<EidosFileRowPage>
      >()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        tableId: "tasks",
        offset: 0,
        limit: 100,
        total: 1,
        rows: [{ _id: "row_1", title: "Recovered", status: "todo" }],
      })

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={table}
          view={view}
          loadPage={loadPage}
          onError={onError}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadPage).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Could not load gallery records")
    expect(container.textContent).toContain("offline")
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not load gallery records"
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")
        ?.click()
      await Promise.resolve()
    })

    expect(loadPage).toHaveBeenCalledTimes(2)
    expect(loadPage).toHaveBeenLastCalledWith(0, 100)
    expect(container.textContent).toContain("Recovered")
  })

  it("does not retry a failed infinite page until the user requests it", async () => {
    const onError = vi.fn()
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      _id: `row_${index}`,
      title: `Task ${index}`,
      status: "todo",
    }))
    const loadPage = vi
      .fn<(offset: number, limit: number) => Promise<EidosFileRowPage>>()
      .mockResolvedValueOnce({
        tableId: "tasks",
        offset: 0,
        limit: 100,
        total: 101,
        rows: firstPage,
      })
      .mockRejectedValueOnce(new Error("page failed"))
      .mockResolvedValueOnce({
        tableId: "tasks",
        offset: 100,
        limit: 100,
        total: 101,
        rows: [{ _id: "row_100", title: "Last task", status: "todo" }],
      })

    await act(async () => {
      root.render(
        <EidosFileGalleryView
          table={table}
          view={view}
          loadPage={loadPage}
          onError={onError}
        />
      )
      await Promise.resolve()
    })

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        "[data-eidos-file-gallery-scroll]"
      )
      if (!scroller) return
      scroller.scrollTop = 100_000
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadPage).toHaveBeenCalledTimes(2)
    expect(onError).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Could not load more records")
    expect(container.textContent).toContain("page failed")
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not load more records"
    )

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")
        ?.click()
      await Promise.resolve()
    })

    expect(loadPage).toHaveBeenCalledTimes(3)
    expect(loadPage).toHaveBeenLastCalledWith(100, 100, 101)
  })

  it("does not rebuild mounted virtual rows while retrying an infinite page", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      _id: `row_${index}`,
      title: `Task ${index}`,
      status: "todo",
    }))
    let resolveRetry: ((page: EidosFileRowPage) => void) | undefined
    const retryPage = new Promise<EidosFileRowPage>((resolve) => {
      resolveRetry = resolve
    })
    const loadPage = vi
      .fn<(offset: number, limit: number) => Promise<EidosFileRowPage>>()
      .mockResolvedValueOnce({
        tableId: "tasks",
        offset: 0,
        limit: 100,
        total: 101,
        rows: firstPage,
      })
      .mockRejectedValueOnce(new Error("page failed"))
      .mockImplementationOnce(() => retryPage)

    await act(async () => {
      root.render(
        <EidosFileGalleryView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
    })

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        "[data-eidos-file-gallery-scroll]"
      )
      if (!scroller) return
      scroller.scrollTop = 100_000
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain("Could not load more records")
    const columnCount = Number(
      container
        .querySelector("[data-eidos-file-gallery-scroll]")
        ?.getAttribute("data-eidos-file-column-count")
    )
    const arrayFrom = vi.spyOn(Array, "from")

    await act(async () => {
      ;[...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Retry")
        ?.click()
      await Promise.resolve()
    })

    const mountedRowBuilds = arrayFrom.mock.calls.filter(([source]) => {
      if (!source || Array.isArray(source) || typeof source !== "object") {
        return false
      }
      return (source as { length?: number }).length === columnCount
    })
    expect(loadPage).toHaveBeenCalledTimes(3)
    expect(container.textContent).toContain("Loading more records")
    expect(mountedRowBuilds).toHaveLength(0)
    arrayFrom.mockRestore()

    await act(async () => {
      resolveRetry?.({
        tableId: "tasks",
        offset: 100,
        limit: 100,
        total: 101,
        rows: [{ _id: "row_100", title: "Last task", status: "todo" }],
      })
      await Promise.resolve()
    })
  })
})
