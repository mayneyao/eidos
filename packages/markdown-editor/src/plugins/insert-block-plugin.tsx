import { $createCodeNode, $isCodeNode } from "@lexical/code-core"
import { $isLinkNode } from "@lexical/link"
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode"
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text"
import { $setBlocksType, createDOMRange } from "@lexical/selection"
import { INSERT_TABLE_COMMAND } from "@lexical/table"
import { micromark } from "micromark"
import { gfm } from "micromark-extension-gfm"
import {
  $createNodeSelection,
  $createParagraphNode,
  $createRangeSelection,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isNodeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  KEY_DOWN_COMMAND,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
  type ElementNode,
  type LexicalNode,
  type LexicalEditor,
  type NodeKey,
  type RangeSelection,
} from "lexical"
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import {
  $createEfmBlockNode,
  $createEfmInlineNode,
  $isEfmBlockNode,
  OPEN_EFM_BLOCK_EDITOR_COMMAND,
} from "../nodes/efm-semantic-node"
import { $isEfmSourceBlockNode } from "../nodes/efm-source-block-node"
import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"
import type { EfmInputProfile, MarkdownEditorLabels } from "../types"

type ComposerKind = "footnote" | "frontmatter" | "html" | "inline-math"
type PlaceholderKind = "image" | "math"
type InsertPlacement = "after" | "replace-empty"
type InsertMenuMode = "block" | "inline"
type ImmediateKind =
  | "bullet-list"
  | "check-list"
  | "code"
  | "divider"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "number-list"
  | "quote"
  | "table"

interface MenuPosition {
  gutterLeft: number
  gutterTop: number
  menuLeft: number
  menuTop: number
}

interface InlineMenuAnchor {
  key: NodeKey
  offset: number
  type: "element" | "text"
}

interface BlockDropTarget {
  key: NodeKey
  position: "after" | "before"
}

interface BlockDragState {
  active: boolean
  animationFrame: number | null
  currentY: number
  origin: { x: number; y: number }
  pointerId: number
  root: HTMLElement
  sourceElement: HTMLElement
  sourceKey: NodeKey
  stage: HTMLElement
  target: BlockDropTarget | null
}

interface DropIndicator {
  left: number
  top: number
  width: number
}

interface InsertMenuItem {
  glyph: string
  id: ComposerKind | ImmediateKind | PlaceholderKind
  label: string
  section: "basic" | "extended"
  unavailable?: string
}

const INSERT_MENU_SECTIONS = ["basic", "extended"] as const
const BLOCK_DRAG_THRESHOLD = 4
const BLOCK_DRAG_SCROLL_EDGE = 56
const BLOCK_DRAG_MAX_SCROLL_SPEED = 18
const BLOCK_GUTTER_WIDTH = 50
const BLOCK_GUTTER_CONTENT_GAP = 4
const INSERT_MENU_WIDTH = 296
const VIEWPORT_INSET = 8

function blockDragScrollVelocity(pointerY: number, viewport: DOMRect): number {
  if (pointerY < viewport.top + BLOCK_DRAG_SCROLL_EDGE) {
    const strength = Math.min(
      1,
      (viewport.top + BLOCK_DRAG_SCROLL_EDGE - pointerY) /
        BLOCK_DRAG_SCROLL_EDGE
    )
    return -Math.max(1, Math.round(BLOCK_DRAG_MAX_SCROLL_SPEED * strength))
  }
  if (pointerY > viewport.bottom - BLOCK_DRAG_SCROLL_EDGE) {
    const strength = Math.min(
      1,
      (pointerY - (viewport.bottom - BLOCK_DRAG_SCROLL_EDGE)) /
        BLOCK_DRAG_SCROLL_EDGE
    )
    return Math.max(1, Math.round(BLOCK_DRAG_MAX_SCROLL_SPEED * strength))
  }
  return 0
}

function firstAvailableIndex(items: readonly InsertMenuItem[]): number {
  const index = items.findIndex((item) => !item.unavailable)
  return index
}

function nextAvailableIndex(
  items: readonly InsertMenuItem[],
  currentIndex: number,
  direction: 1 | -1
): number {
  if (items.length === 0) return -1
  let next = currentIndex < 0 ? (direction === 1 ? -1 : 0) : currentIndex
  for (let attempts = 0; attempts < items.length; attempts += 1) {
    next = (next + direction + items.length) % items.length
    if (!items[next]?.unavailable) return next
  }
  return currentIndex
}

const COMPOSER_DEFAULTS: Record<ComposerKind, string> = {
  footnote: "",
  frontmatter: "title: Untitled",
  html: "<mark>Highlighted HTML</mark>",
  "inline-math": "",
}

function topLevelNode(node: LexicalNode): LexicalNode | null {
  if (node.getParent() === null) return null
  return node.getTopLevelElementOrThrow()
}

function characterBeforeSelection(selection: RangeSelection): string | null {
  const point = selection.anchor
  const anchor = point.getNode()
  if (point.type === "text" && $isTextNode(anchor) && point.offset > 0) {
    return anchor.getTextContent().slice(0, point.offset).at(-1) ?? null
  }
  if (point.type === "element" && $isElementNode(anchor) && point.offset > 0) {
    const previousChild = anchor.getChildAtIndex(point.offset - 1)
    return previousChild?.getTextContent().at(-1) ?? null
  }

  const top = topLevelNode(anchor)
  let cursor: LexicalNode | null = anchor
  while (cursor && cursor !== top) {
    const previous = cursor.getPreviousSibling()
    if (previous) return previous.getTextContent().at(-1) ?? null
    cursor = cursor.getParent()
  }
  return null
}

function canOpenInlineMenu(selection: RangeSelection): boolean {
  if (selection.hasFormat("code")) return false
  let node: LexicalNode | null = selection.anchor.getNode()
  while (node) {
    if ($isCodeNode(node) || $isLinkNode(node)) return false
    node = node.getParent()
  }
  const previous = characterBeforeSelection(selection)
  return previous === null || /[\s([{]/u.test(previous)
}

function restoreInlineAnchor(anchor: InlineMenuAnchor): boolean {
  const node = $getNodeByKey(anchor.key)
  if (!node?.isAttached()) return false
  const offset =
    anchor.type === "text"
      ? $isTextNode(node)
        ? Math.min(anchor.offset, node.getTextContentSize())
        : null
      : $isElementNode(node)
        ? Math.min(anchor.offset, node.getChildrenSize())
        : null
  if (offset === null) return false
  const selection = $createRangeSelection()
  selection.anchor.set(node.getKey(), offset, anchor.type)
  selection.focus.set(node.getKey(), offset, anchor.type)
  $setSelection(selection)
  return true
}

function inlineAnchorRect(
  editor: LexicalEditor,
  anchor: InlineMenuAnchor
): DOMRect | null {
  const node = $getNodeByKey(anchor.key)
  if (!node?.isAttached()) return null
  const range = createDOMRange(editor, node, anchor.offset, node, anchor.offset)
  if (!range) return null
  const clientRect = range.getClientRects().item(0)
  const rect = clientRect ?? range.getBoundingClientRect()
  if (rect.height > 0 || rect.width > 0) return rect
  return editor.getElementByKey(anchor.key)?.getBoundingClientRect() ?? null
}

function isFixedFrontmatter(node: LexicalNode): boolean {
  return (
    ($isEfmBlockNode(node) && node.getData().kind === "frontmatter") ||
    ($isEfmSourceBlockNode(node) && node.getKind() === "frontmatter")
  )
}

function selectMovedBlock(node: LexicalNode): void {
  if ($isElementNode(node)) {
    node.selectStart()
    return
  }
  const selection = $createNodeSelection()
  selection.add(node.getKey())
  $setSelection(selection)
}

function selectInsertionTarget(
  anchorKey: NodeKey | null,
  placement: InsertPlacement
): ElementNode | null {
  if (!anchorKey) return null
  const anchor = $getNodeByKey(anchorKey)
  if (!anchor || !$isElementNode(anchor)) return null
  if (
    placement === "replace-empty" &&
    $isParagraphNode(anchor) &&
    anchor.getTextContentSize() === 0
  ) {
    anchor.selectEnd()
    return anchor
  }
  const paragraph = $createParagraphNode()
  if (anchor.isAttached()) anchor.insertAfter(paragraph)
  else $getRoot().append(paragraph)
  paragraph.selectStart()
  return paragraph
}

function insertAtomicBlock(
  node: LexicalNode,
  anchorKey: NodeKey | null,
  placement: InsertPlacement
): void {
  const anchor = anchorKey ? $getNodeByKey(anchorKey) : null
  const paragraph = $createParagraphNode()
  if (anchor?.isAttached()) {
    if (
      placement === "replace-empty" &&
      $isParagraphNode(anchor) &&
      anchor.getTextContentSize() === 0
    ) {
      anchor.replace(node)
    } else {
      anchor.insertAfter(node)
    }
  } else {
    $getRoot().append(node)
  }
  node.insertAfter(paragraph)
  paragraph.selectStart()
}

function markdownPreviewHtml(source: string): string {
  return micromark(source, { extensions: [gfm()] })
}

function nextFootnote(rootChildren: readonly LexicalNode[]): {
  identifier: string
  number: number
  referenceId: string
} {
  const identifiers = new Set<string>()
  let highestNumber = 0
  for (const child of rootChildren) {
    if (!$isEfmBlockNode(child)) continue
    const data = child.getData()
    if (data.kind !== "footnote-definition") continue
    if (data.identifier) identifiers.add(data.identifier)
    highestNumber = Math.max(highestNumber, data.number ?? 0)
  }
  let suffix = 1
  let identifier = "note"
  while (identifiers.has(identifier)) {
    suffix += 1
    identifier = `note-${suffix}`
  }
  const number = highestNumber + 1
  return {
    identifier,
    number,
    referenceId: `efm-footnote-reference-${number}-1`,
  }
}

function composerTitle(
  kind: ComposerKind,
  labels: MarkdownEditorLabels
): string {
  switch (kind) {
    case "frontmatter":
      return labels.frontmatter
    case "footnote":
      return labels.footnote
    case "html":
      return labels.rawHtml
    case "inline-math":
      return labels.inlineMath
  }
}

export function InsertBlockPlugin({
  inputProfile,
  labels,
}: {
  inputProfile: EfmInputProfile
  labels: MarkdownEditorLabels
}) {
  const [editor] = useLexicalComposerContext()
  const { ariaKeys, matches } = useMarkdownShortcuts()
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuMode, setMenuMode] = useState<InsertMenuMode>("block")
  const [composer, setComposer] = useState<ComposerKind | null>(null)
  const [primary, setPrimary] = useState("")
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [hasFrontmatter, setHasFrontmatter] = useState(false)
  const [dragDisabled, setDragDisabled] = useState(false)
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null)
  const catalogId = useId()
  const anchorKeyRef = useRef<NodeKey | null>(null)
  const inlineAnchorRef = useRef<InlineMenuAnchor | null>(null)
  const menuModeRef = useRef<InsertMenuMode>("block")
  const placementRef = useRef<InsertPlacement>("after")
  const blockDragRef = useRef<BlockDragState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const items = useMemo<InsertMenuItem[]>(
    () => [
      {
        id: "heading-1",
        label: labels.heading1,
        glyph: "H1",
        section: "basic",
      },
      {
        id: "heading-2",
        label: labels.heading2,
        glyph: "H2",
        section: "basic",
      },
      {
        id: "heading-3",
        label: labels.heading3,
        glyph: "H3",
        section: "basic",
      },
      { id: "quote", label: labels.quote, glyph: "❯", section: "basic" },
      {
        id: "bullet-list",
        label: labels.bulletList,
        glyph: "•",
        section: "basic",
      },
      {
        id: "number-list",
        label: labels.numberedList,
        glyph: "1.",
        section: "basic",
      },
      {
        id: "check-list",
        label: labels.checkList,
        glyph: "☐",
        section: "basic",
      },
      { id: "code", label: labels.codeBlock, glyph: "</>", section: "basic" },
      { id: "table", label: labels.table, glyph: "▦", section: "basic" },
      { id: "divider", label: labels.divider, glyph: "—", section: "basic" },
      {
        id: "math",
        label: labels.mathBlock,
        glyph: "∑",
        section: "extended",
      },
      {
        id: "inline-math",
        label: labels.inlineMath,
        glyph: "√x",
        section: "extended",
      },
      {
        id: "image",
        label: labels.image,
        glyph: "▧",
        section: "extended",
      },
      {
        id: "footnote",
        label: labels.footnote,
        glyph: "¹",
        section: "extended",
      },
      { id: "html", label: labels.rawHtml, glyph: "<>", section: "extended" },
      ...(inputProfile === "document"
        ? [
            {
              id: "frontmatter" as const,
              label: labels.frontmatter,
              glyph: "≡",
              section: "extended" as const,
              ...(hasFrontmatter
                ? { unavailable: labels.frontmatterAlreadyExists }
                : {}),
            },
          ]
        : []),
    ],
    [hasFrontmatter, inputProfile, labels]
  )

  const availableItems = useMemo(
    () =>
      menuMode === "inline"
        ? items.filter((item) => item.id === "inline-math")
        : items.filter((item) => item.id !== "inline-math"),
    [items, menuMode]
  )

  const visibleItems = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
    if (terms.length === 0) return availableItems
    return availableItems.filter((item) => {
      const sectionLabel =
        item.section === "basic" ? labels.basicBlocks : labels.extendedBlocks
      const haystack = [
        item.label,
        item.glyph,
        item.id,
        item.section,
        sectionLabel,
      ]
        .join(" ")
        .toLocaleLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  }, [availableItems, labels.basicBlocks, labels.extendedBlocks, query])

  const changeMenuMode = useCallback((mode: InsertMenuMode) => {
    menuModeRef.current = mode
    setMenuMode(mode)
  }, [])

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    setComposer(null)
    setQuery("")
    setSelectedIndex(0)
    inlineAnchorRef.current = null
    menuModeRef.current = "block"
    setMenuMode("block")
  }, [])

  const placeGutter = useCallback(
    (
      root: HTMLElement,
      block: HTMLElement,
      key: NodeKey,
      fixedFrontmatter: boolean
    ) => {
      anchorKeyRef.current = key
      setDragDisabled(fixedFrontmatter)
      const rootRect = root.getBoundingClientRect()
      const blockRect = block.getBoundingClientRect()
      const rootStyle = window.getComputedStyle(root)
      const contentLeft =
        rootRect.left + Number.parseFloat(rootStyle.paddingInlineStart || "0")
      const gutterLeft = Math.max(
        VIEWPORT_INSET,
        contentLeft - BLOCK_GUTTER_WIDTH - BLOCK_GUTTER_CONTENT_GAP
      )
      const gutterTop = Math.min(
        Math.max(VIEWPORT_INSET, blockRect.top),
        window.innerHeight - 32
      )
      const blockMenuLeft = Math.max(
        VIEWPORT_INSET,
        Math.min(
          contentLeft - BLOCK_GUTTER_CONTENT_GAP,
          window.innerWidth - INSERT_MENU_WIDTH - VIEWPORT_INSET
        )
      )
      const inlineRect =
        menuModeRef.current === "inline" && inlineAnchorRef.current
          ? inlineAnchorRect(editor, inlineAnchorRef.current)
          : null
      const menuHeight =
        menuRef.current?.getBoundingClientRect().height ??
        (menuModeRef.current === "inline" ? 184 : 440)
      const menuLeft = inlineRect
        ? Math.max(
            VIEWPORT_INSET,
            Math.min(
              inlineRect.left,
              window.innerWidth - INSERT_MENU_WIDTH - VIEWPORT_INSET
            )
          )
        : blockMenuLeft
      const proposedTop = inlineRect ? inlineRect.bottom + 8 : gutterTop + 30
      const fitsBelow =
        proposedTop + menuHeight <= window.innerHeight - VIEWPORT_INSET
      const menuTop =
        inlineRect && !fitsBelow
          ? Math.max(VIEWPORT_INSET, inlineRect.top - menuHeight - 8)
          : Math.max(
              VIEWPORT_INSET,
              Math.min(
                proposedTop,
                window.innerHeight - menuHeight - VIEWPORT_INSET
              )
            )
      setPosition({
        gutterLeft,
        gutterTop,
        menuLeft,
        menuTop,
      })
    },
    [editor]
  )

  const updatePosition = useCallback(() => {
    if (!editor.isEditable()) {
      setPosition(null)
      closeMenu()
      return
    }
    editor.getEditorState().read(() => {
      const root = editor.getRootElement()
      const selection = $getSelection()
      if (!root) {
        setPosition(null)
        return
      }
      let top: LexicalNode | null = null
      if (menuModeRef.current === "inline" && inlineAnchorRef.current) {
        const inlineAnchor = $getNodeByKey(inlineAnchorRef.current.key)
        if (inlineAnchor) top = topLevelNode(inlineAnchor)
      }
      if ($isRangeSelection(selection) && selection.isCollapsed()) {
        top ??= topLevelNode(selection.anchor.getNode())
      } else if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes()
        if (nodes.length === 1) top ??= topLevelNode(nodes[0])
      }
      if (!top) {
        setPosition(null)
        setDragDisabled(false)
        if (!menuOpen) anchorKeyRef.current = null
        return
      }
      const block = editor.getElementByKey(top.getKey())
      if (!block) {
        setPosition(null)
        return
      }
      placeGutter(root, block, top.getKey(), isFixedFrontmatter(top))
      const rootChildren = $getRoot().getChildren()
      setHasFrontmatter(
        rootChildren.some(
          (child) =>
            ($isEfmBlockNode(child) &&
              child.getData().kind === "frontmatter") ||
            ($isEfmSourceBlockNode(child) && child.getKind() === "frontmatter")
        )
      )
    })
  }, [closeMenu, editor, menuOpen, placeGutter])

  useEffect(() => {
    const unregisterUpdate = editor.registerUpdateListener(({ editorState }) =>
      editorState.read(updatePosition)
    )
    const unregisterSelection = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updatePosition()
        return false
      },
      COMMAND_PRIORITY_LOW
    )
    const unregisterEditable = editor.registerEditableListener(updatePosition)
    const handleViewportChange = () => updatePosition()
    window.addEventListener("resize", handleViewportChange)
    document.addEventListener("scroll", handleViewportChange, true)
    updatePosition()
    return () => {
      unregisterUpdate()
      unregisterSelection()
      unregisterEditable()
      window.removeEventListener("resize", handleViewportChange)
      document.removeEventListener("scroll", handleViewportChange, true)
    }
  }, [editor, updatePosition])

  useEffect(() => {
    const handleBlockHover = (event: PointerEvent) => {
      if (
        event.buttons !== 0 ||
        menuOpen ||
        blockDragRef.current ||
        !editor.isEditable()
      ) {
        return
      }
      const root = editor.getRootElement()
      const target = event.target
      if (!root || !(target instanceof HTMLElement)) return
      let block: HTMLElement | null = target
      while (block && block.parentElement !== root) {
        block = block.parentElement
      }
      if (!block) return
      editor.read(() => {
        const nearest = $getNearestNodeFromDOMNode(block)
        const top = nearest ? topLevelNode(nearest) : null
        if (!top) return
        placeGutter(root, block, top.getKey(), isFixedFrontmatter(top))
      })
    }

    return editor.registerRootListener((root, previousRoot) => {
      previousRoot?.removeEventListener("pointermove", handleBlockHover)
      root?.addEventListener("pointermove", handleBlockHover)
    })
  }, [editor, menuOpen, placeGutter])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuOpen || menuRef.current?.contains(event.target as Node)) return
      closeMenu()
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [closeMenu, menuOpen])

  useEffect(() => {
    setSelectedIndex(firstAvailableIndex(visibleItems))
  }, [visibleItems])

  useEffect(() => {
    if (!menuOpen || composer) return
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [composer, menuOpen])

  useEffect(() => {
    if (!menuOpen || composer) return
    const selected = menuRef.current?.querySelector<HTMLElement>(
      '[data-selected="true"]'
    )
    selected?.scrollIntoView({ block: "nearest" })
  }, [composer, menuOpen, selectedIndex])

  useEffect(() => {
    if (!menuOpen) return
    const frame = window.requestAnimationFrame(updatePosition)
    return () => window.cancelAnimationFrame(frame)
  }, [composer, menuMode, menuOpen, updatePosition, visibleItems.length])

  const focusEditor = useCallback(() => {
    window.requestAnimationFrame(() => editor.focus())
  }, [editor])

  const dismissMenuToEditor = useCallback(() => {
    closeMenu()
    focusEditor()
  }, [closeMenu, focusEditor])

  const activeTopLevelKey = (): NodeKey | null =>
    editor.read(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection) && selection.isCollapsed()) {
        return topLevelNode(selection.anchor.getNode())?.getKey() ?? null
      }
      if ($isNodeSelection(selection)) {
        const nodes = selection.getNodes()
        if (nodes.length === 1) {
          return topLevelNode(nodes[0])?.getKey() ?? null
        }
      }
      return null
    })

  const updateBlockDropTarget = (drag: BlockDragState) => {
    const elements = [...drag.root.children].filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.getClientRects().length > 0
    )
    if (elements.length === 0) {
      drag.target = null
      setDropIndicator(null)
      return
    }

    let targetElement = elements[elements.length - 1]
    let targetPosition: BlockDropTarget["position"] = "after"
    for (const element of elements) {
      const rect = element.getBoundingClientRect()
      if (drag.currentY < rect.top + rect.height / 2) {
        targetElement = element
        targetPosition = "before"
        break
      }
    }

    const target = editor.read(() => {
      const nearest = $getNearestNodeFromDOMNode(targetElement)
      const top = nearest ? topLevelNode(nearest) : null
      if (!top) return null
      if (isFixedFrontmatter(top) && targetPosition === "before") {
        targetPosition = "after"
      }
      return { key: top.getKey(), position: targetPosition }
    })
    if (!target) {
      drag.target = null
      setDropIndicator(null)
      return
    }

    drag.target = target
    const targetRect = targetElement.getBoundingClientRect()
    const rootRect = drag.root.getBoundingClientRect()
    const rootStyle = window.getComputedStyle(drag.root)
    const left =
      rootRect.left + Number.parseFloat(rootStyle.paddingInlineStart || "0")
    const right =
      rootRect.right - Number.parseFloat(rootStyle.paddingInlineEnd || "0")
    setDropIndicator({
      left,
      top: target.position === "before" ? targetRect.top : targetRect.bottom,
      width: Math.max(0, right - left),
    })
  }

  const scheduleBlockDragAutoScroll = (drag: BlockDragState) => {
    if (drag.animationFrame !== null) return
    drag.animationFrame = window.requestAnimationFrame(() => {
      drag.animationFrame = null
      if (blockDragRef.current !== drag || !drag.active) return
      const velocity = blockDragScrollVelocity(
        drag.currentY,
        drag.stage.getBoundingClientRect()
      )
      if (velocity === 0) return
      const previousScrollTop = drag.stage.scrollTop
      drag.stage.scrollTop += velocity
      if (drag.stage.scrollTop !== previousScrollTop) {
        updateBlockDropTarget(drag)
      }
      scheduleBlockDragAutoScroll(drag)
    })
  }

  const finishBlockDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    commit: boolean
  ) => {
    const drag = blockDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.animationFrame !== null) {
      window.cancelAnimationFrame(drag.animationFrame)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    drag.sourceElement.classList.remove("eme-block-dragging")
    delete drag.stage.dataset.blockDragging
    blockDragRef.current = null
    setDropIndicator(null)

    if (!commit || !drag.active || !drag.target) return
    const { sourceKey, target } = drag
    editor.update(
      () => {
        const source = $getNodeByKey(sourceKey)
        const destination = $getNodeByKey(target.key)
        if (
          !source ||
          !destination ||
          source === destination ||
          isFixedFrontmatter(source)
        ) {
          return
        }
        if (target.position === "before") {
          if (
            source.getNextSibling() === destination ||
            isFixedFrontmatter(destination)
          ) {
            return
          }
          destination.insertBefore(source)
        } else {
          if (source.getPreviousSibling() === destination) return
          destination.insertAfter(source)
        }
        selectMovedBlock(source)
      },
      { tag: HISTORY_PUSH_TAG }
    )
  }

  const handleBlockDragPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (event.button !== 0 || dragDisabled || blockDragRef.current) return
    const sourceKey = activeTopLevelKey() ?? anchorKeyRef.current
    const root = editor.getRootElement()
    const stage = root?.closest<HTMLElement>(".eme-editor-stage") ?? null
    const sourceElement = sourceKey ? editor.getElementByKey(sourceKey) : null
    if (!sourceKey || !root || !stage || !sourceElement) return

    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    closeMenu()
    blockDragRef.current = {
      active: false,
      animationFrame: null,
      currentY: event.clientY,
      origin: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      root,
      sourceElement,
      sourceKey,
      stage,
      target: null,
    }
  }

  const handleBlockDragPointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    const drag = blockDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    drag.currentY = event.clientY
    if (
      !drag.active &&
      Math.hypot(event.clientX - drag.origin.x, event.clientY - drag.origin.y) <
        BLOCK_DRAG_THRESHOLD
    ) {
      return
    }

    event.preventDefault()
    if (!drag.active) {
      drag.active = true
      drag.sourceElement.classList.add("eme-block-dragging")
      drag.stage.dataset.blockDragging = "true"
    }
    updateBlockDropTarget(drag)
    scheduleBlockDragAutoScroll(drag)
  }

  const handleBlockDragKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) => {
    const historyCommand = matches(event, "history.redo")
      ? REDO_COMMAND
      : matches(event, "history.undo")
        ? UNDO_COMMAND
        : null
    if (historyCommand) {
      event.preventDefault()
      editor.dispatchCommand(historyCommand, undefined)
      return
    }
    const direction = matches(event, "block.move-up")
      ? "up"
      : matches(event, "block.move-down")
        ? "down"
        : null
    if (!direction) return
    event.preventDefault()
    const sourceKey = activeTopLevelKey() ?? anchorKeyRef.current
    if (!sourceKey || dragDisabled) return
    editor.update(
      () => {
        const source = $getNodeByKey(sourceKey)
        if (!source || isFixedFrontmatter(source)) return
        const sibling =
          direction === "up"
            ? source.getPreviousSibling()
            : source.getNextSibling()
        if (!sibling || isFixedFrontmatter(sibling)) return
        if (direction === "up") sibling.insertBefore(source)
        else sibling.insertAfter(source)
        selectMovedBlock(source)
      },
      { tag: HISTORY_PUSH_TAG }
    )
  }

  useEffect(
    () => () => {
      const drag = blockDragRef.current
      if (drag?.animationFrame != null) {
        window.cancelAnimationFrame(drag.animationFrame)
      }
      drag?.sourceElement.classList.remove("eme-block-dragging")
      if (drag) delete drag.stage.dataset.blockDragging
      blockDragRef.current = null
    },
    []
  )

  const runImmediate = useCallback(
    (kind: ImmediateKind) => {
      const placement = placementRef.current
      if (kind === "bullet-list") {
        editor.update(() =>
          selectInsertionTarget(anchorKeyRef.current, placement)
        )
        editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
      } else if (kind === "number-list") {
        editor.update(() =>
          selectInsertionTarget(anchorKeyRef.current, placement)
        )
        editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
      } else if (kind === "check-list") {
        editor.update(() =>
          selectInsertionTarget(anchorKeyRef.current, placement)
        )
        editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
      } else if (kind === "divider") {
        editor.update(() =>
          selectInsertionTarget(anchorKeyRef.current, placement)
        )
        editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
      } else if (kind === "table") {
        editor.update(() =>
          selectInsertionTarget(anchorKeyRef.current, placement)
        )
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
          columns: "3",
          rows: "3",
          includeHeaders: { rows: true, columns: false },
        })
      } else {
        editor.update(() => {
          const anchor = selectInsertionTarget(anchorKeyRef.current, placement)
          if (!anchor) return
          const selection = $getSelection()
          if (kind === "heading-1") {
            $setBlocksType(selection, () => $createHeadingNode("h1"))
          } else if (kind === "heading-2") {
            $setBlocksType(selection, () => $createHeadingNode("h2"))
          } else if (kind === "heading-3") {
            $setBlocksType(selection, () => $createHeadingNode("h3"))
          } else if (kind === "quote") {
            $setBlocksType(selection, $createQuoteNode)
          } else if (kind === "code") {
            $setBlocksType(selection, $createCodeNode)
          }
        })
      }
      closeMenu()
      focusEditor()
    },
    [closeMenu, editor, focusEditor]
  )

  const openComposer = useCallback((kind: ComposerKind) => {
    setPrimary(COMPOSER_DEFAULTS[kind])
    setComposer(kind)
  }, [])

  const insertPlaceholder = useCallback(
    (kind: PlaceholderKind) => {
      let insertedKey: NodeKey | null = null
      editor.update(
        () => {
          const node =
            kind === "math"
              ? $createEfmBlockNode({
                  kind: "math",
                  source: "$$\n\n$$",
                  value: "",
                })
              : $createEfmBlockNode({
                  kind: "image",
                  source: "![]()",
                  url: "",
                  alt: "",
                })
          insertedKey = node.getKey()
          insertAtomicBlock(node, anchorKeyRef.current, placementRef.current)
        },
        { tag: HISTORY_PUSH_TAG }
      )
      closeMenu()

      const requestEditor = (remainingAttempts: number) => {
        window.requestAnimationFrame(() => {
          if (!insertedKey) return
          const opened = editor.dispatchCommand(
            OPEN_EFM_BLOCK_EDITOR_COMMAND,
            insertedKey
          )
          if (!opened && remainingAttempts > 0) {
            requestEditor(remainingAttempts - 1)
          }
        })
      }
      requestEditor(2)
    },
    [closeMenu, editor]
  )

  const chooseItem = useCallback(
    (item: InsertMenuItem) => {
      if (item.unavailable) return
      if (item.id === "image" || item.id === "math") {
        insertPlaceholder(item.id)
      } else if (
        item.id === "footnote" ||
        item.id === "frontmatter" ||
        item.id === "html" ||
        item.id === "inline-math"
      ) {
        openComposer(item.id)
      } else {
        runImmediate(item.id)
      }
    },
    [insertPlaceholder, openComposer, runImmediate]
  )

  const handleCatalogKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      const menuDirection = matches(event, "menu.next")
        ? 1
        : matches(event, "menu.previous")
          ? -1
          : null
      if (menuDirection) {
        event.preventDefault()
        event.stopPropagation()
        setSelectedIndex((current) =>
          nextAvailableIndex(visibleItems, current, menuDirection)
        )
        return
      }
      if (matches(event, "menu.choose")) {
        event.preventDefault()
        event.stopPropagation()
        const item = visibleItems[selectedIndex]
        if (item && !item.unavailable) chooseItem(item)
        return
      }
      if (matches(event, "overlay.dismiss")) {
        event.preventDefault()
        event.stopPropagation()
        dismissMenuToEditor()
      }
    },
    [chooseItem, dismissMenuToEditor, matches, selectedIndex, visibleItems]
  )

  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (menuOpen) {
            if (composer) {
              if (!matches(event, "overlay.dismiss")) return false
              event.preventDefault()
              setComposer(null)
              return true
            }
            const menuDirection = matches(event, "menu.next")
              ? 1
              : matches(event, "menu.previous")
                ? -1
                : null
            if (menuDirection) {
              event.preventDefault()
              setSelectedIndex((current) =>
                nextAvailableIndex(visibleItems, current, menuDirection)
              )
              return true
            }
            if (matches(event, "menu.choose")) {
              event.preventDefault()
              const item = visibleItems[selectedIndex]
              if (item) window.queueMicrotask(() => chooseItem(item))
              return true
            }
            if (matches(event, "overlay.dismiss")) {
              event.preventDefault()
              closeMenu()
              return true
            }
          }

          if (!matches(event, "insert.open-menu")) {
            return false
          }
          const selection = $getSelection()
          if (!$isRangeSelection(selection) || !selection.isCollapsed())
            return false
          const top = topLevelNode(selection.anchor.getNode())
          if (!top) return false
          if ($isParagraphNode(top) && top.getTextContentSize() === 0) {
            inlineAnchorRef.current = null
            changeMenuMode("block")
            anchorKeyRef.current = top.getKey()
            placementRef.current = "replace-empty"
          } else {
            if (!canOpenInlineMenu(selection)) return false
            inlineAnchorRef.current = {
              key: selection.anchor.key,
              offset: selection.anchor.offset,
              type: selection.anchor.type,
            }
            changeMenuMode("inline")
            anchorKeyRef.current = top.getKey()
          }
          const root = editor.getRootElement()
          const block = editor.getElementByKey(top.getKey())
          if (root && block) {
            placeGutter(root, block, top.getKey(), isFixedFrontmatter(top))
          }
          event.preventDefault()
          setMenuOpen(true)
          setComposer(null)
          setQuery("")
          setSelectedIndex(0)
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
    [
      chooseItem,
      changeMenuMode,
      closeMenu,
      composer,
      editor,
      matches,
      menuOpen,
      placeGutter,
      selectedIndex,
      visibleItems,
    ]
  )

  const submitComposer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!composer) return
    if (composer === "inline-math") {
      const value = primary.trim()
      const inlineAnchor = inlineAnchorRef.current
      if (!value || !inlineAnchor) return
      let inserted = false
      editor.update(
        () => {
          if (!restoreInlineAnchor(inlineAnchor)) return
          $insertNodes([
            $createEfmInlineNode({
              kind: "math",
              source: `$${value}$`,
              value,
            }),
          ])
          inserted = true
        },
        { tag: HISTORY_PUSH_TAG }
      )
      if (inserted) {
        closeMenu()
        focusEditor()
      }
      return
    }
    const anchorKey = anchorKeyRef.current
    const placement = placementRef.current
    editor.update(() => {
      if (composer === "frontmatter") {
        const body = primary.trim() || "title: Untitled"
        const node = $createEfmBlockNode({
          kind: "frontmatter",
          source: `---\n${body}\n---`,
        })
        const first = $getRoot().getFirstChild()
        if (first) first.insertBefore(node)
        else $getRoot().append(node)
        const anchor = anchorKey ? $getNodeByKey(anchorKey) : null
        if (anchor && $isElementNode(anchor)) anchor.selectEnd()
      } else if (composer === "html") {
        const source = primary.trim() || "<mark>Highlighted HTML</mark>"
        insertAtomicBlock(
          $createEfmBlockNode({
            kind: "raw-html",
            source,
            previewHtml: markdownPreviewHtml(source),
          }),
          anchorKey,
          placement
        )
      } else {
        const body = primary.trim() || "Footnote text."
        const footnote = nextFootnote($getRoot().getChildren())
        const anchor = selectInsertionTarget(anchorKey, placement)
        if (anchor) {
          $insertNodes([
            $createEfmInlineNode({
              kind: "footnote-reference",
              source: `[^${footnote.identifier}]`,
              identifier: footnote.identifier,
              label: footnote.identifier,
              number: footnote.number,
              referenceId: footnote.referenceId,
            }),
          ])
        }
        $getRoot().append(
          $createEfmBlockNode({
            kind: "footnote-definition",
            source: `[^${footnote.identifier}]: ${body}`,
            identifier: footnote.identifier,
            label: footnote.identifier,
            number: footnote.number,
            referenceIds: [footnote.referenceId],
            previewHtml: markdownPreviewHtml(body),
          })
        )
      }
    })
    closeMenu()
    focusEditor()
  }

  if (!position) return null

  return (
    <>
      <div
        className="eme-block-gutter"
        data-block-gutter="true"
        style={{ left: position.gutterLeft, top: position.gutterTop }}
      >
        <button
          type="button"
          className="eme-insert-trigger"
          aria-label={labels.addBlockBelow}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          title={labels.addBlockBelow}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (menuOpen) {
              closeMenu()
              return
            }
            inlineAnchorRef.current = null
            changeMenuMode("block")
            placementRef.current = "after"
            setMenuOpen(true)
            setComposer(null)
            setQuery("")
            setSelectedIndex(0)
          }}
        >
          +
        </button>
        <button
          type="button"
          className="eme-block-drag-handle"
          aria-label={labels.dragBlock}
          aria-keyshortcuts={ariaKeys(["block.move-up", "block.move-down"])}
          title={labels.dragBlock}
          disabled={dragDisabled}
          onClick={(event) => event.preventDefault()}
          onKeyDown={handleBlockDragKeyDown}
          onPointerDown={handleBlockDragPointerDown}
          onPointerMove={handleBlockDragPointerMove}
          onPointerUp={(event) => finishBlockDrag(event, true)}
          onPointerCancel={(event) => finishBlockDrag(event, false)}
        >
          <svg aria-hidden="true" viewBox="0 0 12 16">
            <circle cx="3" cy="3" r="1.25" />
            <circle cx="9" cy="3" r="1.25" />
            <circle cx="3" cy="8" r="1.25" />
            <circle cx="9" cy="8" r="1.25" />
            <circle cx="3" cy="13" r="1.25" />
            <circle cx="9" cy="13" r="1.25" />
          </svg>
        </button>
      </div>
      {dropIndicator ? (
        <div
          className="eme-block-drop-indicator"
          data-block-drop-indicator="true"
          aria-hidden="true"
          style={dropIndicator}
        />
      ) : null}
      {menuOpen ? (
        <div
          ref={menuRef}
          className="eme-insert-menu"
          style={{ left: position.menuLeft, top: position.menuTop }}
          role="dialog"
          aria-label={
            menuMode === "inline" ? labels.insertInline : labels.insertBlock
          }
          data-context={menuMode}
          data-composing={composer ? "true" : undefined}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {composer ? (
            <form className="eme-insert-composer" onSubmit={submitComposer}>
              <div className="eme-insert-composer-header">
                <button
                  type="button"
                  aria-label={labels.backToInsertMenu}
                  onClick={() => setComposer(null)}
                >
                  ←
                </button>
                <strong>{composerTitle(composer, labels)}</strong>
              </div>
              <label>
                <span>
                  {composer === "inline-math"
                    ? labels.formulaSource
                    : composer === "frontmatter"
                      ? labels.frontmatterYaml
                      : composer === "footnote"
                        ? labels.footnoteText
                        : labels.htmlSource}
                </span>
                {composer === "inline-math" ? (
                  <input
                    autoFocus
                    aria-label={labels.formulaSource}
                    aria-keyshortcuts={ariaKeys([
                      "composer.confirm",
                      "overlay.dismiss",
                    ])}
                    value={primary}
                    spellCheck={false}
                    onChange={(event) => setPrimary(event.target.value)}
                    onKeyDown={(event) => {
                      if (matches(event, "composer.confirm")) {
                        event.preventDefault()
                        event.stopPropagation()
                        event.currentTarget.form?.requestSubmit()
                        return
                      }
                      if (matches(event, "overlay.dismiss")) {
                        event.preventDefault()
                        event.stopPropagation()
                        setComposer(null)
                      }
                    }}
                  />
                ) : (
                  <textarea
                    autoFocus
                    aria-keyshortcuts={ariaKeys([
                      "block-editor.commit",
                      "overlay.dismiss",
                    ])}
                    value={primary}
                    spellCheck={composer === "footnote"}
                    onChange={(event) => setPrimary(event.target.value)}
                    onKeyDown={(event) => {
                      if (matches(event, "block-editor.commit")) {
                        event.preventDefault()
                        event.stopPropagation()
                        event.currentTarget.form?.requestSubmit()
                        return
                      }
                      if (matches(event, "overlay.dismiss")) {
                        event.preventDefault()
                        event.stopPropagation()
                        setComposer(null)
                      }
                    }}
                  />
                )}
              </label>
              <div className="eme-insert-composer-actions">
                <button type="button" onClick={dismissMenuToEditor}>
                  {labels.cancelBlockEdit}
                </button>
                <button type="submit" data-primary="true">
                  {labels.insert}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="eme-insert-menu-header">
                <div className="eme-insert-menu-title">
                  {menuMode === "inline"
                    ? labels.insertInline
                    : labels.insertBlock}
                </div>
                <input
                  ref={searchInputRef}
                  className="eme-insert-menu-search"
                  type="search"
                  role="searchbox"
                  aria-label={
                    menuMode === "inline"
                      ? labels.filterInline
                      : labels.filterBlocks
                  }
                  aria-controls={catalogId}
                  aria-keyshortcuts={ariaKeys([
                    "menu.previous",
                    "menu.next",
                    "menu.choose",
                    "overlay.dismiss",
                  ])}
                  placeholder={`${
                    menuMode === "inline"
                      ? labels.filterInline
                      : labels.filterBlocks
                  }…`}
                  autoComplete="off"
                  spellCheck={false}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={handleCatalogKeyDown}
                />
              </div>
              <div
                id={catalogId}
                className="eme-insert-menu-catalog"
                role="menu"
                aria-label={
                  menuMode === "inline"
                    ? labels.insertInline
                    : labels.insertBlock
                }
                data-layout="list"
              >
                {INSERT_MENU_SECTIONS.map((section) => {
                  const sectionItems = visibleItems.filter(
                    (item) => item.section === section
                  )
                  if (sectionItems.length === 0) return null
                  const sectionLabel =
                    section === "basic"
                      ? labels.basicBlocks
                      : labels.extendedBlocks
                  const sectionLabelId = `eme-insert-menu-${section}`
                  return (
                    <div
                      className="eme-insert-menu-section"
                      key={section}
                      role="group"
                      aria-labelledby={sectionLabelId}
                    >
                      <span
                        id={sectionLabelId}
                        className="eme-insert-menu-section-label"
                      >
                        {sectionLabel}
                      </span>
                      {sectionItems.map((item) => {
                        const index = visibleItems.indexOf(item)
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            disabled={Boolean(item.unavailable)}
                            data-selected={
                              (selectedIndex === index && !item.unavailable) ||
                              undefined
                            }
                            title={item.unavailable}
                            onMouseEnter={() => setSelectedIndex(index)}
                            onClick={() => chooseItem(item)}
                          >
                            <span aria-hidden="true">{item.glyph}</span>
                            <span>{item.label}</span>
                            {item.unavailable ? (
                              <small>{item.unavailable}</small>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
                {visibleItems.length === 0 ? (
                  <div className="eme-insert-menu-empty" role="status">
                    {menuMode === "inline"
                      ? labels.noMatchingInlineCommands
                      : labels.noMatchingBlocks}
                  </div>
                ) : null}
              </div>
              <div className="eme-insert-menu-hint">
                {menuMode === "inline"
                  ? labels.inlineMenuHint
                  : labels.insertMenuHint}
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  )
}
