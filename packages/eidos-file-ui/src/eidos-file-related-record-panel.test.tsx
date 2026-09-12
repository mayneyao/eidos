// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileTableSnapshot,
  RecordNeighbors,
} from "@eidos.space/eidos-file"

import type { EidosFileEditorDataSource } from "./data-source"
import { EidosFileRelatedRecordPanel } from "./eidos-file-related-record-panel"

const ADA_ID = "0198c72d-82b5-7968-b163-98be4b7477df"
const now = "2026-08-19T00:00:00.000Z"

const table: EidosFileTableSnapshot = {
  table: {
    id: "people",
    name: "People",
    rawTableName: "tb_people",
    position: 0,
    icon: null,
    description: null,
    createdAt: now,
    updatedAt: now,
  },
  fields: [
    {
      id: "name-field",
      tableId: "people",
      name: "Name",
      type: "text",
      tableName: "tb_people",
      tableColumnName: "name",
      property: null,
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      isRecordLabel: true,
      sourceTableColumnName: null,
      dependsOn: null,
    },
  ],
  views: [],
  rowCount: 1,
}

describe("EidosFileRelatedRecordPanel", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("loads the linked row by stable table and row identity", async () => {
    const getRow = vi.fn(async () => ({ _id: ADA_ID, name: "Ada Lovelace" }))
    const onClose = vi.fn()
    const source = {
      getRow,
      updateRow: vi.fn(),
    } as unknown as EidosFileEditorDataSource

    await act(async () => {
      root.render(
        <EidosFileRelatedRecordPanel
          source={source}
          table={table}
          target={{
            tableId: "people",
            rowId: ADA_ID,
            title: "Ada Lovelace",
          }}
          onClose={onClose}
        />
      )
    })

    await vi.waitFor(() => {
      expect(getRow).toHaveBeenCalledWith("people", ADA_ID)
      expect(
        container.querySelector(
          '[aria-label="Record details for Ada Lovelace"]'
        )
      ).not.toBeNull()
    })

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Close record details"]')
        ?.click()
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("keeps complete content mounted during navigation and retries the requested row", async () => {
    const pending = new Map<
      string,
      (row: { _id: string; name: string } | null) => void
    >()
    const getRow = vi.fn(
      (_table: string, id: string) =>
        new Promise<{ _id: string; name: string } | null>((resolve) =>
          pending.set(id, resolve)
        )
    )
    const source = {
      getRow,
      updateRow: vi.fn(),
    } as unknown as EidosFileEditorDataSource
    const render = async (rowId: string) =>
      act(async () => {
        root.render(
          <EidosFileRelatedRecordPanel
            source={source}
            table={{ ...table, fields: [...table.fields] }}
            target={{ tableId: "people", rowId, title: "" }}
            onClose={() => {}}
          />
        )
      })
    await render("a")
    await act(async () => pending.get("a")!({ _id: "a", name: "Alice" }))
    const title = container.querySelector("h2")
    expect(container.textContent).toContain("Alice")
    await render("b")
    expect(container.querySelector("h2")).toBe(title)
    expect(container.textContent).toContain("Alice")
    expect(container.textContent).not.toContain("Loading record details")
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    await render("c")
    await act(async () => pending.get("c")!({ _id: "c", name: "Carol" }))
    await act(async () => pending.get("b")!({ _id: "b", name: "Bob" }))
    expect(container.textContent).toContain("Carol")
    expect(container.textContent).not.toContain("Bob")
    await render("c")
    expect(getRow).toHaveBeenCalledTimes(3)
    await render("missing")
    await act(async () => pending.get("missing")!(null))
    expect(container.textContent).toContain("Record no longer exists")
    await act(async () =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Retry")!
        .click()
    )
    expect(getRow).toHaveBeenLastCalledWith("people", "missing")
    await act(async () =>
      pending.get("missing")!({ _id: "missing", name: "Recovered" })
    )
    expect(container.textContent).toContain("Recovered")
  })

  it("invalidates changed queries and ignores late neighbor results", async () => {
    const pending: Array<(result: RecordNeighbors) => void> = []
    const getRecordNeighbors = vi.fn(
      () => new Promise<RecordNeighbors>((resolve) => pending.push(resolve))
    )
    const source = {
      getRow: vi.fn(async () => ({ _id: ADA_ID, name: "Ada" })),
      getRecordNeighbors,
    } as unknown as EidosFileEditorDataSource
    const onNavigate = vi.fn()
    const render = async (search: string) =>
      act(async () => {
        root.render(
          <EidosFileRelatedRecordPanel
            source={source}
            table={table}
            target={{ tableId: "people", rowId: ADA_ID, title: "Ada" }}
            query={{ search }}
            onNavigate={onNavigate}
            onClose={() => {}}
          />
        )
      })
    const next = () =>
      container.querySelector<HTMLButtonElement>('[aria-label="Next record"]')!
    await render("first")
    await act(async () =>
      pending[0]!({ found: true, previousId: null, nextId: "old" })
    )
    expect(next().disabled).toBe(false)
    await render("second")
    expect(next().disabled).toBe(true)
    await render("third")
    await act(async () =>
      pending[2]!({ found: true, previousId: null, nextId: "latest" })
    )
    await act(async () =>
      pending[1]!({ found: true, previousId: null, nextId: "stale" })
    )
    await act(async () => next().click())
    expect(onNavigate).toHaveBeenLastCalledWith("latest")
    await render("third")
    expect(getRecordNeighbors).toHaveBeenCalledTimes(3)
    await render("excluded")
    await act(async () => pending[3]!({ found: false }))
    expect(next().disabled).toBe(true)
  })

  it("navigates to neighbours in the active query order", async () => {
    const getRow = vi.fn(async (_tableId: string, rowId: string) => ({
      _id: rowId,
      name: `Row ${rowId}`,
    }))
    const getRecordNeighbors = vi.fn(
      async function (this: EidosFileEditorDataSource) {
        expect(this).toBe(source)
        return { found: true, previousId: "previous-id", nextId: "next-id" }
      }
    )
    const getPage = vi.fn(async (_tableId: string, offset: number) => ({
      tableId: "people",
      offset,
      limit: 1,
      total: 3,
      rows: [
        { _id: offset === 2 ? "next-id" : "previous-id", name: "Neighbour" },
      ],
    }))
    const onNavigate = vi.fn()
    const source = {
      getRow,
      getRecordNeighbors,
      getPage,
      updateRow: vi.fn(),
    } as unknown as EidosFileEditorDataSource

    await act(async () => {
      root.render(
        <EidosFileRelatedRecordPanel
          source={source}
          table={table}
          target={{ tableId: "people", rowId: ADA_ID, title: "Ada Lovelace" }}
          query={{}}
          onNavigate={onNavigate}
          onClose={vi.fn()}
        />
      )
    })

    await vi.waitFor(() => {
      expect(
        container.querySelector('[aria-label="Next record"]')
      ).not.toBeNull()
    })
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Next record"]')
        ?.click()
    })
    await vi.waitFor(() => {
      expect(getRecordNeighbors).toHaveBeenCalledWith("people", ADA_ID, {})
      expect(onNavigate).toHaveBeenCalledWith("next-id")
      expect(getPage).not.toHaveBeenCalled()
    })
  })
})
