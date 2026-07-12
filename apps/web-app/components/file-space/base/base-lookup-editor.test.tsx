// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseFieldInfo, BaseTableSnapshot } from "@eidos.space/base"

import { BaseLookupEditor } from "./base-lookup-editor"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const titleField: BaseFieldInfo = {
  name: "title",
  type: "title",
  tableName: "tb_people",
  tableColumnName: "title",
  property: null,
  storageCodec: "scalar",
  valueKind: "system",
  isHidden: false,
  isDerived: false,
  sourceTableColumnName: null,
  dependsOn: null,
}
const relationField: BaseFieldInfo = {
  ...titleField,
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
}
const lookupField: BaseFieldInfo = {
  ...titleField,
  name: "Owner count",
  type: "lookup",
  tableName: "tb_projects",
  tableColumnName: "owner_count",
  property: {
    relationField: "owners",
    targetField: "title",
    aggregate: "count",
    displayType: "number",
  },
  valueKind: "derived",
  isDerived: true,
  dependsOn: ["owners"],
}
const people: BaseTableSnapshot = {
  table: {
    id: "people",
    name: "People",
    rawTableName: "tb_people",
    position: 1,
    icon: null,
    description: null,
    createdAt: "2026-07-12",
    updatedAt: "2026-07-12",
  },
  fields: [titleField],
  views: [],
  rowCount: 0,
}

describe("BaseLookupEditor", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("updates lookup settings inside an anchored popover", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    await act(async () => {
      root.render(
        <BaseLookupEditor
          field={lookupField}
          fields={[relationField, lookupField]}
          tables={[people]}
          open
          onOpenChange={vi.fn()}
          onSave={onSave}
        />
      )
    })
    expect(document.body.querySelector('[aria-modal="true"]')).toBeNull()
    await act(async () => {
      document.body
        .querySelector("form")
        ?.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        )
      await Promise.resolve()
    })
    expect(onSave).toHaveBeenCalledWith({
      relationField: "owners",
      targetField: "title",
      aggregate: "count",
      displayType: "number",
    })
  })
})
