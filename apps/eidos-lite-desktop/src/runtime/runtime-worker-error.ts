import type { RuntimeWorkerResponse } from "../shared/contracts"

export type RuntimeWorkerError = Extract<
  RuntimeWorkerResponse,
  { ok: false }
>["error"]

export function serializeRuntimeWorkerError(
  error: unknown
): RuntimeWorkerError {
  if (typeof error === "object" && error !== null) {
    const candidate = error as Record<string, unknown>
    const message =
      typeof candidate.message === "string" ? candidate.message : undefined
    if (!message) return { name: "Error", message: String(error) }
    const code = typeof candidate.code === "string" ? candidate.code : undefined
    const stack =
      typeof candidate.stack === "string" ? candidate.stack : undefined
    return {
      name:
        typeof candidate.name === "string" && candidate.name
          ? candidate.name
          : "Error",
      message,
      ...(code ? { code } : {}),
      ...(stack ? { stack } : {}),
    }
  }
  return { name: "Error", message: String(error) }
}
