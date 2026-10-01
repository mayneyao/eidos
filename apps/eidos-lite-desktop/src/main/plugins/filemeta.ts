import { PluginError, object } from "@eidos.space/plugin-runtime/rpc"
import type { FileMetaPatch, FileMetaValue } from "@eidos.space/plugin-sdk"

export function fileMetaPatch(value: unknown): FileMetaPatch {
  const p = object(value)
  if (Object.keys(p).some((key) => !["set", "remove"].includes(key))) invalid()
  const set = object(p.set === undefined ? {} : p.set)
  const remove = p.remove === undefined ? [] : p.remove
  if (!Array.isArray(remove) || remove.some((key) => typeof key !== "string"))
    invalid()
  const keys = [...Object.keys(set), ...(remove as string[])]
  if (
    keys.length > 1024 ||
    keys.some(
      (key) => !key || Buffer.byteLength(key) > 1024 || key.includes("\0")
    )
  )
    invalid()
  if ((remove as string[]).some((key) => Object.hasOwn(set, key))) invalid()
  function json(value: unknown, depth = 0): value is FileMetaValue {
    if (depth > 32) return false
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean"
    )
      return true
    if (typeof value === "number") return Number.isFinite(value)
    if (typeof value !== "object" || value === null) return false
    if (
      !Array.isArray(value) &&
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      return false
    return (Array.isArray(value) ? value : Object.values(value)).every((item) =>
      json(item, depth + 1)
    )
  }
  if (!json(set) || Buffer.byteLength(JSON.stringify(p)) > 1024 * 1024)
    invalid()
  return { set: set as FileMetaPatch["set"], remove: remove as string[] }
}
function invalid(): never {
  throw new PluginError("INVALID_REQUEST", "Invalid file property patch")
}
