import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $createNodeSelection,
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  type NodeKey,
} from "lexical"
import { useEffect, useRef, useState, type CSSProperties } from "react"

import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"

interface Point {
  x: number
  y: number
}

interface MarqueeRect {
  left: number
  top: number
  width: number
  height: number
}

type MarqueeStartZone = "bottom" | "left" | "right"

interface DragState {
  pointerId: number
  /** Origin in viewport-x/document-y coordinates. */
  origin: Point
  /** Latest pointer position in viewport coordinates. */
  current: Point
  active: boolean
  animationFrame: number | null
}

interface NativeTextDragState {
  pointerId: number
  origin: Point
  current: Point
  active: boolean
  anchorNode: Node | null
  anchorOffset: number
  animationFrame: number | null
}

const DRAG_THRESHOLD = 4
const AUTO_SCROLL_EDGE = 56
const AUTO_SCROLL_MAX_SPEED = 20
const EXTERNAL_INTERACTIVE_SELECTOR =
  "button, input, textarea, select, a[href], [role='button'], [role='dialog'], [role='menu'], [data-block-gutter='true']"
const LOCAL_EDITOR_CONTROL_SELECTOR =
  "[data-efm-editor-interactive='true'], button, input, textarea, select, [role='dialog'], [role='menu'], [data-block-gutter='true']"

function marqueeRect(origin: Point, current: Point): MarqueeRect {
  const left = Math.min(origin.x, current.x)
  const top = Math.min(origin.y, current.y)
  return {
    left,
    top,
    width: Math.max(origin.x, current.x) - left,
    height: Math.max(origin.y, current.y) - top,
  }
}

function intersects(a: MarqueeRect, b: MarqueeRect): boolean {
  return (
    a.left <= b.left + b.width &&
    a.left + a.width >= b.left &&
    a.top <= b.top + b.height &&
    a.top + a.height >= b.top
  )
}

function scrollVelocity(pointerY: number, viewport: DOMRect): number {
  if (pointerY < viewport.top + AUTO_SCROLL_EDGE) {
    const strength = Math.min(
      1,
      (viewport.top + AUTO_SCROLL_EDGE - pointerY) / AUTO_SCROLL_EDGE
    )
    return -Math.max(1, Math.round(AUTO_SCROLL_MAX_SPEED * strength))
  }
  if (pointerY > viewport.bottom - AUTO_SCROLL_EDGE) {
    const strength = Math.min(
      1,
      (pointerY - (viewport.bottom - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE
    )
    return Math.max(1, Math.round(AUTO_SCROLL_MAX_SPEED * strength))
  }
  return 0
}

function sameKeys(a: ReadonlySet<NodeKey>, b: ReadonlySet<NodeKey>): boolean {
  return a.size === b.size && [...a].every((key) => b.has(key))
}

function cssPixelValue(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function marqueeStartZone(
  stage: HTMLElement,
  root: HTMLElement,
  pointer: Point
): MarqueeStartZone | null {
  const stageRect = stage.getBoundingClientRect()
  const rootRect = root.getBoundingClientRect()
  if (
    pointer.x < stageRect.left ||
    pointer.x > stageRect.right ||
    pointer.y < stageRect.top ||
    pointer.y > stageRect.bottom
  ) {
    return null
  }

  const rootStyle = window.getComputedStyle(root)
  const contentLeft =
    rootRect.left + cssPixelValue(rootStyle.paddingInlineStart)
  const contentRight =
    rootRect.right - cssPixelValue(rootStyle.paddingInlineEnd)

  if (pointer.x < contentLeft) return "left"
  if (pointer.x > contentRight) return "right"

  const lastBlock = [...root.children]
    .reverse()
    .find(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.getClientRects().length > 0
    )
  const trailingStart = lastBlock
    ? lastBlock.getBoundingClientRect().bottom
    : rootRect.top + cssPixelValue(rootStyle.paddingBlockStart)
  return pointer.y > trailingStart ? "bottom" : null
}

export function BlockMarqueeSelectionPlugin() {
  const [editor] = useLexicalComposerContext()
  const { matches } = useMarkdownShortcuts()
  const [rootElement, setRootElement] = useState<HTMLElement | null>(null)
  const [rectangle, setRectangle] = useState<MarqueeRect | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const nativeTextDragRef = useRef<NativeTextDragState | null>(null)
  const suppressClickRef = useRef(false)
  const marqueeKeysRef = useRef<Set<NodeKey>>(new Set())
  const selectedElementsRef = useRef<Set<HTMLElement>>(new Set())

  useEffect(
    () =>
      editor.registerRootListener((root) => {
        setRootElement(root)
      }),
    [editor]
  )

  useEffect(() => {
    const root = rootElement
    const stage = root?.closest<HTMLElement>(".eme-editor-stage")
    if (!root || !stage) return

    const clearVisualSelection = () => {
      for (const element of selectedElementsRef.current) {
        element.classList.remove("eme-marquee-selected-block")
        delete element.dataset.blockSelected
      }
      selectedElementsRef.current.clear()
      marqueeKeysRef.current.clear()
    }

    const setVisualSelection = (
      elements: readonly HTMLElement[],
      keys: ReadonlySet<NodeKey>
    ) => {
      const nextElements = new Set(elements)
      for (const element of selectedElementsRef.current) {
        if (nextElements.has(element)) continue
        element.classList.remove("eme-marquee-selected-block")
        delete element.dataset.blockSelected
      }
      for (const element of nextElements) {
        element.classList.add("eme-marquee-selected-block")
        element.dataset.blockSelected = "true"
      }
      selectedElementsRef.current = nextElements
      marqueeKeysRef.current = new Set(keys)
    }

    const selectedCandidates = (selectionRect: MarqueeRect) => {
      const elements = [...root.children].filter(
        (element): element is HTMLElement => {
          if (!(element instanceof HTMLElement)) return false
          const rect = element.getBoundingClientRect()
          return (
            element.getClientRects().length > 0 &&
            intersects(selectionRect, {
              left: rect.left,
              top: rect.top + stage.scrollTop,
              width: rect.width,
              height: rect.height,
            })
          )
        }
      )
      const entries = editor.read(() =>
        elements.flatMap((element) => {
          const node = $getNearestNodeFromDOMNode(element)
          return node ? [{ element, key: node.getKey() }] : []
        })
      )
      return {
        elements: entries.map(({ element }) => element),
        keys: new Set(entries.map(({ key }) => key)),
      }
    }

    const commitSelection = (
      elements: readonly HTMLElement[],
      keys: ReadonlySet<NodeKey>
    ) => {
      if (sameKeys(keys, marqueeKeysRef.current)) return
      setVisualSelection(elements, keys)
      editor.update(() => {
        if (keys.size === 0) {
          $setSelection(null)
          return
        }
        const selection = $createNodeSelection()
        for (const key of keys) selection.add(key)
        $setSelection(selection)
      })
    }

    const updateDragSelection = (drag: DragState) => {
      window.getSelection()?.removeAllRanges()
      const contentRectangle = marqueeRect(drag.origin, {
        x: drag.current.x,
        y: drag.current.y + stage.scrollTop,
      })
      const stageRect = stage.getBoundingClientRect()
      const unclippedTop = contentRectangle.top - stage.scrollTop
      const unclippedBottom =
        contentRectangle.top + contentRectangle.height - stage.scrollTop
      const clippedTop = Math.max(stageRect.top, unclippedTop)
      const clippedBottom = Math.min(stageRect.bottom, unclippedBottom)
      setRectangle({
        left: contentRectangle.left,
        top: clippedTop,
        width: contentRectangle.width,
        height: Math.max(0, clippedBottom - clippedTop),
      })
      const { elements, keys } = selectedCandidates(contentRectangle)
      commitSelection(elements, keys)
    }

    const scheduleAutoScroll = (drag: DragState) => {
      if (drag.animationFrame !== null) return
      drag.animationFrame = window.requestAnimationFrame(() => {
        drag.animationFrame = null
        if (dragRef.current !== drag || !drag.active) return
        const velocity = scrollVelocity(
          drag.current.y,
          stage.getBoundingClientRect()
        )
        if (velocity === 0) return
        const previousScrollTop = stage.scrollTop
        stage.scrollTop += velocity
        if (stage.scrollTop !== previousScrollTop) updateDragSelection(drag)
        scheduleAutoScroll(drag)
      })
    }

    const updateNativeTextEndpoint = (drag: NativeTextDragState) => {
      const selection = window.getSelection()
      if (!selection || !drag.anchorNode) return
      const stageRect = stage.getBoundingClientRect()
      const y = Math.min(
        stageRect.bottom - 2,
        Math.max(stageRect.top + 2, drag.current.y)
      )
      const caret = document.caretPositionFromPoint?.(drag.current.x, y)
      const fallbackRange = (
        document as Document & {
          caretRangeFromPoint?(x: number, y: number): Range | null
        }
      ).caretRangeFromPoint?.(drag.current.x, y)
      const focusNode = caret?.offsetNode ?? fallbackRange?.startContainer
      const focusOffset = caret?.offset ?? fallbackRange?.startOffset
      if (
        !focusNode ||
        focusOffset === undefined ||
        !root.contains(focusNode)
      ) {
        return
      }
      selection.setBaseAndExtent(
        drag.anchorNode,
        drag.anchorOffset,
        focusNode,
        focusOffset
      )
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }))
    }

    const scheduleNativeTextAutoScroll = (drag: NativeTextDragState) => {
      if (drag.animationFrame !== null) return
      drag.animationFrame = window.requestAnimationFrame(() => {
        drag.animationFrame = null
        if (nativeTextDragRef.current !== drag || !drag.active) return
        const selection = window.getSelection()
        if (!drag.anchorNode && selection?.anchorNode) {
          drag.anchorNode = selection.anchorNode
          drag.anchorOffset = selection.anchorOffset
        }
        const velocity = scrollVelocity(
          drag.current.y,
          stage.getBoundingClientRect()
        )
        if (velocity === 0) return
        const previousScrollTop = stage.scrollTop
        stage.scrollTop += velocity
        if (stage.scrollTop !== previousScrollTop) {
          updateNativeTextEndpoint(drag)
        }
        scheduleNativeTextAutoScroll(drag)
      })
    }

    const finishNativeTextDrag = (pointerId: number): boolean => {
      const drag = nativeTextDragRef.current
      if (!drag || drag.pointerId !== pointerId) return false
      if (drag.animationFrame !== null) {
        window.cancelAnimationFrame(drag.animationFrame)
      }
      nativeTextDragRef.current = null
      return true
    }

    const finishDrag = (pointerId: number) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== pointerId) return
      if (drag.animationFrame !== null) {
        window.cancelAnimationFrame(drag.animationFrame)
      }
      dragRef.current = null
      setRectangle(null)
      delete stage.dataset.blockMarqueeActive
      delete stage.dataset.blockMarqueeZone
      if (stage.hasPointerCapture(pointerId)) {
        stage.releasePointerCapture(pointerId)
      }
      if (!drag.active) {
        clearVisualSelection()
        editor.update(() => $setSelection(null))
      } else {
        suppressClickRef.current = true
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || dragRef.current || nativeTextDragRef.current) {
        return
      }
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(LOCAL_EDITOR_CONTROL_SELECTOR)) return

      const startZone = stage.contains(target)
        ? marqueeStartZone(stage, root, {
            x: event.clientX,
            y: event.clientY,
          })
        : null
      if (!startZone) {
        if (!root.contains(target)) return
        delete stage.dataset.blockMarqueeZone
        nativeTextDragRef.current = {
          pointerId: event.pointerId,
          origin: { x: event.clientX, y: event.clientY },
          current: { x: event.clientX, y: event.clientY },
          active: false,
          anchorNode: null,
          anchorOffset: 0,
          animationFrame: null,
        }
        return
      }

      event.preventDefault()
      window.getSelection()?.removeAllRanges()
      clearVisualSelection()
      root.focus({ preventScroll: true })
      editor.update(() => $setSelection(null))
      dragRef.current = {
        pointerId: event.pointerId,
        origin: { x: event.clientX, y: event.clientY + stage.scrollTop },
        current: { x: event.clientX, y: event.clientY },
        active: false,
        animationFrame: null,
      }
      stage.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      const nativeTextDrag = nativeTextDragRef.current
      if (nativeTextDrag?.pointerId === event.pointerId) {
        nativeTextDrag.current = { x: event.clientX, y: event.clientY }
        if (
          !nativeTextDrag.active &&
          Math.hypot(
            event.clientX - nativeTextDrag.origin.x,
            event.clientY - nativeTextDrag.origin.y
          ) < DRAG_THRESHOLD
        ) {
          return
        }
        nativeTextDrag.active = true
        scheduleNativeTextAutoScroll(nativeTextDrag)
        return
      }

      const drag = dragRef.current
      if (!drag) {
        const target = event.target
        const zone =
          target instanceof Element &&
          !target.closest(EXTERNAL_INTERACTIVE_SELECTOR) &&
          stage.contains(target)
            ? marqueeStartZone(stage, root, {
                x: event.clientX,
                y: event.clientY,
              })
            : null
        if (zone) stage.dataset.blockMarqueeZone = zone
        else delete stage.dataset.blockMarqueeZone
        return
      }
      if (drag.pointerId !== event.pointerId) return
      drag.current = { x: event.clientX, y: event.clientY }
      const dx = event.clientX - drag.origin.x
      const dy = event.clientY + stage.scrollTop - drag.origin.y
      if (!drag.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return

      event.preventDefault()
      drag.active = true
      stage.dataset.blockMarqueeActive = "true"
      updateDragSelection(drag)
      scheduleAutoScroll(drag)
    }

    const onPointerUp = (event: PointerEvent) => {
      if (finishNativeTextDrag(event.pointerId)) return
      if (dragRef.current?.active) {
        event.preventDefault()
        event.stopPropagation()
      }
      finishDrag(event.pointerId)
    }
    const onPointerCancel = (event: PointerEvent) => {
      if (finishNativeTextDrag(event.pointerId)) return
      finishDrag(event.pointerId)
    }
    const onClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) return
      suppressClickRef.current = false
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const onPointerLeave = () => {
      if (!dragRef.current && !nativeTextDragRef.current) {
        delete stage.dataset.blockMarqueeZone
      }
    }

    stage.addEventListener("pointerdown", onPointerDown, true)
    stage.addEventListener("pointerleave", onPointerLeave, true)
    window.addEventListener("pointermove", onPointerMove, true)
    window.addEventListener("pointerup", onPointerUp, true)
    window.addEventListener("pointercancel", onPointerCancel, true)
    stage.addEventListener("click", onClick, true)

    const unregisterUpdate = editor.registerUpdateListener(
      ({ editorState }) => {
        if (dragRef.current) return
        const selectionKeys = editorState.read(() => {
          const selection = $getSelection()
          return $isNodeSelection(selection)
            ? new Set(selection.getNodes().map((node) => node.getKey()))
            : new Set<NodeKey>()
        })
        if (!sameKeys(selectionKeys, marqueeKeysRef.current)) {
          clearVisualSelection()
        }
      }
    )
    const unregisterEscape = editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (
          marqueeKeysRef.current.size === 0 ||
          !matches(event, "selection.clear")
        ) {
          return false
        }
        event.preventDefault()
        clearVisualSelection()
        editor.update(() => $setSelection(null))
        return true
      },
      COMMAND_PRIORITY_HIGH
    )

    return () => {
      const blockDrag = dragRef.current
      const textDrag = nativeTextDragRef.current
      if (blockDrag?.animationFrame != null) {
        window.cancelAnimationFrame(blockDrag.animationFrame)
      }
      if (textDrag?.animationFrame != null) {
        window.cancelAnimationFrame(textDrag.animationFrame)
      }
      dragRef.current = null
      nativeTextDragRef.current = null
      stage.removeEventListener("pointerdown", onPointerDown, true)
      stage.removeEventListener("pointerleave", onPointerLeave, true)
      window.removeEventListener("pointermove", onPointerMove, true)
      window.removeEventListener("pointerup", onPointerUp, true)
      window.removeEventListener("pointercancel", onPointerCancel, true)
      stage.removeEventListener("click", onClick, true)
      unregisterUpdate()
      unregisterEscape()
      clearVisualSelection()
      delete stage.dataset.blockMarqueeActive
      delete stage.dataset.blockMarqueeZone
    }
  }, [editor, matches, rootElement])

  if (!rectangle) return null
  const style: CSSProperties = rectangle
  return (
    <div
      className="eme-block-marquee"
      data-block-marquee="true"
      aria-hidden="true"
      style={style}
    />
  )
}
