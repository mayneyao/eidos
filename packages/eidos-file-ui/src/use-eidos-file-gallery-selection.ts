import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react"

import {
  galleryEdgeScrollSpeed,
  galleryRectsIntersect,
  gallerySelectionEqual,
  gallerySelectionForHits,
  gallerySelectionMode,
  gallerySelectionRect,
  type GalleryPoint,
  type GalleryRect,
  type GallerySelectionMode,
} from "./eidos-file-gallery-selection"

const CARD = "[data-eidos-file-row-id]"
const INTERACTIVE =
  'button, a, input, select, textarea, summary, video, audio, [role="button"], [role="menuitem"], [contenteditable]:not([contenteditable="false"])'
const NATIVE_DRAG =
  '[draggable]:not([draggable="false"]), img:not([draggable="false"])'
const DRAG_DISTANCE = 6

export interface GallerySelectionGeometry {
  logicalScrollOffset: number
  cards: ReadonlyMap<string, GalleryRect>
}

interface GalleryDrag {
  pointerId: number
  start: GalleryPoint
  client: GalleryPoint
  initialClient: GalleryPoint
  base: ReadonlySet<string>
  mode: GallerySelectionMode
  active: boolean
  fromCard: boolean
  // Keep encountered identities after the bounded row window evicts their data.
  cards: Map<string, GalleryRect>
}

export function useEidosFileGallerySelection({
  scrollRef,
  getGeometry,
  scopeKey,
  queryIdentity,
  enabled,
  layoutKey,
}: {
  scrollRef: RefObject<HTMLDivElement>
  getGeometry: () => GallerySelectionGeometry
  scopeKey: string
  queryIdentity: unknown
  enabled: boolean
  layoutKey: string
}) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [marquee, setMarquee] = useState<GalleryRect | null>(null)
  const selectedRef = useRef(selectedIds)
  const geometryRef = useRef(getGeometry)
  geometryRef.current = getGeometry
  const cancelRef = useRef<(clear?: boolean) => void>(() => {})
  const clear = () => cancelRef.current(true)
  const remove = (rowIds: readonly string[]) => {
    cancelRef.current()
    const next = new Set(selectedRef.current)
    for (const rowId of rowIds) next.delete(rowId)
    if (gallerySelectionEqual(selectedRef.current, next)) return
    selectedRef.current = next
    setSelectedIds(next)
  }

  useLayoutEffect(() => {
    cancelRef.current(true)
  }, [queryIdentity, scopeKey])

  useLayoutEffect(() => {
    // A resize can change every card's coordinates; retain IDs, cancel the gesture.
    cancelRef.current()
  }, [enabled, layoutKey])

  useEffect(() => {
    const container = scrollRef.current
    const win = container?.ownerDocument.defaultView
    if (!container || !win) return
    let drag: GalleryDrag | null = null
    let frame: number | null = null
    let lastFrame = 0
    let suppressClick = false

    const select = (next: ReadonlySet<string>) => {
      if (gallerySelectionEqual(selectedRef.current, next)) return
      selectedRef.current = next
      setSelectedIds(next)
    }
    const point = (client: GalleryPoint): GalleryPoint => {
      const bounds = container.getBoundingClientRect()
      return {
        x: Math.max(0, Math.min(container.clientWidth, client.x - bounds.left)),
        y:
          geometryRef.current().logicalScrollOffset +
          Math.max(0, Math.min(container.clientHeight, client.y - bounds.top)),
      }
    }
    const update = () => {
      if (!drag?.active) return
      const geometry = geometryRef.current()
      for (const [id, bounds] of geometry.cards) drag.cards.set(id, bounds)
      const rect = gallerySelectionRect(drag.start, point(drag.client))
      const hits: string[] = []
      for (const [id, bounds] of drag.cards) {
        if (galleryRectsIntersect(rect, bounds)) hits.push(id)
      }
      select(gallerySelectionForHits(drag.base, hits, drag.mode))
      // Clip to the viewport so very long drags never create huge layout boxes.
      const top = Math.max(0, rect.top - geometry.logicalScrollOffset)
      const bottom = Math.min(
        container.clientHeight,
        rect.bottom - geometry.logicalScrollOffset
      )
      setMarquee({
        left: rect.left,
        right: rect.right,
        top: top + container.scrollTop,
        bottom: Math.max(top, bottom) + container.scrollTop,
      })
    }
    const tick = (now: number) => {
      if (!drag?.active) return
      const bounds = container.getBoundingClientRect()
      const speed = galleryEdgeScrollSpeed(
        drag.client.y,
        bounds.top,
        bounds.top + container.clientHeight
      )
      const elapsed = lastFrame === 0 ? 16 : Math.min(32, now - lastFrame)
      lastFrame = now
      if (speed !== 0) container.scrollTop += (speed * elapsed) / 1000
      update()
      frame = win.requestAnimationFrame(tick)
    }
    const stop = (cancel: boolean, clearSelection = false) => {
      const previous = drag
      drag = null
      if (frame !== null) win.cancelAnimationFrame(frame)
      frame = null
      lastFrame = 0
      win.removeEventListener("pointermove", move, true)
      win.removeEventListener("pointerup", up, true)
      win.removeEventListener("pointercancel", cancelPointer, true)
      win.removeEventListener("keydown", dragKey, true)
      win.removeEventListener("blur", blur)
      if (previous && container.hasPointerCapture?.(previous.pointerId)) {
        container.releasePointerCapture(previous.pointerId)
      }
      if (previous?.active) {
        suppressClick = true
      }
      if (clearSelection) select(new Set())
      else if (cancel && previous?.active) select(previous.base)
      else if (
        !cancel &&
        previous &&
        !previous.active &&
        !previous.fromCard &&
        previous.mode === "replace"
      )
        select(new Set())
      setMarquee(null)
    }
    const move = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      drag.client = { x: event.clientX, y: event.clientY }
      if (!drag.active) {
        if (
          Math.hypot(
            event.clientX - drag.initialClient.x,
            event.clientY - drag.initialClient.y
          ) < DRAG_DISTANCE
        )
          return
        drag.active = true
        container.setPointerCapture?.(drag.pointerId)
        container.focus({ preventScroll: true })
        const selection = container.ownerDocument.getSelection()
        if (selection?.anchorNode && container.contains(selection.anchorNode))
          selection.removeAllRanges()
        frame = win.requestAnimationFrame(tick)
      }
      event.preventDefault()
      update()
    }
    const up = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      if (drag.active) {
        drag.client = { x: event.clientX, y: event.clientY }
        update()
      }
      stop(false)
    }
    const cancelPointer = (event: PointerEvent) => {
      if (event.pointerId === drag?.pointerId) stop(true)
    }
    const blur = () => stop(true)
    const dragKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      stop(true, true)
    }
    const down = (event: PointerEvent) => {
      // A new press is deliberate; the click from the previous drag is not.
      // Do not expire this guard on a timer before the browser sends that click.
      if (event.button === 0) suppressClick = false
      if (
        event.defaultPrevented ||
        !enabled ||
        drag ||
        event.button !== 0 ||
        event.pointerType !== "mouse" ||
        event.isPrimary === false ||
        !(event.target instanceof Element) ||
        event.target.closest(`${INTERACTIVE}, ${NATIVE_DRAG}`)
      )
        return
      const bounds = container.getBoundingClientRect()
      // Native scrollbars are outside the client box.
      if (
        event.clientX < bounds.left ||
        event.clientX >= bounds.left + container.clientWidth ||
        event.clientY < bounds.top ||
        event.clientY >= bounds.top + container.clientHeight
      )
        return
      const client = { x: event.clientX, y: event.clientY }
      drag = {
        pointerId: event.pointerId,
        start: point(client),
        initialClient: client,
        client,
        base: selectedRef.current,
        mode: gallerySelectionMode(event),
        active: false,
        fromCard: event.target.closest(CARD) !== null,
        cards: new Map(),
      }
      win.addEventListener("pointermove", move, {
        capture: true,
        passive: false,
      })
      win.addEventListener("pointerup", up, true)
      win.addEventListener("pointercancel", cancelPointer, true)
      win.addEventListener("keydown", dragKey, true)
      win.addEventListener("blur", blur)
    }
    const click = (event: MouseEvent) => {
      if (suppressClick && event.detail !== 0) {
        suppressClick = false
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (
        !enabled ||
        event.button !== 0 ||
        !(event.shiftKey || event.metaKey || event.ctrlKey) ||
        !(event.target instanceof Element) ||
        event.target.closest(INTERACTIVE)
      )
        return
      const card = event.target.closest<HTMLElement>(CARD)
      const id = card?.dataset.eidosFileRowId
      if (id === undefined) return
      event.preventDefault()
      event.stopPropagation()
      select(
        gallerySelectionForHits(
          selectedRef.current,
          [id],
          gallerySelectionMode(event)
        )
      )
      container.focus({ preventScroll: true })
    }
    const key = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        !(event.target instanceof Element) ||
        event.target.closest(INTERACTIVE) ||
        selectedRef.current.size === 0
      )
        return
      event.preventDefault()
      event.stopPropagation()
      stop(true, true)
    }
    const nativeDrag = () => stop(true)
    cancelRef.current = (clearSelection = false) => stop(true, clearSelection)
    container.addEventListener("pointerdown", down)
    container.addEventListener("lostpointercapture", cancelPointer)
    container.addEventListener("click", click, true)
    container.addEventListener("keydown", key)
    container.addEventListener("dragstart", nativeDrag)
    return () => {
      stop(true)
      cancelRef.current = () => {}
      container.removeEventListener("pointerdown", down)
      container.removeEventListener("lostpointercapture", cancelPointer)
      container.removeEventListener("click", click, true)
      container.removeEventListener("keydown", key)
      container.removeEventListener("dragstart", nativeDrag)
    }
  }, [enabled, scrollRef])

  return { selectedIds, marquee, clear, remove }
}
