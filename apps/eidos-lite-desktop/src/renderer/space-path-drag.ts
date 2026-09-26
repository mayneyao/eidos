export const EIDOS_LITE_SPACE_PATH_DRAG_TYPE =
  "application/x-eidos-lite-space-path"
export const EIDOS_LITE_SPACE_PATHS_DRAG_TYPE =
  "application/x-eidos-lite-space-paths"

export function setSpacePathDragData(
  dataTransfer: DataTransfer,
  relativePath: string,
  relativePaths?: string[]
): void {
  dataTransfer.effectAllowed = "copyMove"
  dataTransfer.setData(EIDOS_LITE_SPACE_PATH_DRAG_TYPE, relativePath)
  if (relativePaths && relativePaths.length > 0) {
    dataTransfer.setData(
      EIDOS_LITE_SPACE_PATHS_DRAG_TYPE,
      JSON.stringify(relativePaths)
    )
  }
}

export function hasSpacePathDragData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(
    EIDOS_LITE_SPACE_PATH_DRAG_TYPE
  )
}

export function spacePathDragData(dataTransfer: DataTransfer): string | null {
  if (
    !hasSpacePathDragData(dataTransfer) ||
    typeof dataTransfer.getData !== "function"
  )
    return null
  return dataTransfer.getData(EIDOS_LITE_SPACE_PATH_DRAG_TYPE) || null
}

export function spacePathDragPaths(dataTransfer: DataTransfer): string[] {
  if (
    !hasSpacePathDragData(dataTransfer) ||
    typeof dataTransfer.getData !== "function"
  )
    return []
  const json = dataTransfer.getData(EIDOS_LITE_SPACE_PATHS_DRAG_TYPE)
  if (json) {
    try {
      const parsed = JSON.parse(json)
      if (Array.isArray(parsed) && parsed.every((p) => typeof p === "string")) {
        return parsed
      }
    } catch {}
  }
  const single = spacePathDragData(dataTransfer)
  return single ? [single] : []
}
