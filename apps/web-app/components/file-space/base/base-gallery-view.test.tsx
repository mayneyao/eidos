// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  BaseRowPage,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseGalleryView } from "./base-gallery-view"

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

vi.mock("./base-record-inspector", () => ({
  BaseRecordInspector: ({ row }: { row: { title?: string } }) => (
    <aside data-testid="record-inspector">{row.title}</aside>
  ),
}))

vi.mock("./base-record-delete-dialog", () => ({
  BaseRecordDeleteDialog: ({
    row,
    onDelete,
    onOpenChange,
  }: {
    row: { _id?: string; title?: string } | null
    onDelete: (row: { _id?: string; title?: string }) => Promise<void>
    onOpenChange: (open: boolean) => void
  }) =>
    row ? (
      <button
        type="button"
        onClick={() => void onDelete(row).then(() => onOpenChange(false))}
      >
        Confirm delete {row.title}
      </button>
    ) : null,
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const table: BaseTableSnapshot = {
  table: {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    position: 1,
    icon: null,
    description: null,
    createdAt: "2026-07-12 00:00:00",
    updatedAt: "2026-07-12 00:00:00",
  },
  fields: [
    {
      name: "Title",
      type: "title",
      tableName: "tb_tasks",
      tableColumnName: "title",
      property: null,
      storageCodec: "scalar",
      valueKind: "system",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
    {
      name: "Status",
      type: "select",
      tableName: "tb_tasks",
      tableColumnName: "status",
      property: {
        options: [{ id: "todo", name: "Todo", color: "blue" }],
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

const view: BaseViewInfo = {
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
  createdAt: "2026-07-12 00:00:00",
  updatedAt: "2026-07-12 00:00:00",
}

describe("BaseGalleryView", () => {
  let container: HTMLDivElement
  let root: Root
  let originalCreateObjectUrl: typeof URL.createObjectURL
  let originalRevokeObjectUrl: typeof URL.revokeObjectURL
  const scrollIntoView = vi.fn()
  const scrollTo = vi.fn()

  beforeEach(() => {
    originalCreateObjectUrl = URL.createObjectURL
    originalRevokeObjectUrl = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => "blob:base-cover")
    URL.revokeObjectURL = vi.fn()
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
    URL.createObjectURL = originalCreateObjectUrl
    URL.revokeObjectURL = originalRevokeObjectUrl
    vi.unstubAllGlobals()
  })

  it("loads paged cards and opens the record inspector", async () => {
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
                { _id: "row_2", title: "Ship Base", status: null },
              ]
            : [{ _id: "row_3", title: "Review UX", status: "todo" }],
      })
    )

    await act(async () => {
      root.render(
        <BaseGalleryView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.firstElementChild?.classList).toContain(
      "base-detail-layout"
    )
    expect(loadPage).toHaveBeenCalledWith(0, 100)
    expect(container.textContent).toContain("Write RFC")
    expect(container.textContent).toContain("Todo")
    expect(container.querySelector('[role="list"]')).not.toBeNull()
    expect(
      container.querySelector('[role="list"] > [role="presentation"]')
    ).not.toBeNull()
    expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(3)
    expect(
      container
        .querySelector('[data-base-row-id="row_1"]')
        ?.getAttribute("aria-posinset")
    ).toBe("1")
    expect(
      container
        .querySelector('[data-base-row-id="row_1"]')
        ?.getAttribute("aria-setsize")
    ).toBe("3")
    expect(
      container
        .querySelector('[data-base-row-id="row_3"]')
        ?.getAttribute("aria-posinset")
    ).toBe("3")
    expect(
      Array.from(container.querySelectorAll("button")).some((button) =>
        button.textContent?.includes("Load more")
      )
    ).toBe(false)

    await act(async () => {
      container
        .querySelector<HTMLElement>('[data-base-row-id="row_1"] h3')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }))
    })
    expect(
      container.querySelector('[data-testid="record-inspector"]')?.textContent
    ).toBe("Write RFC")

    expect(loadPage).toHaveBeenLastCalledWith(2, 100, 3)
    expect(container.textContent).toContain("Review UX")
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
                { _id: "row_2", title: "Ship Base", status: null },
              ]
            : [{ _id: "row_3", title: "Review UX", status: "todo" }],
      })
    )
    const onRowCountChange = vi.fn()

    await act(async () => {
      root.render(
        <BaseGalleryView
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
        .querySelector('[data-base-row-id="row_3"]')
        ?.getAttribute("aria-current")
    ).toBe("true")
  })

  it("deduplicates repeated cover reads across virtual cards", async () => {
    const coverTable: BaseTableSnapshot = {
      ...table,
      fields: [
        ...table.fields,
        {
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
    const coverView: BaseViewInfo = {
      ...view,
      properties: {
        ...view.properties,
        coverPreview: "cover",
      },
    }
    const readBinary = vi.fn(async (path: string) => ({
      path,
      content: new Uint8Array([1, 2, 3]),
      size: 3,
      mtimeMs: 1,
    }))

    await act(async () => {
      root.render(
        <BaseGalleryView
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
                cover: '["assets/shared.png"]',
              },
              {
                _id: "row_2",
                title: "Second",
                cover: '["assets/shared.png"]',
              },
            ],
          }))}
          readBinary={readBinary}
        />
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(readBinary).toHaveBeenCalledTimes(1)
    expect(readBinary).toHaveBeenCalledWith("assets/shared.png")
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(
      container.querySelectorAll('img[src="blob:base-cover"]')
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
        <BaseGalleryView
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

  it("keeps the virtual window mounted while a page refresh is pending", async () => {
    let resolveRefresh: ((page: BaseRowPage) => void) | undefined
    const loadPage = vi
      .fn<(offset: number, limit: number) => Promise<BaseRowPage>>()
      .mockResolvedValueOnce({
        tableId: "tasks",
        offset: 0,
        limit: 100,
        total: 1,
        rows: [{ _id: "row_1", title: "Before refresh", status: "todo" }],
      })
      .mockImplementationOnce(
        () =>
          new Promise<BaseRowPage>((resolve) => {
            resolveRefresh = resolve
          })
      )

    await act(async () => {
      root.render(
        <BaseGalleryView
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
        <BaseGalleryView
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
        .querySelector("[data-base-gallery-scroll]")
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
        .querySelector("[data-base-gallery-scroll]")
        ?.getAttribute("aria-busy")
    ).toBe("false")
  })

  it("keeps a large gallery bounded and loads the target window on scroll", async () => {
    const loadPage = vi.fn(async (offset: number, limit: number) => ({
      tableId: "tasks",
      offset,
      limit,
      total: 100_000,
      rows: Array.from({ length: 100 }, (_, index) => ({
        _id: `row_${offset + index}`,
        title: `Task ${offset + index}`,
        status: "todo",
      })),
    }))

    await act(async () => {
      root.render(
        <BaseGalleryView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
    })

    const initialMountedCards =
      container.querySelectorAll('[role="listitem"]').length
    expect(initialMountedCards).toBeGreaterThan(0)
    expect(initialMountedCards).toBeLessThan(100)

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        "[data-base-gallery-scroll]"
      )
      if (!scroller) return
      scroller.scrollTop = 100_000_000
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadPage).toHaveBeenCalledWith(99_900, 100, 100_000)
    expect(
      container
        .querySelector("[data-base-gallery-scroll]")
        ?.getAttribute("data-base-window-start")
    ).toBe("99900")
    expect(
      Number(
        container
          .querySelector("[data-base-gallery-scroll]")
          ?.getAttribute("data-base-window-size")
      )
    ).toBeLessThanOrEqual(300)
    expect(container.querySelectorAll('[role="listitem"]').length).toBeLessThan(
      100
    )

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        "[data-base-gallery-scroll]"
      )
      if (!scroller) return
      scroller.scrollTop = 0
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(loadPage).toHaveBeenLastCalledWith(0, 100, 100_000)
    expect(
      container
        .querySelector("[data-base-gallery-scroll]")
        ?.getAttribute("data-base-window-start")
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
    const smallView: BaseViewInfo = {
      ...view,
      properties: { ...view.properties, cardSize: "small" },
    }

    await act(async () => {
      root.render(
        <BaseGalleryView
          table={{ ...table, rowCount: rows.length }}
          view={smallView}
          loadPage={loadPage}
        />
      )
      await Promise.resolve()
    })

    const scroller = container.querySelector<HTMLElement>(
      "[data-base-gallery-scroll]"
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
        <BaseGalleryView
          table={{ ...table, rowCount: rows.length }}
          view={{
            ...smallView,
            properties: { ...smallView.properties, cardSize: "large" },
          }}
          loadPage={loadPage}
        />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    expect(scrollTo).toHaveBeenCalled()
    expect(scroller.scrollTop).not.toBe(previousScrollTop)
    expect(visibleRowPositions(scroller.scrollTop)).toContain(anchorPosition)
  })

  it("keeps a distant virtual row wrapper mounted when its page arrives", async () => {
    let resolveTargetPage: ((page: BaseRowPage) => void) | undefined
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
      return new Promise<BaseRowPage>((resolve) => {
        resolveTargetPage = resolve
      })
    })

    await act(async () => {
      root.render(
        <BaseGalleryView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
    })

    await act(async () => {
      const scroller = container.querySelector<HTMLElement>(
        "[data-base-gallery-scroll]"
      )
      if (!scroller) return
      scroller.scrollTop = 100_000_000
      scroller.dispatchEvent(new Event("scroll"))
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const targetCall = loadPage.mock.calls.find(([offset]) => offset > 0)
    const targetOffset = targetCall?.[0]
    expect(targetOffset).toBeTypeOf("number")
    expect(resolveTargetPage).toBeTypeOf("function")
    const placeholder = container.querySelector<HTMLElement>(
      "[data-base-gallery-placeholder]"
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
    let resolveNextPage: ((page: BaseRowPage) => void) | undefined
    const loadPage = vi.fn((offset: number, limit: number) => {
      if (offset === 100) {
        return new Promise<BaseRowPage>((resolve) => {
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
        <BaseGalleryView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    loadPage.mockClear()

    const scroller = container.querySelector<HTMLElement>(
      "[data-base-gallery-scroll]"
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
      container.querySelectorAll("[data-base-gallery-placeholder]")
    ).toHaveLength(0)
    expect(
      container
        .querySelector("[data-base-gallery-progress]")
        ?.classList.contains("h-0")
    ).toBe(true)
    expect(
      container
        .querySelector("[data-base-gallery-scroll]")
        ?.getAttribute("data-base-window-start")
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

    expect(container.querySelector("[data-base-gallery-progress]")).toBeNull()
  })

  it("stops automatic retries after the first page fails and recovers in place", async () => {
    const onError = vi.fn()
    const loadPage = vi
      .fn<
        (
          offset: number,
          limit: number,
          totalHint?: number
        ) => Promise<BaseRowPage>
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
        <BaseGalleryView
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
      .fn<(offset: number, limit: number) => Promise<BaseRowPage>>()
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
        <BaseGalleryView
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
        "[data-base-gallery-scroll]"
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
})
