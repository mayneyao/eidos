import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type RefObject,
} from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $isListItemNode, $isListNode } from "@lexical/list"
import { eventFiles } from "@lexical/rich-text"
import { mergeRegister } from "@lexical/utils"
import {
  $createNodeSelection,
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical"

const BLOCK_DRAG_DATA = "application/x-eidos-markdown-block"
const SELECTED_BLOCK_CLASS = "eidos-md-block-selected"

interface MarqueeBox {
  height: number
  left: number
  top: number
  width: number
}

function topLevelNode(node: LexicalNode): LexicalNode {
  return node.getTopLevelElementOrThrow()
}

function selectableBlockNode(node: LexicalNode): LexicalNode {
  let candidate: LexicalNode | null = node
  while (candidate) {
    if ($isListItemNode(candidate)) return candidate
    const parent: LexicalNode | null = candidate.getParent()
    if (!parent || parent.getType() === "root") break
    candidate = parent
  }
  return topLevelNode(node)
}

function selectableBlockElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children).flatMap((element) => {
    if (!(element instanceof HTMLElement)) return []
    if (!element.matches("ol, ul")) return [element]
    const listItems = Array.from(element.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.matches("li")
    )
    return listItems.length > 0 ? listItems : [element]
  })
}

function allSelectableBlockKeys(): NodeKey[] {
  return $getRoot()
    .getChildren()
    .flatMap((node) =>
      $isListNode(node)
        ? node
            .getChildren()
            .flatMap((child) =>
              $isListItemNode(child) ? [child.getKey()] : []
            )
        : [node.getKey()]
    )
}

function nextSelectableBlock(node: LexicalNode): LexicalNode | null {
  const block = selectableBlockNode(node)
  const next = block.getNextSibling()
  if (next) {
    if ($isListNode(next)) return next.getFirstChild()
    return next
  }
  if ($isListItemNode(block)) return block.getParent()?.getNextSibling() ?? null
  return null
}

function previousSelectableBlock(node: LexicalNode): LexicalNode | null {
  const block = selectableBlockNode(node)
  const previous = block.getPreviousSibling()
  if (previous) {
    if ($isListNode(previous)) return previous.getLastChild()
    return previous
  }
  if ($isListItemNode(block)) {
    return block.getParent()?.getPreviousSibling() ?? null
  }
  return null
}

function selectBlocks(keys: readonly NodeKey[]) {
  if (keys.length === 0) {
    $setSelection(null)
    return
  }
  const selection = $createNodeSelection()
  for (const key of keys) selection.add(key)
  $setSelection(selection)
}

function blockElementAtTarget(
  editor: LexicalEditor,
  target: EventTarget | null
): HTMLElement | null {
  const root = editor.getRootElement()
  if (!root || !(target instanceof Node)) return null
  const targetElement =
    target instanceof Element ? target : target.parentElement
  const listItem = targetElement?.closest("li")
  if (listItem instanceof HTMLElement && root.contains(listItem)) {
    return listItem
  }
  return (
    (Array.from(root.children).find((element) => element.contains(target)) as
      | HTMLElement
      | undefined) ?? null
  )
}

function nodeForBlockElement(
  editor: LexicalEditor,
  element: HTMLElement
): LexicalNode | null {
  let node: LexicalNode | null = null
  editor.getEditorState().read(
    () => {
      const nearest = $getNearestNodeFromDOMNode(element)
      node = nearest ? selectableBlockNode(nearest) : null
    },
    { editor }
  )
  return node
}

export function BlockSelectionPlugin({
  surfaceRef,
}: {
  surfaceRef: RefObject<HTMLDivElement | null>
}) {
  const [editor] = useLexicalComposerContext()
  const selectedKeysRef = useRef<Set<NodeKey>>(new Set())
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null)

  const paintSelection = useCallback(() => {
    const nextKeys = new Set<NodeKey>()
    const selection = $getSelection()
    if ($isNodeSelection(selection)) {
      for (const node of selection.getNodes()) {
        nextKeys.add(selectableBlockNode(node).getKey())
      }
    }

    for (const key of selectedKeysRef.current) {
      if (!nextKeys.has(key)) {
        editor.getElementByKey(key)?.classList.remove(SELECTED_BLOCK_CLASS)
      }
    }
    for (const key of nextKeys) {
      editor.getElementByKey(key)?.classList.add(SELECTED_BLOCK_CLASS)
    }
    selectedKeysRef.current = nextKeys
  }, [editor])

  const deleteSelectedBlocks = useCallback(
    (event: KeyboardEvent | null) => {
      const selection = $getSelection()
      if (!$isNodeSelection(selection)) return false
      event?.preventDefault()
      const blocks = new Map(
        selection
          .getNodes()
          .map(selectableBlockNode)
          .map((node) => [node.getKey(), node] as const)
      )
      for (const node of blocks.values()) node.remove()
      const root = $getRoot()
      if (root.isEmpty()) root.append($createParagraphNode())
      root.selectStart()
      queueMicrotask(() => editor.focus())
      return true
    },
    [editor]
  )

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          SELECTION_CHANGE_COMMAND,
          () => {
            paintSelection()
            return false
          },
          COMMAND_PRIORITY_LOW
        ),
        editor.registerCommand(
          KEY_ESCAPE_COMMAND,
          (event) => {
            const selection = $getSelection()
            if (!$isRangeSelection(selection)) return false
            event?.preventDefault()
            selectBlocks([
              selectableBlockNode(selection.anchor.getNode()).getKey(),
            ])
            return true
          },
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          KEY_ARROW_DOWN_COMMAND,
          (event) => {
            const selection = $getSelection()
            if (!$isNodeSelection(selection)) return false
            const blocks = selection.getNodes().map(selectableBlockNode)
            const current = blocks.at(-1)
            const next = current ? nextSelectableBlock(current) : null
            if (!next) return true
            event?.preventDefault()
            selectBlocks(
              event?.shiftKey
                ? [...blocks.map((node) => node.getKey()), next.getKey()]
                : [next.getKey()]
            )
            return true
          },
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          KEY_ARROW_UP_COMMAND,
          (event) => {
            const selection = $getSelection()
            if (!$isNodeSelection(selection)) return false
            const blocks = selection.getNodes().map(selectableBlockNode)
            const current = blocks[0]
            const previous = current ? previousSelectableBlock(current) : null
            if (!previous) return true
            event?.preventDefault()
            selectBlocks(
              event?.shiftKey
                ? [previous.getKey(), ...blocks.map((node) => node.getKey())]
                : [previous.getKey()]
            )
            return true
          },
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          KEY_DELETE_COMMAND,
          deleteSelectedBlocks,
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          KEY_BACKSPACE_COMMAND,
          deleteSelectedBlocks,
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => {
            const selection = $getSelection()
            if (!$isNodeSelection(selection)) return false
            const node = selection.getNodes().at(-1)
            if (!node) return false
            event?.preventDefault()
            selectableBlockNode(node).selectEnd()
            queueMicrotask(() => editor.focus())
            return editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined)
          },
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event) => {
            if (!(event?.metaKey || event?.ctrlKey) || event.key !== "a") {
              return false
            }
            const selection = $getSelection()
            if (!$isNodeSelection(selection)) return false
            event.preventDefault()
            selectBlocks(allSelectableBlockKeys())
            return true
          },
          COMMAND_PRIORITY_LOW
        )
      ),
    [deleteSelectedBlocks, editor, paintSelection]
  )

  useEffect(() => {
    const root = editor.getRootElement()
    const surface = surfaceRef.current
    if (!root || !surface) return
    let start: { clientX: number; clientY: number } | null = null

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest(".eidos-md-format-toolbar, .eidos-md-block-handle")) {
        return
      }
      if (target !== root && target !== surface) return

      start = { clientX: event.clientX, clientY: event.clientY }
      root.style.userSelect = "none"
      editor.update(() => selectBlocks([]))
      event.preventDefault()
    }

    const onMouseMove = (event: MouseEvent) => {
      if (!start) return
      const left = Math.min(start.clientX, event.clientX)
      const top = Math.min(start.clientY, event.clientY)
      const right = Math.max(start.clientX, event.clientX)
      const bottom = Math.max(start.clientY, event.clientY)
      const surfaceRect = surface.getBoundingClientRect()
      setMarquee({
        height: bottom - top,
        left: left - surfaceRect.left,
        top: top - surfaceRect.top,
        width: right - left,
      })

      const keys = selectableBlockElements(root).flatMap((element) => {
        const rect = element.getBoundingClientRect()
        const intersects =
          left <= rect.right &&
          right >= rect.left &&
          top <= rect.bottom &&
          bottom >= rect.top
        if (!intersects) return []
        const node = nodeForBlockElement(editor, element)
        return node ? [node.getKey()] : []
      })
      editor.update(() => selectBlocks(keys))
    }

    const stopMarquee = () => {
      if (!start) return
      start = null
      root.style.userSelect = ""
      setMarquee(null)
    }

    surface.addEventListener("mousedown", onMouseDown)
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", stopMarquee)
    return () => {
      root.style.userSelect = ""
      surface.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", stopMarquee)
    }
  }, [editor, surfaceRef])

  useEffect(
    () => () => {
      for (const key of selectedKeysRef.current) {
        editor.getElementByKey(key)?.classList.remove(SELECTED_BLOCK_CLASS)
      }
    },
    [editor]
  )

  return marquee ? (
    <div
      aria-hidden="true"
      className="eidos-md-block-marquee"
      style={marquee}
    />
  ) : null
}

export function DraggableBlockPlugin({
  surfaceRef,
}: {
  surfaceRef: RefObject<HTMLDivElement | null>
}) {
  const [editor] = useLexicalComposerContext()
  const [activeKey, setActiveKey] = useState<NodeKey | null>(null)
  const [handleTop, setHandleTop] = useState(0)
  const draggingKeyRef = useRef<NodeKey | null>(null)

  useEffect(() => {
    const root = editor.getRootElement()
    const surface = surfaceRef.current
    if (!root || !surface) return

    const onMouseMove = (event: MouseEvent) => {
      const element = blockElementAtTarget(editor, event.target)
      if (!element) {
        setActiveKey(null)
        return
      }
      const node = nodeForBlockElement(editor, element)
      if (!node) return
      setActiveKey(node.getKey())
      setHandleTop(
        element.getBoundingClientRect().top -
          surface.getBoundingClientRect().top +
          2
      )
    }
    const onMouseLeave = () => {
      if (!draggingKeyRef.current) setActiveKey(null)
    }
    root.addEventListener("mousemove", onMouseMove)
    root.addEventListener("mouseleave", onMouseLeave)
    return () => {
      root.removeEventListener("mousemove", onMouseMove)
      root.removeEventListener("mouseleave", onMouseLeave)
    }
  }, [editor, surfaceRef])

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          DRAGOVER_COMMAND,
          (event) => {
            if (!draggingKeyRef.current) return false
            const [isFileTransfer] = eventFiles(event)
            if (isFileTransfer) return false
            event.preventDefault()
            return true
          },
          COMMAND_PRIORITY_HIGH
        ),
        editor.registerCommand(
          DROP_COMMAND,
          (event) => {
            const draggedKey = draggingKeyRef.current
            if (!draggedKey || !event.dataTransfer?.getData(BLOCK_DRAG_DATA)) {
              return false
            }
            const targetElement = blockElementAtTarget(editor, event.target)
            if (!targetElement) return false
            event.preventDefault()
            editor.update(() => {
              const dragged = $getNodeByKey(draggedKey)
              const nearest = $getNearestNodeFromDOMNode(targetElement)
              const target = nearest ? selectableBlockNode(nearest) : null
              if (!dragged || !target || dragged.is(target)) return
              const draggingListItem = $isListItemNode(dragged)
              const targetListItem = $isListItemNode(target)
              if (draggingListItem !== targetListItem) return
              const rect = targetElement.getBoundingClientRect()
              if (event.clientY > rect.top + rect.height / 2) {
                target.insertAfter(dragged)
              } else {
                target.insertBefore(dragged)
              }
              selectBlocks([dragged.getKey()])
            })
            draggingKeyRef.current = null
            return true
          },
          COMMAND_PRIORITY_HIGH
        )
      ),
    [editor]
  )

  if (!activeKey) return null

  const selectActiveBlock = () => {
    editor.update(() => selectBlocks([activeKey]))
    editor.focus()
  }
  const startDrag = (event: ReactDragEvent<HTMLButtonElement>) => {
    draggingKeyRef.current = activeKey
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(BLOCK_DRAG_DATA, activeKey)
    const element = editor.getElementByKey(activeKey)
    if (element) event.dataTransfer.setDragImage(element, 8, 8)
  }

  return (
    <button
      type="button"
      aria-label="Select and drag block"
      className="eidos-md-block-handle"
      draggable
      style={{ top: handleTop }}
      title="Drag to move · Click to select"
      onClick={selectActiveBlock}
      onDragEnd={() => {
        draggingKeyRef.current = null
      }}
      onDragStart={startDrag}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  )
}
