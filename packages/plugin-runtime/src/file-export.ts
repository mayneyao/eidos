import { PluginError } from "./errors"

export const FILE_EXPORT_LIMIT = 16 * 1024 * 1024

/** Validate untrusted RPC input identically in desktop and browser hosts. */
export function parseFileExport(value: unknown): {
  name: string
  mimeType: string
  data: Uint8Array<ArrayBuffer>
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PluginError("INVALID_REQUEST", "Invalid file export")
  const input = value as Record<string, unknown>
  const { name, mimeType, data } = input
  if (
    Object.keys(input).sort().join() !== "data,mimeType,name" ||
    typeof name !== "string" ||
    !name.trim() ||
    new TextEncoder().encode(name).length > 255 ||
    /[\\/:*?"<>|\u0000-\u001f\u007f]/u.test(name) ||
    name === "." ||
    name === ".." ||
    /[. ]$/u.test(name) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name) ||
    typeof mimeType !== "string" ||
    mimeType.length > 127 ||
    !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/iu.test(
      mimeType
    ) ||
    typeof data !== "string" ||
    data.length > Math.ceil(FILE_EXPORT_LIMIT / 3) * 4 ||
    data.length % 4 !== 0 ||
    /[^A-Za-z0-9+/=]/u.test(data) ||
    (data.includes("=") && !/^[^=]*={1,2}$/u.test(data))
  )
    throw new PluginError(
      "INVALID_REQUEST",
      "Invalid file export name, media type or content"
    )
  const binary = atob(data)
  if (binary.length > FILE_EXPORT_LIMIT)
    throw new PluginError("INVALID_REQUEST", "File export exceeds 16 MiB")
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { name, mimeType, data: bytes }
}
