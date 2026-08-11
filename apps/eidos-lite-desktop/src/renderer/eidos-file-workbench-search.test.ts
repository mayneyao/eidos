// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileSnapshot } from "@eidos.space/eidos-file"

import {
  RUNTIME_MUTATION_METHODS,
  type EidosLiteApi,
} from "../shared/contracts"

vi.mock("@eidos.space/eidos-file-ui/plugins/csv-import", () => ({
  createEidosFileCsvImportPlugin: () => ({ id: "test.csv-import" }),
}))
vi.mock("@eidos.space/eidos-file-ui/plugins/gallery", () => ({
  eidosFileGalleryPlugin: { id: "test.gallery" },
}))
vi.mock("@eidos.space/eidos-file-ui/plugins/kanban", () => ({
  eidosFileKanbanPlugin: { id: "test.kanban" },
}))

vi.mock("@eidos.space/eidos-file-ui", async () => {
  const React = await import("react")
  const actual = await import("../../../../packages/eidos-file-ui/src/index.ts")
  const Empty = () => null
  function SearchResultReporter() {
    const navigation = actual.useEidosFileSearchNavigation()
    const { activateUrl } = actual.useEidosFileUI()
    return React.createElement(
      React.Fragment,
      null,
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
        "span",
        { "data-testid": "active-search-result" },
        String(navigation?.searchResultIndex ?? "none")
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
      fields: [],
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
  ],
}

describe("Eidos Lite Eidos File search navigation", () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

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
      value: { callRuntime } as unknown as EidosLiteApi,
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
      value: { openExternalUrl } as unknown as EidosLiteApi,
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
})
