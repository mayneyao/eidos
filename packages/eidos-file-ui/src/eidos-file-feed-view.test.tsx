// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileRowPage,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
    timeZone: "UTC",
    translate: contextMocks.translate,
  }),
}))

import {
  EidosFileFeedView,
  eidosFileFeedCreatedField,
  eidosFileFeedProjection,
} from "./eidos-file-feed-view"
import { eidosFileFeedPlugin } from "./plugins/feed"
import { EidosFileEditorView } from "./eidos-file-editor-view"
import type { EidosFileEditorDataSource } from "./data-source"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const now = "2026-07-12T00:00:00.000Z"

const TITLE_ID = "0198c72d-82b5-7000-8000-000000000001"
const RELEASED_ID = "0198c72d-82b5-7000-8000-000000000002"
const VERSION_ID = "0198c72d-82b5-7000-8000-000000000003"
const CREATED_ID = "0198c72d-82b5-7000-8000-000000000006"
const NOTES_ID = "0198c72d-82b5-7000-8000-000000000004"
const LINK_ID = "0198c72d-82b5-7000-8000-000000000005"

const table: EidosFileTableSnapshot = {
  table: {
    id: "releases",
    name: "Releases",
    rawTableName: "tb_releases",
    physicalName: "tb_releases",
    position: 0,
    icon: null,
    description: null,
    contentFieldId: NOTES_ID,
    createdAt: now,
    updatedAt: now,
  },
  fields: [
    {
      id: TITLE_ID,
      tableId: "releases",
      name: "Title",
      type: "text",
      isRecordLabel: true,
      tableName: "tb_releases",
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
      id: RELEASED_ID,
      tableId: "releases",
      name: "Release Date",
      type: "date",
      tableName: "tb_releases",
      tableColumnName: "released",
      property: null,
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
    {
      id: VERSION_ID,
      tableId: "releases",
      name: "Version",
      type: "text",
      tableName: "tb_releases",
      tableColumnName: "version",
      property: null,
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
    {
      id: NOTES_ID,
      tableId: "releases",
      name: "Release Notes",
      type: "text",
      tableName: "tb_releases",
      tableColumnName: "notes",
      property: null,
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
    {
      id: LINK_ID,
      tableId: "releases",
      name: "Link",
      type: "url",
      tableName: "tb_releases",
      tableColumnName: "link",
      property: null,
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
    {
      id: CREATED_ID,
      tableId: "releases",
      name: "Created at",
      type: "created-time",
      systemRole: "created-time",
      tableName: "tb_releases",
      tableColumnName: "_created_at",
      property: null,
      storageCodec: "scalar",
      valueKind: "system",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
  ],
  views: [],
  rowCount: 2,
}

const view: EidosFileViewInfo = {
  id: "view_feed",
  name: "Feed",
  type: "feed",
  tableId: "releases",
  query: "",
  properties: {},
  filter: null,
  sorts: [],
  orderMap: null,
  hiddenFields: [],
  position: 0,
  createdAt: now,
  updatedAt: now,
}

function releaseRow(
  id: string,
  title: string,
  createdAt: string,
  version: string,
  notes: string,
  link: string
) {
  return {
    _id: id,
    title,
    released: createdAt.slice(0, 10),
    version,
    notes,
    link,
    _created_at: createdAt,
  }
}

const firstRow = releaseRow(
  "row-1",
  "Eidos Lite 0.6.0",
  "2026-09-01T12:00:00.000Z",
  "0.6.0",
  "## What's new\n\nAdded a Feed view.",
  "https://example.com/releases/0.6.0"
)
const secondRow = releaseRow(
  "row-2",
  "Eidos Lite 0.5.1",
  "2026-08-30T12:00:00.000Z",
  "0.5.1",
  "Stability fixes.",
  "https://example.com/releases/0.5.1"
)

function page(
  offset: number,
  limit: number,
  rows: ReturnType<typeof releaseRow>[],
  total: number
): EidosFileRowPage {
  return { tableId: "releases", offset, limit, total, rows }
}

describe("EidosFileFeedView field resolution", () => {
  it("reads the created-time system Field", () => {
    expect(eidosFileFeedCreatedField(table.fields)?.id).toBe(CREATED_ID)
  })

  it("projects the Record Label, Content Field, and created time", () => {
    const projection = eidosFileFeedProjection(table)
    expect(projection.columns).toEqual(["title", "notes", "_created_at"])
    expect(projection.includeRecordLabel).toBe(true)
  })
})

describe("EidosFileFeedView", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("renders reverse-chronological entries with Markdown content", async () => {
    const onRowCountChange = vi.fn()
    const loadPage = vi.fn(async (offset: number, limit: number) =>
      page(offset, limit, [firstRow, secondRow], 2)
    )
    await act(async () => {
      root.render(
        <EidosFileFeedView
          table={table}
          view={view}
          loadPage={loadPage}
          onRowCountChange={onRowCountChange}
        />
      )
      await Promise.resolve()
    })

    expect(onRowCountChange).toHaveBeenCalledWith(2)
    expect(
      container.querySelectorAll("[data-eidos-file-feed-row]")
    ).toHaveLength(2)
    expect(container.textContent).toContain("Eidos Lite 0.6.0")
    expect(
      container
        .querySelector('[data-eidos-file-feed-row="row-1"] time')
        ?.getAttribute("datetime")
    ).toBe("2026-09-01T12:00:00.000Z")
    expect(
      container.querySelector("[data-eidos-file-markdown-preview] h2")
        ?.textContent
    ).toBe("What's new")
  })

  it("loads additional pages on demand", async () => {
    const loadPage = vi.fn(async (offset: number, limit: number) =>
      offset === 0
        ? page(0, limit, [firstRow, secondRow], 3)
        : page(
            offset,
            limit,
            [releaseRow("row-3", "0.5.0", "2026-08-01", "0.5.0", "", "")],
            3
          )
    )
    await act(async () => {
      root.render(
        <EidosFileFeedView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
    })

    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button")
    ).find((candidate) => candidate.textContent?.includes("Load more records"))
    expect(button).toBeTruthy()
    await act(async () => {
      button?.click()
      await Promise.resolve()
    })

    expect(loadPage).toHaveBeenLastCalledWith(2, 30)
    expect(
      container.querySelectorAll("[data-eidos-file-feed-row]")
    ).toHaveLength(3)
  })

  it("opens the record when its entry is activated", async () => {
    const onOpenRecord = vi.fn()
    const loadPage = vi.fn(async (offset: number, limit: number) =>
      page(offset, limit, [firstRow], 1)
    )
    await act(async () => {
      root.render(
        <EidosFileFeedView
          table={table}
          view={view}
          loadPage={loadPage}
          onOpenRecord={onOpenRecord}
        />
      )
      await Promise.resolve()
    })

    const entry = container.querySelector<HTMLElement>(
      '[data-eidos-file-feed-row="row-1"]'
    )
    await act(async () => {
      entry?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(onOpenRecord).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "row-1" })
    )
  })

  it("collapses long content behind See more", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetHeight"
    )
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute("data-eidos-file-feed-content") ? 500 : 0
      },
    })
    try {
      const loadPage = vi.fn(async (offset: number, limit: number) =>
        page(offset, limit, [firstRow], 1)
      )
      await act(async () => {
        root.render(
          <EidosFileFeedView table={table} view={view} loadPage={loadPage} />
        )
        await Promise.resolve()
      })

      const toggle = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button")
      ).find((candidate) => candidate.textContent?.includes("See more"))
      expect(toggle).toBeTruthy()
      await act(async () => {
        toggle?.click()
      })
      expect(container.textContent).not.toContain("See more")
      expect(container.textContent).not.toContain("Show less")
    } finally {
      if (descriptor) {
        Object.defineProperty(HTMLElement.prototype, "offsetHeight", descriptor)
      } else {
        delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight
      }
    }
  })

  it("shows an empty state when the view has no records", async () => {
    const loadPage = vi.fn(async (offset: number, limit: number) =>
      page(offset, limit, [], 0)
    )
    await act(async () => {
      root.render(
        <EidosFileFeedView table={table} view={view} loadPage={loadPage} />
      )
      await Promise.resolve()
    })
    expect(container.textContent).toContain("No records in this view.")
  })
})

describe("eidosFileFeedPlugin", () => {
  it("registers a Feed view with no required setup", () => {
    const contribution = eidosFileFeedPlugin.views[0]
    expect(contribution?.type).toBe("feed")
    expect(contribution?.create?.defaultName).toBe("Feed")
  })

  it("sorts by created time when the view has no explicit sorts", async () => {
    const getPage = vi.fn(async (offset: number, limit: number) =>
      page(offset, limit, [firstRow], 1)
    )
    const source = {
      getPage,
    } as unknown as EidosFileEditorDataSource
    const external = document.createElement("div")
    document.body.appendChild(external)
    const externalRoot = createRoot(external)
    await act(async () => {
      externalRoot.render(
        <EidosFileEditorView
          source={source}
          table={table}
          view={view}
          plugins={[eidosFileFeedPlugin]}
        />
      )
      await Promise.resolve()
    })
    expect(getPage).toHaveBeenCalledTimes(1)
    const call = getPage.mock.calls[0] as unknown as [
      string,
      number,
      number,
      { sorts?: Array<{ field: string; direction: string }> },
      unknown,
      unknown,
      { columns: string[] },
    ]
    expect(call[3].sorts).toEqual([{ field: CREATED_ID, direction: "desc" }])
    expect(call[6].columns).toContain("notes")
    await act(async () => externalRoot.unmount())
    external.remove()
  })
})
