export const EIDOS_LITE_SPACE_PATH_DRAG_TYPE =
  "application/x-eidos-lite-space-path"

export function setSpacePathDragData(
  dataTransfer: DataTransfer,
  relativePath: string
): void {
  dataTransfer.effectAllowed = "copyMove"
  dataTransfer.setData(EIDOS_LITE_SPACE_PATH_DRAG_TYPE, relativePath)
}

export function hasSpacePathDragData(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(
    EIDOS_LITE_SPACE_PATH_DRAG_TYPE
  )
}

export function spacePathDragData(dataTransfer: DataTransfer): string | null {
  if (!hasSpacePathDragData(dataTransfer)) return null
  return dataTransfer.getData(EIDOS_LITE_SPACE_PATH_DRAG_TYPE) || null
}
