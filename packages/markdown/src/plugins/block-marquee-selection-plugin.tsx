import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $isTableSelection } from "@lexical/table"
import {
  $createNodeSelection,
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type BaseSelection,
  type LexicalNode,
  type NodeKey,
} from "lexical"
import { useEffect, useRef, useState, type CSSProperties } from "react"

import { $isEfmSourceRangeNode } from "../nodes/efm-source-range-node"
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

interface SelectionHintPosition {
  left: number
  top: number
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
  candidates: readonly BlockCandidate[]
}

interface BlockCandidate {
  element: HTMLElement
  key: NodeKey
  rect: MarqueeRect
}

export interface KeyboardBlockSelectionRange {
  anchorIndex: number
  focusIndex: number
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

function rootBlockContaining(node: LexicalNode): LexicalNode | null {
  return (
    $getRoot()
      .getChildren()
      .find(
        (child) =>
          child.is(node) || ($isElementNode(child) && child.isParentOf(node))
      ) ?? null
  )
}

export function keyboardBlockSelectionIndices(
  range: KeyboardBlockSelectionRange,
  blockCount: number
): number[] {
  if (blockCount <= 0) return []
  const anchor = Math.max(0, Math.min(blockCount - 1, range.anchorIndex))
  const focus = Math.max(0, Math.min(blockCount - 1, range.focusIndex))
  const first = Math.min(anchor, focus)
  const last = Math.max(anchor, focus)
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}

export function extendKeyboardBlockSelection(
  range: KeyboardBlockSelectionRange,
  direction: -1 | 1,
  blockCount: number
): KeyboardBlockSelectionRange {
  if (blockCount <= 0) return range
  return {
    anchorIndex: Math.max(0, Math.min(blockCount - 1, range.anchorIndex)),
    focusIndex: Math.max(
      0,
      Math.min(blockCount - 1, range.focusIndex + direction)
    ),
  }
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
  const { label, matches } = useMarkdownShortcuts()
  const [rootElement, setRootElement] = useState<HTMLElement | null>(null)
  const [rectangle, setRectangle] = useState<MarqueeRect | null>(null)
  const [selectionHintPosition, setSelectionHintPosition] =
    useState<SelectionHintPosition | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const nativeTextDragRef = useRef<NativeTextDragState | null>(null)
  const suppressClickRef = useRef(false)
  const marqueeKeysRef = useRef<Set<NodeKey>>(new Set())
  const selectedElementsRef = useRef<Set<HTMLElement>>(new Set())
  const keyboardRangeRef = useRef<KeyboardBlockSelectionRange | null>(null)
  const previousSelectionRef = useRef<BaseSelection | null>(null)

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
      keyboardRangeRef.current = null
      previousSelectionRef.current = null
      setSelectionHintPosition(null)
      delete stage.dataset.blockSelectionMode
    }

    const updateSelectionHintPosition = () => {
      const elements = [...selectedElementsRef.current].filter(
        (element) => element.isConnected
      )
      if (elements.length === 0) {
        setSelectionHintPosition(null)
        return
      }
      const rectangles = elements.map((element) =>
        element.getBoundingClientRect()
      )
      setSelectionHintPosition({
        left: Math.min(
          window.innerWidth - 8,
          Math.max(...rectangles.map((rect) => rect.right))
        ),
        top: Math.max(8, Math.min(...rectangles.map((rect) => rect.top)) - 8),
      })
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
      updateSelectionHintPosition()
    }

    const collectCandidates = (): BlockCandidate[] => {
      const measured = [...root.children].flatMap((element) => {
        if (!(element instanceof HTMLElement)) return []
        const rect = element.getBoundingClientRect()
        if (element.getClientRects().length === 0) return []
        return [{ element, rect }]
      })
      return editor
        .read(() =>
          measured.flatMap(({ element, rect }) => {
            const node = $getNearestNodeFromDOMNode(element)
            return node
              ? [
                  {
                    element,
                    key: node.getKey(),
                    rect: {
                      left: rect.left,
                      top: rect.top + stage.scrollTop,
                      width: rect.width,
                      height: rect.height,
                    },
                  },
                ]
              : []
          })
        )
        .sort((left, right) => left.rect.top - right.rect.top)
    }

    const selectedCandidates = (
      selectionRect: MarqueeRect,
      candidates: readonly BlockCandidate[]
    ) => {
      const selectionBottom = selectionRect.top + selectionRect.height
      let low = 0
      let high = candidates.length
      while (low < high) {
        const middle = Math.floor((low + high) / 2)
        const candidate = candidates[middle]
        if (candidate.rect.top + candidate.rect.height < selectionRect.top) {
          low = middle + 1
        } else {
          high = middle
        }
      }
      const matches: { candidate: BlockCandidate; index: number }[] = []
      for (let index = low; index < candidates.length; index += 1) {
        const candidate = candidates[index]
        if (candidate.rect.top > selectionBottom) break
        if (intersects(selectionRect, candidate.rect)) {
          matches.push({ candidate, index })
        }
      }
      const first = matches[0]?.index
      const last = matches.at(-1)?.index
      const entries =
        first === undefined || last === undefined
          ? []
          : candidates.slice(first, last + 1)
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
      keyboardRangeRef.current = null
      previousSelectionRef.current = null
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

    const selectedRootIndices = (): number[] => {
      const selection = $getSelection()
      if (!$isNodeSelection(selection)) return []
      const selectedKeys = new Set(
        selection.getNodes().map((node) => node.getKey())
      )
      return $getRoot()
        .getChildren()
        .flatMap((node, index) =>
          selectedKeys.has(node.getKey()) ? [index] : []
        )
    }

    const setKeyboardSelection = (range: KeyboardBlockSelectionRange) => {
      const rootChildren = $getRoot().getChildren()
      const indices = keyboardBlockSelectionIndices(range, rootChildren.length)
      if (indices.length === 0) return false
      const entries = indices.flatMap((index) => {
        const node = rootChildren[index]
        const element = editor.getElementByKey(node.getKey())
        return element ? [{ element, key: node.getKey() }] : []
      })
      if (entries.length !== indices.length) return false

      const keys = new Set(entries.map(({ key }) => key))
      keyboardRangeRef.current = {
        anchorIndex: Math.max(
          0,
          Math.min(rootChildren.length - 1, range.anchorIndex)
        ),
        focusIndex: Math.max(
          0,
          Math.min(rootChildren.length - 1, range.focusIndex)
        ),
      }
      setVisualSelection(
        entries.map(({ element }) => element),
        keys
      )
      stage.dataset.blockSelectionMode = "keyboard"
      root.focus({ preventScroll: true })
      window.getSelection()?.removeAllRanges()
      const selection = $createNodeSelection()
      for (const key of keys) selection.add(key)
      $setSelection(selection)
      entries[
        Math.max(0, Math.min(entries.length - 1, range.focusIndex - indices[0]))
      ]?.element.scrollIntoView({ block: "nearest" })
      return true
    }

    const deleteSelectedRootBlocks = (selectedIndices: readonly number[]) => {
      const rootNode = $getRoot()
      const rootChildren = rootNode.getChildren()
      const selectedKeys = new Set(
        selectedIndices.flatMap((index) => {
          const node = rootChildren[index]
          return node ? [node.getKey()] : []
        })
      )
      const firstSelectedIndex = selectedIndices[0] ?? 0

      clearVisualSelection()
      for (const node of rootChildren) {
        if (selectedKeys.has(node.getKey())) node.remove()
      }

      const remainingChildren = rootNode.getChildren()
      if (remainingChildren.length > 0) {
        const nextIndex = Math.min(
          firstSelectedIndex,
          remainingChildren.length - 1
        )
        return setKeyboardSelection({
          anchorIndex: nextIndex,
          focusIndex: nextIndex,
        })
      }

      const paragraph = $createParagraphNode()
      rootNode.append(paragraph)
      paragraph.selectStart()
      root.focus({ preventScroll: true })
      return true
    }

    const restoreCaret = (
      preferredIndex: number,
      previous: BaseSelection | null
    ) => {
      if (previous) {
        $setSelection(previous.clone())
        return
      }

      const children = $getRoot().getChildren()
      for (let distance = 0; distance < children.length; distance += 1) {
        const after = children[preferredIndex + distance]
        if (after && $isElementNode(after)) {
          after.selectStart()
          return
        }
        const before = children[preferredIndex - distance]
        if (before && $isElementNode(before)) {
          before.selectEnd()
          return
        }
      }
      $setSelection(null)
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
      const { elements, keys } = selectedCandidates(
        contentRectangle,
        drag.candidates
      )
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
        if (keyboardRangeRef.current) clearVisualSelection()
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
        candidates: collectCandidates(),
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
    stage.addEventListener("scroll", updateSelectionHintPosition)
    window.addEventListener("resize", updateSelectionHintPosition)
    window.addEventListener("scroll", updateSelectionHintPosition, true)
    window.addEventListener("pointermove", onPointerMove, true)
    window.addEventListener("pointerup", onPointerUp, true)
    window.addEventListener("pointercancel", onPointerCancel, true)
    stage.addEventListener("click", onClick, true)

    const unregisterUpdate = editor.registerUpdateListener(
      ({ editorState }) => {
        if (dragRef.current) return
        const rootSelection = editorState.read(() => {
          const selection = $getSelection()
          if (!$isNodeSelection(selection)) return null
          const selectedNodes = selection.getNodes()
          if (selectedNodes.some($isEfmSourceRangeNode)) return null

          const keys = new Set(selectedNodes.map((node) => node.getKey()))
          const indices = $getRoot()
            .getChildren()
            .flatMap((node, index) => (keys.has(node.getKey()) ? [index] : []))
          return indices.length === keys.size ? { indices, keys } : null
        })

        if (!rootSelection) {
          if (marqueeKeysRef.current.size > 0) clearVisualSelection()
          return
        }
        if (sameKeys(rootSelection.keys, marqueeKeysRef.current)) return

        const { indices, keys } = rootSelection
        const first = indices[0]
        const last = indices.at(-1)
        const consecutive = indices.every(
          (index, position) =>
            position === 0 || index === indices[position - 1] + 1
        )
        if (first === undefined || last === undefined || !consecutive) {
          clearVisualSelection()
          return
        }

        const elements = [...keys].flatMap((key) => {
          const element = editor.getElementByKey(key)
          return element ? [element] : []
        })
        if (elements.length !== keys.size) {
          clearVisualSelection()
          return
        }

        keyboardRangeRef.current = {
          anchorIndex: first,
          focusIndex: last,
        }
        previousSelectionRef.current = null
        setVisualSelection(elements, keys)
        stage.dataset.blockSelectionMode = "keyboard"
      }
    )
    const unregisterKeyboardSelection = editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        const target = event.target
        const targetElement =
          target instanceof Element
            ? target
            : target instanceof Node
              ? target.parentElement
              : null
        if (targetElement?.closest(LOCAL_EDITOR_CONTROL_SELECTOR)) {
          return false
        }

        const selection = $getSelection()
        if ($isNodeSelection(selection)) {
          const selectedIndices = selectedRootIndices()
          if (selectedIndices.length === 0) return false

          if (event.key === "Backspace" || event.key === "Delete") {
            event.preventDefault()
            return deleteSelectedRootBlocks(selectedIndices)
          }

          if (matches(event, "selection.clear")) {
            event.preventDefault()
            const preferredIndex =
              keyboardRangeRef.current?.focusIndex ??
              selectedIndices.at(-1) ??
              0
            const previous = previousSelectionRef.current
            clearVisualSelection()
            restoreCaret(preferredIndex, previous)
            return true
          }

          if (matches(event, "selection.select-all-blocks")) {
            event.preventDefault()
            const blockCount = $getRoot().getChildrenSize()
            return setKeyboardSelection({
              anchorIndex: 0,
              focusIndex: Math.max(0, blockCount - 1),
            })
          }

          const direction = matches(event, "selection.extend-up")
            ? -1
            : matches(event, "selection.extend-down")
              ? 1
              : null
          if (direction === null) return false
          event.preventDefault()
          const current = keyboardRangeRef.current ?? {
            anchorIndex:
              direction < 0
                ? (selectedIndices.at(-1) ?? 0)
                : selectedIndices[0],
            focusIndex:
              direction < 0
                ? selectedIndices[0]
                : (selectedIndices.at(-1) ?? 0),
          }
          return setKeyboardSelection(
            extendKeyboardBlockSelection(
              current,
              direction,
              $getRoot().getChildrenSize()
            )
          )
        }

        if (
          !matches(event, "selection.enter-block") ||
          stage.querySelector('[role="dialog"], [role="menu"]')
        ) {
          return false
        }
        if (!selection) return false

        const selectedNode = $isTableSelection(selection)
          ? selection.focus.getNode()
          : $isRangeSelection(selection) && selection.isCollapsed()
            ? selection.anchor.getNode()
            : null
        if (!selectedNode) return false
        const topLevel = rootBlockContaining(selectedNode)
        if (!topLevel) return false
        const index = $getRoot()
          .getChildren()
          .findIndex((node) => node.getKey() === topLevel.getKey())
        if (index < 0) return false

        event.preventDefault()
        previousSelectionRef.current = selection.clone()
        return setKeyboardSelection({ anchorIndex: index, focusIndex: index })
      },
      COMMAND_PRIORITY_HIGH
    )
    const unregisterKeyboardSelectionSync = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const range = keyboardRangeRef.current
        if (!range) return false
        if (
          [...selectedElementsRef.current].some(
            (element) => !root.contains(element)
          )
        ) {
          clearVisualSelection()
          return false
        }

        const selection = $getSelection()
        if ($isNodeSelection(selection)) return false
        const expectedIndices = keyboardBlockSelectionIndices(
          range,
          $getRoot().getChildrenSize()
        )
        const selectedIndices = selectedRootIndices()
        if (
          expectedIndices.length === selectedIndices.length &&
          expectedIndices.every((index, position) =>
            Object.is(index, selectedIndices[position])
          )
        ) {
          return false
        }

        return setKeyboardSelection(range)
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
      stage.removeEventListener("scroll", updateSelectionHintPosition)
      window.removeEventListener("resize", updateSelectionHintPosition)
      window.removeEventListener("scroll", updateSelectionHintPosition, true)
      window.removeEventListener("pointermove", onPointerMove, true)
      window.removeEventListener("pointerup", onPointerUp, true)
      window.removeEventListener("pointercancel", onPointerCancel, true)
      stage.removeEventListener("click", onClick, true)
      unregisterUpdate()
      unregisterKeyboardSelection()
      unregisterKeyboardSelectionSync()
      clearVisualSelection()
      delete stage.dataset.blockMarqueeActive
      delete stage.dataset.blockMarqueeZone
    }
  }, [editor, matches, rootElement])

  const editSourceShortcut = label("selection.edit-source")
  return (
    <>
      {rectangle ? (
        <div
          className="eme-block-marquee"
          data-block-marquee="true"
          aria-hidden="true"
          style={rectangle satisfies CSSProperties}
        />
      ) : null}
      {!rectangle && selectionHintPosition && editSourceShortcut ? (
        <div
          className="eme-selection-shortcut-hint"
          data-selection-shortcut-hint="true"
          aria-hidden="true"
          style={selectionHintPosition}
        >
          <kbd>{editSourceShortcut}</kbd>
          <span>Edit source</span>
        </div>
      ) : null}
    </>
  )
}
