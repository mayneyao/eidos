export type PluginErrorCode =
  | "INVALID_REQUEST"
  | "UNSUPPORTED_API"
  | "PERMISSION_DENIED"
  | "RESOURCE_UNBOUND"
  | "DOCUMENT_UNAVAILABLE"
  | "INSTANCE_CLOSED"
  | "STALE_REVISION"
  | "ALREADY_EXISTS"
  | "BUSY"
  | "TOO_LARGE"
  | "IO_ERROR"
  | "TIMEOUT"
  | "CANCELLED"
  | "REGISTRATION_CONFLICT"
  | "DEPENDENCY_MISSING"
  | "SOURCE_INVALID"
export class PluginError extends Error {
  constructor(
    readonly code: PluginErrorCode,
    message: string
  ) {
    super(message)
    this.name = "PluginError"
  }
}
export function invalid(message: string): never {
  throw new PluginError("INVALID_REQUEST", message)
}
export const TEXT_LIMIT = 2 * 1024 * 1024
export const PACKAGE_LIMIT = 16 * 1024 * 1024
