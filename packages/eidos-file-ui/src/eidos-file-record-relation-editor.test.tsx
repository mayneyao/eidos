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

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const field: EidosFileFieldInfo = {
  name: "Owners",
  type: "link",
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
      { id: "person_1", title: "Ada Lovelace" },
      { id: "person_2", title: "Grace Hopper" },
    ])
    await act(async () => {
      root.render(
        <EidosFileRecordRelationEditor
          row={{
            _id: "project_1",
            owners: encodeEidosFileRelationIds(["person_1"]),
            owners__display: JSON.stringify([
              { id: "person_1", title: "Ada Lovelace" },
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
      "person_1",
      "person_2",
    ])
  })
})
