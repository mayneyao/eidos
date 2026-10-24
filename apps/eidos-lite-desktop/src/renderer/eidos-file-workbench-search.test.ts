// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"

import {
  RUNTIME_MUTATION_METHODS,
  type EidosLiteApi,
} from "../shared/contracts"
const observeAssetSession = vi.hoisted(() =>
  vi.fn<(session: unknown) => void>()
)

vi.mock("@eidos.space/eidos-file-ui/plugins/csv-import", () => ({
  createEidosFileCsvImportPlugin: () => ({ id: "test.csv-import" }),
}))
vi.mock("@eidos.space/eidos-file-ui/plugins/gallery", () => ({
  eidosFileGalleryPlugin: { id: "test.gallery" },
}))
vi.mock("@eidos.space/eidos-file-ui/plugins/kanban", () => ({
  eidosFileKanbanPlugin: { id: "test.kanban" },
}))
vi.mock("@eidos.space/eidos-file-ui/plugins/calendar", () => ({
  eidosFileCalendarPlugin: { id: "test.calendar" },
}))
vi.mock("@eidos.space/eidos-file-ui/plugins/feed", () => ({
  eidosFileFeedPlugin: { id: "test.feed" },
}))

vi.mock("@eidos.space/eidos-file-ui", async () => {
  const React = await import("react")
  const actual = await import("../../../../packages/eidos-file-ui/src/index.ts")
  const Empty = () => null
  function SearchResultReporter({ view }: { view?: { id: string } }) {
    const navigation = actual.useEidosFileSearchNavigation()
    const {
      activateUrl,
      markdownEditingMode,
      openRelationRecord,
      assetSession,
    } = actual.useEidosFileUI()
    observeAssetSession(assetSession)
    return React.createElement(
      React.Fragment,
      null,
      React.createElement("span", { "data-testid": "selected-view" }, view?.id),
      React.createElement(
        "button",
        {
          type: "button",
          onClick: () => navigation?.reportSearchResultCount(3),
        },
        "Report search results"
      ),
      React.createElement(
        "button",
        {
          type: "button",
          disabled: !activateUrl,
          onClick: () => activateUrl?.("https://example.com/image.png"),
        },
        "Open URL through host"
      ),
      React.createElement(
        "button",
        {
          type: "button",
          disabled: !openRelationRecord,
          onClick: () =>
            openRelationRecord?.({
              tableId: "people",
              rowId: "ada",
              title: "Ada Lovelace",
            }),
        },
        "Open related record through host"
      ),
      React.createElement(
        "span",
        { "data-testid": "active-search-result" },
        String(navigation?.searchResultIndex ?? "none")
      ),
      React.createElement(
        "span",
        { "data-testid": "content-editing-mode" },
        markdownEditingMode
      )
    )
  }
  function RelatedRecordReporter({
    target,
    onClose,
  }: {
    target: { tableId: string; rowId: string; title: string }
    onClose: () => void
  }) {
    return React.createElement(
      "aside",
      { "data-testid": "related-record-panel" },
      `${target.tableId}:${target.rowId}:${target.title}`,
      React.createElement(
        "button",
        { type: "button", onClick: onClose },
        "Close related record"
      )
    )
  }
  function SheetTabsReporter({
    onReorder,
  }: {
    onReorder?: (tableIds: string[]) => Promise<void> | void
  }) {
    return React.createElement(
      "button",
      {
        type: "button",
        disabled: !onReorder,
        onClick: () => onReorder?.(["tasks"]),
      },
      "Reorder tables through host"
    )
  }
  return {
    ...actual,
    EidosFileEditorView: SearchResultReporter,
    EidosFileFieldCreatePopover: Empty,
    EidosFileFormulaEditorPopover: Empty,
    EidosFileLookupEditorPopover: Empty,
    EidosFilePluginSlot: Empty,
    EidosFileRelatedRecordPanel: RelatedRecordReporter,
    EidosFileSheetCreatePopover: Empty,
    EidosFileSheetTabs: SheetTabsReporter,
    EidosFileViewFieldsPopover: Empty,
    EidosFileViewTabs: Empty,
  }
})

import { EidosFileWorkbench } from "./eidos-file-workbench"
import { IpcEidosFileDataSource } from "./ipc-data-source"

const now = "2026-07-31T00:00:00.000Z"
const snapshot: EidosFileSnapshot = {
  path: "sample.eidos",
  metadata: {
    format: "eidos-file",
    fileId: "0198c72d-82b5-7968-b163-98be4b7477df",
    formatVersion: "1.0",
    schemaVersion: 1,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  },
  tables: [
    {
      table: {
        id: "tasks",
        name: "Tasks",
        rawTableName: "tasks",
        position: 0,
        icon: null,
        description: null,
        createdAt: now,
        updatedAt: now,
      },
      fields: [
        {
          id: "title",
          tableId: "tasks",
          name: "Title",
          type: "text",
          tableName: "tasks",
          tableColumnName: "Title",
          physicalName: "Title",
          isRecordLabel: true,
          position: 0,
          settings: {},
          property: null,
          storageCodec: "scalar",
          valueKind: "source",
          isHidden: false,
          isDerived: false,
          sourceTableColumnName: "Title",
          dependsOn: null,
        },
      ],
      views: [
        {
          id: "grid",
          name: "Grid",
          type: "grid",
          tableId: "tasks",
          query: "",
          properties: null,
          filter: null,
          sorts: [],
          orderMap: null,
          hiddenFields: [],
          position: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
      rowCount: 3,
    },
    {
      table: {
        id: "people",
        name: "People",
        rawTableName: "people",
        position: 1,
        icon: null,
        description: null,
        createdAt: now,
        updatedAt: now,
      },
      fields: [],
      views: [],
      rowCount: 1,
    },
  ],
}

describe("Eidos Lite Eidos File search navigation", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        listPlugins: vi.fn(async () => ({ plugins: [], space: null })),
        onPluginEvent: vi.fn(() => () => {}),
      },
    })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    Reflect.deleteProperty(window, "eidosLite")
  })

  it("keeps the asset session across preview navigation and revalidates it on file refresh", async () => {
    const source = new IpcEidosFileDataSource("preview-runtime", snapshot)
    const props = {
      relativePath: "sample.eidos",
      snapshot,
      source,
      activeTableId: "tasks",
      disabled: false,
      theme: "light" as const,
      onTableSelect: vi.fn(),
      onSnapshot: vi.fn(),
      onError: vi.fn(),
    }
    await act(async () => root.render(createElement(EidosFileWorkbench, props)))
    const original = observeAssetSession.mock.lastCall?.[0]
    expect(original).toBeTruthy()
    // Opening a file replaces the editor; returning reuses its cached Runtime.
    await act(async () =>
      root.render(createElement("div", null, "File preview"))
    )
    await act(async () => root.render(createElement(EidosFileWorkbench, props)))
    expect(observeAssetSession.mock.lastCall?.[0]).toBe(original)
    await act(async () =>
      root.render(
        createElement(EidosFileWorkbench, { ...props, refreshToken: 1 })
      )
    )
    expect(observeAssetSession.mock.lastCall?.[0]).toBe(original)
    expect(original).toMatchObject({ thumbnailRevision: 1 })
    const refreshed = observeAssetSession.mock.lastCall?.[0]
    // A different Runtime may have the same ID string after reconnecting.
    await act(async () =>
      root.render(
        createElement(EidosFileWorkbench, {
          ...props,
          source: new IpcEidosFileDataSource("preview-runtime", snapshot),
          refreshToken: 1,
        })
      )
    )
    expect(observeAssetSession.mock.lastCall?.[0]).not.toBe(refreshed)
  })

  it.each([
    [undefined, "gallery"],
    ["grid", "grid"],
    ["deleted-view", "gallery"],
  ])(
    "resolves requested view %s to %s in saved order",
    (activeViewId, expected) => {
      const firstTable = snapshot.tables[0]!
      const grid = firstTable.views[0]!
      const reordered: EidosFileSnapshot = {
        ...snapshot,
        tables: [
          {
            ...firstTable,
            views: [
              {
                ...grid,
                id: "gallery",
                name: "Gallery",
                type: "gallery",
                position: 0,
              },
              { ...grid, position: 1 },
            ],
          },
          ...snapshot.tables.slice(1),
        ],
      }
      act(() => {
        root.render(
          createElement(EidosFileWorkbench, {
            relativePath: "sample.eidos",
            snapshot: reordered,
            source: {} as IpcEidosFileDataSource,
            activeTableId: "tasks",
            activeViewId,
            onViewSelect: vi.fn(),
            disabled: false,
            theme: "light",
            onTableSelect: vi.fn(),
            onSnapshot: vi.fn(),
            onError: vi.fn(),
          })
        )
      })
      expect(
        host.querySelector('[data-testid="selected-view"]')?.textContent
      ).toBe(expected)
    }
  )

  it("cycles and highlights filtered records with Enter and Shift+Enter", () => {
    act(() => {
      root.render(
        createElement(EidosFileWorkbench, {
          relativePath: "sample.eidos",
          snapshot,
          source: {} as IpcEidosFileDataSource,
          activeTableId: "tasks",
          disabled: false,
          theme: "light",
          onTableSelect: vi.fn(),
          onSnapshot: vi.fn(),
          onError: vi.fn(),
        })
      )
    })

    act(() => {
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="Search Eidos File rows"]'
        )
        ?.click()
    })
    const input = host.querySelector<HTMLInputElement>(
      'input[placeholder="Search rows"]'
    )
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setter?.call(input, "roadmap")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    })
    act(() => {
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Report search results")
        ?.click()
    })

    expect(host.textContent).toContain("1 of 3")
    expect(
      host.querySelector('[data-testid="active-search-result"]')?.textContent
    ).toBe("0")
    expect(
      host.querySelector('[data-testid="content-editing-mode"]')?.textContent
    ).toBe("wysiwyg")

    act(() => {
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    expect(host.textContent).toContain("2 of 3")
    expect(
      host.querySelector('[data-testid="active-search-result"]')?.textContent
    ).toBe("1")

    act(() => {
      input?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
        })
      )
    })
    expect(host.textContent).toContain("1 of 3")
    expect(
      host.querySelector('[data-testid="active-search-result"]')?.textContent
    ).toBe("0")
  })

  it("leaves directory breadcrumbs to the host title bar without adding a content row", () => {
    act(() =>
      root.render(
        createElement(EidosFileWorkbench, {
          relativePath: ".eidos/files.eidos",
          metadataDirectory: "business",
          snapshot,
          source: {} as IpcEidosFileDataSource,
          activeTableId: "tasks",
          disabled: false,
          theme: "light",
          onTableSelect: vi.fn(),
          onSnapshot: vi.fn(),
          onError: vi.fn(),
        })
      )
    )
    const shell = host.querySelector("[data-eidos-file-editor-shell]")!
    expect(shell).not.toBeNull()
    expect(
      shell.querySelector('nav[aria-label="File management folder"]')
    ).toBeNull()
    expect(shell.children[1]?.classList.contains("flex-1")).toBe(true)
  })

  it("connects shared table-tab sorting to the Lite data source", async () => {
    const callRuntime = vi.fn(
      async (_sessionId: string, method: string): Promise<unknown> => {
        if (method === "reorderTables" || method === "getSnapshot") {
          return snapshot
        }
        throw new Error(`Unexpected runtime method: ${method}`)
      }
    )
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: { ...window.eidosLite, callRuntime } as unknown as EidosLiteApi,
    })
    const onSnapshot = vi.fn()
    const source = new IpcEidosFileDataSource("session-1", snapshot, onSnapshot)

    expect(RUNTIME_MUTATION_METHODS).toContain("reorderTables")

    await act(async () => {
      root.render(
        createElement(EidosFileWorkbench, {
          relativePath: "sample.eidos",
          snapshot,
          source,
          activeTableId: "tasks",
          disabled: false,
          theme: "light",
          onTableSelect: vi.fn(),
          onSnapshot,
          onError: vi.fn(),
        })
      )
    })

    const reorder = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Reorder tables through host"
    )
    expect(reorder?.disabled).toBe(false)

    await act(async () => {
      reorder?.click()
      await Promise.resolve()
    })

    expect(callRuntime).toHaveBeenNthCalledWith(
      1,
      "session-1",
      "reorderTables",
      [["tasks"]]
    )
    expect(callRuntime).toHaveBeenNthCalledWith(
      2,
      "session-1",
      "getSnapshot",
      []
    )
    expect(onSnapshot).toHaveBeenCalledWith(snapshot)
  })

  it("connects shared URL activation to the Lite host", async () => {
    const openExternalUrl = vi.fn(async () => undefined)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        ...window.eidosLite,
        openExternalUrl,
      } as unknown as EidosLiteApi,
    })

    await act(async () => {
      root.render(
        createElement(EidosFileWorkbench, {
          relativePath: "sample.eidos",
          snapshot,
          source: {} as IpcEidosFileDataSource,
          activeTableId: "tasks",
          disabled: false,
          theme: "light",
          onTableSelect: vi.fn(),
          onSnapshot: vi.fn(),
          onError: vi.fn(),
        })
      )
    })

    const openUrl = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Open URL through host"
    )
    expect(openUrl?.disabled).toBe(false)

    await act(async () => {
      openUrl?.click()
      await Promise.resolve()
    })

    expect(openExternalUrl).toHaveBeenCalledWith(
      "https://example.com/image.png"
    )
  })

  it("opens a related record in the Lite detail panel", async () => {
    await act(async () => {
      root.render(
        createElement(EidosFileWorkbench, {
          relativePath: "sample.eidos",
          snapshot,
          source: {} as IpcEidosFileDataSource,
          activeTableId: "tasks",
          disabled: false,
          theme: "light",
          onTableSelect: vi.fn(),
          onSnapshot: vi.fn(),
          onError: vi.fn(),
        })
      )
    })

    act(() => {
      Array.from(host.querySelectorAll("button"))
        .find(
          (button) => button.textContent === "Open related record through host"
        )
        ?.click()
    })

    expect(
      host.querySelector('[data-testid="related-record-panel"]')?.textContent
    ).toContain("people:ada:Ada Lovelace")

    act(() => {
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent === "Close related record")
        ?.click()
    })
    expect(
      host.querySelector('[data-testid="related-record-panel"]')
    ).toBeNull()
  })
})
