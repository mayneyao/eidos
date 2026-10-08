import { PluginError, TEXT_LIMIT, type PluginErrorCode } from "./errors"
import { record } from "./manifest"
export { PluginError, record as object }
export type { PluginManifest } from "./contracts"
export const PLUGIN_PROTOCOL = "eidos-plugin"
export const PLUGIN_PACKAGE_LIMIT = 16 * 1024 * 1024
/** Workbench recovery payload, not the guest document API. */
export interface TextChange {
  text: string
  expectedRevision: string
}
export interface PluginRequest {
  protocol: typeof PLUGIN_PROTOCOL
  apiVersion: 1
  id: string
  method:
    | "view.ready"
    | "eidos.tables"
    | "eidos.table"
    | "eidos.connection.status"
    | "eidos.connection.request"
    | "eidos.pluginConfig.read"
    | "eidos.pluginConfig.write"
    | "network.read"
    | "storage.list"
    | "storage.read"
    | "storage.write"
    | "storage.delete"
    | "table.readContext"
    | "table.pluginConfig.read"
    | "table.pluginConfig.write"
    | "table.actions.ready"
    | "table.actions.result"
    | "table.target.readRows"
    | "table.target.update"
    | "table.connection.request"
    | "table.task.declareOutputs"
    | "table.task.report"
    | "table.readRows"
    | "table.setViewConfig"
    | "table.openRecord"
    | "table.aggregate"
    | "extension.ready"
    | "extension.failed"
    | "extension.unregister"
    | "action.complete"
    | "formatter.complete"
    | "document.read"
    | "document.edit"
    | "document.save"
    | "document.undo"
    | "document.redo"
    | "document.observe"
    | "document.unobserve"
    | "ui.notify"
    | "ui.exportFile"
    | "resources.listViews"
    | "resources.mount"
    | "resources.layout"
    | "resources.refresh"
    | "resources.dispose"
    | "ui.openFile"
    | "ui.navigate"
    | "settings.get"
    | "settings.set"
    | "settings.reset"
    | "fs.readText"
    | "fs.writeText"
    | "fs.readBinary"
    | "fs.writeBinary"
    | "fs.delete"
    | "fs.rename"
    | "fs.list"
    | "fs.stat"
    | "filemeta.read"
    | "filemeta.patch"
    | "fs.url"
    | "fs.watch"
    | "fs.unwatch"
  params: unknown
}
export type PluginResponse = {
  protocol: typeof PLUGIN_PROTOCOL
  apiVersion: 1
  id: string
} & (
  | { result: unknown }
  | { error: { code: PluginErrorCode; message: string } }
)
export interface PluginEvent {
  protocol: typeof PLUGIN_PROTOCOL
  apiVersion: 1
  observation: string
  value: unknown
  draft?: TextChange | null
  draftPath?: string
}
export function parseRequest(value: unknown): PluginRequest {
  const r = record(value)
  if (
    Object.keys(r).sort().join() !== "apiVersion,id,method,params,protocol" ||
    r.protocol !== PLUGIN_PROTOCOL ||
    r.apiVersion !== 1 ||
    typeof r.id !== "string" ||
    !r.id ||
    r.id.length > 128 ||
    ![
      "view.ready",
      "eidos.tables",
      "eidos.table",
      "eidos.connection.status",
      "eidos.connection.request",
      "eidos.pluginConfig.read",
      "eidos.pluginConfig.write",
      "network.read",
      "storage.list",
      "storage.read",
      "storage.write",
      "storage.delete",
      "table.readContext",
      "table.pluginConfig.read",
      "table.pluginConfig.write",
      "table.actions.ready",
      "table.actions.result",
      "table.target.readRows",
      "table.target.update",
      "table.connection.request",
      "table.task.declareOutputs",
      "table.task.report",
      "table.readRows",
      "table.setViewConfig",
      "table.openRecord",
      "table.aggregate",
      "extension.ready",
      "extension.failed",
      "extension.unregister",
      "action.complete",
      "formatter.complete",
      "document.read",
      "document.edit",
      "document.save",
      "document.undo",
      "document.redo",
      "document.observe",
      "document.unobserve",
      "ui.notify",
      "ui.exportFile",
      "resources.listViews",
      "resources.mount",
      "resources.layout",
      "resources.refresh",
      "resources.dispose",
      "ui.openFile",
      "ui.navigate",
      "settings.get",
      "settings.set",
      "settings.reset",
      "fs.readText",
      "fs.writeText",
      "fs.readBinary",
      "fs.writeBinary",
      "fs.delete",
      "fs.rename",
      "fs.list",
      "fs.stat",
      "filemeta.read",
      "filemeta.patch",
      "fs.url",
      "fs.watch",
      "fs.unwatch",
    ].includes(String(r.method))
  )
    throw new PluginError("INVALID_REQUEST", "Invalid guest request")
  if (
    [
      "view.ready",
      "document.read",
      "document.save",
      "document.undo",
      "document.redo",
    ].includes(String(r.method)) &&
    r.params !== null &&
    !(r.params && typeof r.params === "object" && "invocation" in r.params)
  )
    throw new PluginError("INVALID_REQUEST", "Unexpected parameters")
  return r as unknown as PluginRequest
}
export function parseChange(value: unknown): TextChange {
  const r = record(value)
  if (
    Object.keys(r).sort().join() !== "expectedRevision,text" ||
    typeof r.text !== "string" ||
    r.text.length > TEXT_LIMIT ||
    typeof r.expectedRevision !== "string" ||
    !r.expectedRevision ||
    r.expectedRevision.length > 256
  )
    throw new PluginError("INVALID_REQUEST", "Invalid workbench draft")
  return { text: r.text, expectedRevision: r.expectedRevision }
}
