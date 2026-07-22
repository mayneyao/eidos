// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import {
  decodeEidosFileRelationIds,
  encodeEidosFileRelationIds,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileRecordRelationEditor } from "./eidos-file-record-relation-editor"

const ADA_ID = "0198c72d-82b5-7968-b163-98be4b7477df"
const GRACE_ID = "0198c72d-82b5-7969-8163-98be4b7477df"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const field: EidosFileFieldInfo = {
  id: "0198c72d-82b5-7000-8000-000000000001",
  tableId: "0198c72d-82b5-7000-8000-000000000010",
  name: "Owners",
  type: "relation",
  tableName: "tb_projects",
  tableColumnName: "owners",
  property: {
    targetTableId: "people",
    targetField: "title",
    multiple: true,
  },
  storageCodec: "relation",
  valueKind: "relation",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}

describe("EidosFileRecordRelationEditor", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("searches and links records by stable row id", async () => {
    const onChange = vi.fn(async (_value: string | null) => undefined)
    const onSearch = vi.fn(async () => [
      { id: ADA_ID, title: "Ada Lovelace" },
      { id: GRACE_ID, title: "Grace Hopper" },
    ])
    await act(async () => {
      root.render(
        <EidosFileRecordRelationEditor
          row={{
            _id: "project_1",
            owners: encodeEidosFileRelationIds([ADA_ID]),
            owners__display: JSON.stringify([
              { id: ADA_ID, title: "Ada Lovelace" },
            ]),
          }}
          field={field}
          disabled={false}
          onChange={onChange}
          onSearch={onSearch}
        />
      )
    })

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Owners"]')
        ?.click()
    })
    await act(async () => {
      await vi.waitFor(() => expect(onSearch).toHaveBeenCalledWith(field, ""), {
        interval: 5,
        timeout: 1_000,
      })
    })
    await act(async () => {
      Array.from(document.body.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Grace Hopper"))
        ?.click()
      await Promise.resolve()
    })

    expect(decodeEidosFileRelationIds(onChange.mock.calls[0]?.[0])).toEqual([
      ADA_ID,
      GRACE_ID,
    ])
  })

  it("uses a readable state instead of exposing an unresolved row id", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordRelationEditor
          row={{
            _id: "project_1",
            owners: encodeEidosFileRelationIds([ADA_ID]),
            owners__display: "[]",
          }}
          field={field}
          disabled={false}
          onChange={vi.fn(async () => undefined)}
          onSearch={vi.fn(async () => [])}
        />
      )
    })

    const trigger = container.querySelector<HTMLButtonElement>(
      '[aria-label="Owners"]'
    )
    expect(trigger?.textContent).toContain("Unavailable record")
    expect(trigger?.textContent).not.toContain(ADA_ID)
  })
})
