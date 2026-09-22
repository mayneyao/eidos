import { describe, expect, it, vi } from "vitest"
import type { EidosFileViewRendererProps } from "@eidos.space/eidos-file-ui"
import type { PluginRequest } from "@eidos.space/plugin-runtime/rpc"
import { tableViewRequest } from "./plugin-table-view"
const request = (
  method: PluginRequest["method"],
  params: unknown = null
): PluginRequest => ({
  protocol: "eidos-plugin",
  apiVersion: 1,
  id: "1",
  method,
  params,
})
function fixture() {
  const source = {
    readTablePluginConfig: vi
      .fn()
      .mockResolvedValue({ value: null, version: "null" }),
    writeTablePluginConfig: vi
      .fn()
      .mockResolvedValue({ value: {}, version: "{}" }),
    getSnapshot: vi.fn().mockResolvedValue({ tables: [] }),
    getPage: vi.fn().mockResolvedValue({ rows: [] }),
    updateView: vi.fn().mockResolvedValue({ tables: [] }),
    getRow: vi.fn().mockResolvedValue({ _id: "row" }),
    aggregateTable: vi.fn().mockResolvedValue({ items: [], totalRecords: 0 }),
  }
  const props = {
    table: { table: { id: "bound-table" }, fields: [] },
    view: { id: "bound-view", properties: { preserved: true } },
    source,
    query: { search: "host search" },
    capabilities: { mutate: true },
    onSnapshot: vi.fn(),
    onInspectedRowChange: vi.fn(),
  } as unknown as EidosFileViewRendererProps
  return { props, source }
}
describe("table view bridge", () => {
  it("binds config to the host table and plugin and rejects scope overrides", async () => {
    const { props, source } = fixture()
    await tableViewRequest(
      props,
      request("table.pluginConfig.read"),
      undefined,
      "eidos.smart-actions"
    )
    expect(source.readTablePluginConfig).toHaveBeenCalledWith(
      "bound-table",
      "eidos.smart-actions"
    )
    await tableViewRequest(
      props,
      request("table.pluginConfig.write", {
        value: {},
        expectedVersion: "null",
      }),
      undefined,
      "eidos.smart-actions"
    )
    expect(source.writeTablePluginConfig).toHaveBeenCalledWith(
      "bound-table",
      "eidos.smart-actions",
      { value: {}, expectedVersion: "null" }
    )
    await expect(
      tableViewRequest(
        props,
        request("table.pluginConfig.write", {
          value: {},
          expectedVersion: "null",
          pluginId: "other.plugin",
        }),
        undefined,
        "eidos.smart-actions"
      )
    ).rejects.toThrow("Invalid")
    await expect(
      tableViewRequest(
        { ...props, disabled: true },
        request("table.pluginConfig.write", {
          value: {},
          expectedVersion: "null",
        }),
        undefined,
        "eidos.smart-actions"
      )
    ).rejects.toThrow("read-only")
    expect(source.writeTablePluginConfig).toHaveBeenCalledTimes(1)
  })
  it("resolves defaults without writing and validates configured values", async () => {
    const { props, source } = fixture()
    const schema = {
      type: "object" as const,
      properties: {
        zoom: {
          type: "number" as const,
          title: "Zoom",
          default: 5,
          minimum: 0,
          maximum: 20,
        },
      },
    }
    expect(
      await tableViewRequest(props, request("table.read"), schema)
    ).toMatchObject({ view: { properties: { plugin: { zoom: 5 } } } })
    expect(source.updateView).not.toHaveBeenCalled()
    await expect(
      tableViewRequest(props, request("table.properties", { zoom: 30 }), schema)
    ).rejects.toThrow()
    await tableViewRequest(
      props,
      request("table.properties", { zoom: 10 }),
      schema
    )
    expect(source.updateView).toHaveBeenCalledWith("bound-view", {
      properties: { preserved: true, plugin: { zoom: 10 } },
    })
  })
  it("queries only the bound table with host filters and rejects guest table overrides", async () => {
    const { props, source } = fixture()
    await tableViewRequest(
      props,
      request("table.page", { offset: 0, limit: 100 })
    )
    expect(source.getPage).toHaveBeenCalledWith(
      "bound-table",
      0,
      100,
      props.query
    )
    for (const params of [
      { offset: -1, limit: 100 },
      { offset: 0, limit: 1001 },
      { offset: 0, limit: 100, tableId: "other" },
    ])
      await expect(
        tableViewRequest(props, request("table.page", params))
      ).rejects.toThrow()
    expect(source.getPage).toHaveBeenCalledTimes(1)
  })
  it("updates only the bound view plugin properties and honors read-only hosts", async () => {
    const { props, source } = fixture()
    await tableViewRequest(
      props,
      request("table.properties", { latitude: "lat" })
    )
    expect(source.updateView).toHaveBeenCalledWith("bound-view", {
      properties: { preserved: true, plugin: { latitude: "lat" } },
    })
    await expect(
      tableViewRequest(
        { ...props, disabled: true },
        request("table.properties", {})
      )
    ).rejects.toThrow("read-only")
  })
  it("verifies the row belongs to the bound table before opening it", async () => {
    const { props, source } = fixture()
    source.getRow.mockResolvedValueOnce(null)
    await expect(
      tableViewRequest(props, request("table.openRecord", { rowId: "foreign" }))
    ).rejects.toThrow()
    expect(props.onInspectedRowChange).not.toHaveBeenCalled()
    await tableViewRequest(props, request("table.openRecord", { rowId: "row" }))
    expect(source.getRow).toHaveBeenLastCalledWith("bound-table", "row")
    expect(props.onInspectedRowChange).toHaveBeenCalledWith("row")
  })
  it("delegates table.aggregate to data source and validates parameters", async () => {
    const { props, source } = fixture()
    await tableViewRequest(
      props,
      request("table.aggregate", { metric: { op: "count" } })
    )
    expect(source.aggregateTable).toHaveBeenCalledWith(
      "bound-table",
      { metric: { op: "count" } },
      props.query
    )
    await expect(
      tableViewRequest(
        props,
        request("table.aggregate", { metric: { op: "invalid" } })
      )
    ).rejects.toThrow("Invalid metric operation")
  })
})
