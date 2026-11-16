export interface GalleryPoint {
  x: number
  y: number
}

export interface GalleryRect {
  left: number
  top: number
  right: number
  bottom: number
}

export type GallerySelectionMode = "replace" | "add" | "toggle"

export function gallerySelectionRect(
  start: GalleryPoint,
  end: GalleryPoint
): GalleryRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  }
}

export function galleryRectsIntersect(a: GalleryRect, b: GalleryRect): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  )
}

export function gallerySelectionMode(event: {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}): GallerySelectionMode {
  if (event.metaKey || event.ctrlKey) return "toggle"
  return event.shiftKey ? "add" : "replace"
}

export function gallerySelectionForHits(
  base: ReadonlySet<string>,
  hits: Iterable<string>,
  mode: GallerySelectionMode
): Set<string> {
  const next = new Set(mode === "replace" ? [] : base)
  for (const id of hits) {
    if (mode === "toggle" && base.has(id)) next.delete(id)
    else next.add(id)
  }
  return next
}

export function gallerySelectionEqual(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>
): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id))
}

// A time-based speed keeps edge scrolling consistent at different refresh rates.
export function galleryEdgeScrollSpeed(
  pointer: number,
  start: number,
  end: number
): number {
  const edge = Math.min(48, (end - start) / 4)
  if (edge <= 0) return 0
  if (pointer < start + edge)
    return -900 * Math.min(1, (start + edge - pointer) / edge)
  if (pointer > end - edge)
    return 900 * Math.min(1, (pointer - end + edge) / edge)
  return 0
}
