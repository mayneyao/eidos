export interface ExplorerSummaryRequest {
  spaceId: string
  relativePath: string
  size: number
  modifiedAtMs: number
}

export interface ExplorerEidosSummary {
  tableNames: string[]
  tableCount: number
  recordCount: number | null
}

export function normalizeExplorerSummaryRequest(
  value: unknown
): ExplorerSummaryRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid file summary request")
  const request = value as Record<string, unknown>
  if (
    typeof request.spaceId !== "string" ||
    !request.spaceId ||
    request.spaceId.length > 128 ||
    typeof request.relativePath !== "string" ||
    !request.relativePath ||
    request.relativePath.length > 4096 ||
    typeof request.size !== "number" ||
    !Number.isSafeInteger(request.size) ||
    request.size < 0 ||
    typeof request.modifiedAtMs !== "number" ||
    !Number.isFinite(request.modifiedAtMs)
  )
    throw Error("Invalid file summary request")
  return {
    spaceId: request.spaceId,
    relativePath: request.relativePath,
    size: request.size,
    modifiedAtMs: request.modifiedAtMs,
  }
}
