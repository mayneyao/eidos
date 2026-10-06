import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"
import type {
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "./data-source"
import { EidosFileUIProvider } from "./context"
import { MobileViewSettings } from "./mobile-view-settings"
import { useMobilePlugins } from "./mobile-plugins"

vi.mock("../../mobile-plugin-host/src/validate", () => ({
  validatePackage: vi.fn(),
}))

it("edits plugin configuration inside the one mobile settings sheet and preserves other properties", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const request = vi.fn().mockResolvedValue([
    {
      manifest: {
        id: "local.chart",
        name: "Chart",
        views: [
          {
            id: "chart",
            title: "Chart",
            kind: "file",
            capabilities: ["eidos/table"],
            configuration: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  title: "Chart type",
                  default: "Column",
                  enum: ["Column", "Line"],
                },
                legend: {
                  type: "boolean",
                  title: "Show legend",
                  default: true,
                },
              },
            },
          },
        ],
        placements: [{ location: "table/view", view: "chart" }],
      },
      modules: {},
    },
  ])
  const view: EidosFileViewInfo = {
    id: "v",
    name: "Chart",
    type: "plugin:local.chart/chart",
    tableId: "t",
    query: "",
    properties: { preserved: "keep", plugin: { legend: false } },
    filter: null,
    sorts: [],
    orderMap: null,
    hiddenFields: [],
    position: 0,
    createdAt: "",
    updatedAt: "",
  }
  const table: EidosFileTableSnapshot = {
    table: {
      id: "t",
      name: "Items",
      rawTableName: "tb_items",
      position: 0,
      icon: null,
      description: null,
      createdAt: "",
      updatedAt: "",
    },
    fields: [],
    views: [view],
    rowCount: 0,
  }
  const updateView = vi.fn().mockResolvedValue({ tables: [table] })
  const onSnapshot = vi.fn()
  function Harness() {
    const plugins = useMobilePlugins(request)
    return (
      <EidosFileUIProvider interactionMode="mobile" locale="zh">
        <MobileViewSettings
          source={{ updateView } as unknown as EidosFileEditorDataSource}
          table={table}
          tables={[table]}
          view={view}
          plugin={plugins[0]?.views?.[0]}
          onSnapshot={onSnapshot}
        />
      </EidosFileUIProvider>
    )
  }
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<Harness />))
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="视图设置"]')!.click()
    )
    expect(document.querySelector('[aria-label="Chart type"]')).toBeNull()
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="布局设置"]')!
        .click()
    )
    const section = document.querySelector<HTMLElement>(
      ".eidos-mobile-plugin-settings"
    )!
    expect(section).not.toBeNull()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    expect(document.querySelector('[aria-label="View settings"]')).toBeNull()
    expect(section.querySelector("select")).toBeNull()
    const choice = section.querySelector<HTMLButtonElement>(
      '[aria-label="Chart type"]'
    )!
    expect(choice.textContent).toContain("Column")
    expect(section.querySelector('[role="switch"]')).not.toBeNull()
    await act(async () => choice.click())
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
    await act(async () => {
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "Line")!
        .click()
      await vi.waitFor(() => expect(updateView).toHaveBeenCalledOnce())
    })
    expect(updateView).toHaveBeenCalledWith("v", {
      properties: {
        preserved: "keep",
        plugin: { legend: false, type: "Line" },
      },
    })
    expect(onSnapshot).toHaveBeenCalledOnce()
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
