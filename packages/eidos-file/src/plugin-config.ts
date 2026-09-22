import { canonicalizeEidosFileJson } from "./canonical-json"
import type { JsonObject } from "./runtime-contract"
import type { LogicalValue } from "./runtime-contract"

export interface EidosFileActionRow {
  id: string
  values: Record<string, LogicalValue>
  version: string
}

export interface EidosFilePluginConfig {
  value: JsonObject | null
  /** Opaque content token. Compare for equality; do not parse or persist it. */
  version: string
}

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function namespace(settings: JsonObject, pluginId: string): JsonObject {
  if (
    !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(pluginId) ||
    pluginId.length > 128
  )
    throw new Error("Invalid plugin ID")
  const plugins = settings.plugins
  if (plugins === undefined) return {}
  if (!object(plugins)) throw new Error("Invalid table plugin settings")
  return plugins
}

export function readEidosFilePluginConfig(
  settings: JsonObject,
  pluginId: string
): EidosFilePluginConfig {
  const plugins = namespace(settings, pluginId)
  const value = Object.prototype.hasOwnProperty.call(plugins, pluginId)
    ? plugins[pluginId]!
    : null
  if (value !== null && !object(value)) throw new Error("Invalid plugin config")
  const version = canonicalizeEidosFileJson(value)
  return { value: JSON.parse(version) as JsonObject | null, version }
}

/** Merge only one namespace; callers must commit against the read revision. */
export function mergeEidosFilePluginConfig(
  settings: JsonObject,
  pluginId: string,
  value: JsonObject | null,
  expectedVersion: string
): JsonObject {
  if (readEidosFilePluginConfig(settings, pluginId).version !== expectedVersion)
    throw new Error("Plugin config changed; reload before saving")
  if (value !== null && !object(value)) throw new Error("Invalid plugin config")
  const serialized = canonicalizeEidosFileJson(value)
  if (new TextEncoder().encode(serialized).byteLength > 65536)
    throw new Error("Plugin config exceeds 64 KiB")
  const plugins = { ...namespace(settings, pluginId) }
  if (value === null) delete plugins[pluginId]
  else plugins[pluginId] = JSON.parse(serialized) as JsonObject
  return { ...settings, plugins }
}
