import React, { act } from "react"
import { createRoot } from "react-dom/client"
import type {
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "./data-source"
import { MobileFields } from "./mobile-fields"
import { EidosFileUIProvider } from "./context"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const table: EidosFileTableSnapshot = {
  table: {
    id: "table",
    name: "Tasks",
    rawTableName: "tasks",
    position: 0,
    icon: null,
    description: null,
    createdAt: "",
    updatedAt: "",
  },
  fields: [
    {
      id: "status",
      tableId: "table",
      name: "Status",
      type: "select",
      tableName: "tasks",
      tableColumnName: "status",
      property: { options: [{ name: "Open", color: "blue" }] },
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
  ],
  views: [],
  rowCount: 0,
}
const view: EidosFileViewInfo = {
  id: "grid",
  tableId: "table",
  name: "Grid",
  type: "grid",
  hiddenFields: [],
  orderMap: {},
  properties: {},
  query: "{}",
  filter: null,
  sorts: [],
  position: 0,
  createdAt: "",
  updatedAt: "",
}

it("keeps the field list mounted while navigating to properties and back", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const source = {} as EidosFileEditorDataSource
  const click = async (label: string) => {
    const button = document.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`
    )
    expect(button).not.toBeNull()
    await act(async () => {
      button!.click()
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
  }
  try {
    await act(async () => {
      root.render(
        <EidosFileUIProvider interactionMode="mobile">
          <MobileFields
            source={source}
            table={table}
            tables={[table]}
            view={view}
            onSnapshot={() => {}}
          />
        </EidosFileUIProvider>
      )
    })
    await click("Manage fields")
    const search = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search fields"]'
    )!
    const list = document.querySelector(".eidos-mobile-fields-list")!
    await click("Edit Status properties")
    expect(
      document.querySelector('[data-eidos-file-detail-panel="field"]')
    ).not.toBeNull()
    expect(list.hasAttribute("hidden")).toBe(true)
    await click("Back")
    expect(
      document.querySelector('[data-eidos-file-detail-panel="field"]')
    ).toBeNull()
    expect(list.hasAttribute("hidden")).toBe(false)
    expect(document.querySelector('input[aria-label="Search fields"]')).toBe(
      search
    )
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
