// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileTableSnapshot } from "@eidos.space/eidos-file"

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
})
