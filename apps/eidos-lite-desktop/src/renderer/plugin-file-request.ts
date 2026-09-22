import type { EidosFileDataSource, JsonObject } from "@eidos.space/eidos-file"
import type { PluginRequest } from "@eidos.space/plugin-runtime/rpc"

/** Source and plugin identity come from the mounted editor, never guest params. */
export async function fileViewRequest(
  source: EidosFileDataSource,
  pluginId: string,
  request: PluginRequest,
  disabled = false
): Promise<unknown> {
  const snapshot = await source.getSnapshot()
  if (request.method === "eidos.tables") {
    if (request.params !== null) throw new Error("Unexpected parameters")
    return snapshot.tables.map(({ table }) => ({
      id: table.id,
      name: table.name,
    }))
  }
  const p = request.params
  if (
    !p ||
    typeof p !== "object" ||
    Array.isArray(p) ||
    !("tableId" in p) ||
    typeof p.tableId !== "string"
  )
    throw new Error("Invalid table request")
  const table = snapshot.tables.find((t) => t.table.id === p.tableId)
  if (!table) throw new Error("Table is unavailable in this file")
  if (request.method === "eidos.pluginConfig.write") {
    if (disabled) throw new Error("File is read-only")
    if (
      Object.keys(p).sort().join() !== "expectedVersion,tableId,value" ||
      !("expectedVersion" in p) ||
      typeof p.expectedVersion !== "string" ||
      !("value" in p) ||
      (p.value !== null &&
        (typeof p.value !== "object" || Array.isArray(p.value)))
    )
      throw new Error("Invalid config request")
    if (!source.writeTablePluginConfig)
      throw new Error("Plugin config is unsupported")
    return source.writeTablePluginConfig(table.table.id, pluginId, {
      value: p.value as JsonObject | null,
      expectedVersion: p.expectedVersion,
    })
  }
  if (Object.keys(p).join() !== "tableId")
    throw new Error("Unexpected parameters")
  if (request.method === "eidos.table") return { fields: table.fields }
  if (request.method === "eidos.pluginConfig.read") {
    if (!source.readTablePluginConfig)
      throw new Error("Plugin config is unsupported")
    return source.readTablePluginConfig(table.table.id, pluginId)
  }
  throw new Error("Unsupported file method")
}
