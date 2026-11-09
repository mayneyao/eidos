export type ExplorerMediaKind = "image" | "video"

export function explorerMediaKind(name: string): ExplorerMediaKind | null {
  if (/\.(png|jpe?g|gif|webp|avif|bmp|ico|heic|heif|tiff?)$/i.test(name))
    return "image"
  if (/\.(mp4|m4v|mov|webm|mkv|avi|ogv|mpg|mpeg|wmv)$/i.test(name))
    return "video"
  return null
}

export interface ExplorerThumbnailRequest {
  spaceId: string
  relativePath: string
  size: number
  modifiedAtMs: number
  /** Physical pixels needed by the displayed square, including screen density and zoom. */
  pixelSize?: number
}

export function normalizeExplorerThumbnailRequest(
  value: unknown
): ExplorerThumbnailRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid thumbnail request")
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
    !Number.isFinite(request.modifiedAtMs) ||
    (request.pixelSize !== undefined &&
      (typeof request.pixelSize !== "number" ||
        !Number.isInteger(request.pixelSize) ||
        request.pixelSize < 32 ||
        request.pixelSize > 512))
  )
    throw Error("Invalid thumbnail request")
  return {
    spaceId: request.spaceId,
    relativePath: request.relativePath,
    size: request.size,
    modifiedAtMs: request.modifiedAtMs,
    pixelSize: typeof request.pixelSize === "number" ? request.pixelSize : 112,
  }
}
