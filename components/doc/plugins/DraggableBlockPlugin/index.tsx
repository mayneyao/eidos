/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { DragEvent as ReactDragEvent, useEffect, useRef, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { eventFiles } from "@lexical/rich-text"
import { mergeRegister } from "@lexical/utils"
import {
  $createParagraphNode,
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical"
import { Trash2Icon } from "lucide-react"
import { createPortal } from "react-dom"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import "./index.css"
import { useAppStore } from "@/lib/store/app-store"

import { FileMenu } from "../../blocks/file/menu"
import { isHTMLElement } from "../../utils/guard"
import { Point } from "../../utils/point"
import { Rect } from "../../utils/rect"
import { TurnIntoMenu } from "./turn-into-menu"

const SPACE = 4
const TARGET_LINE_HALF_HEIGHT = 2
const DRAGGABLE_BLOCK_MENU_CLASSNAME = "draggable-block-menu"
const DRAG_DATA_FORMAT = "application/x-lexical-drag-block"
const TEXT_BOX_HORIZONTAL_PADDING = 28

const Downward = 1
const Upward = -1
const Indeterminate = 0

let prevIndex = Infinity

function getCurrentIndex(keysLength: number): number {
  if (keysLength === 0) {
    return Infinity
  }
  if (prevIndex >= 0 && prevIndex < keysLength) {
    return prevIndex
  }

  return Math.floor(keysLength / 2)
}

function getTopLevelNodeKeys(editor: LexicalEditor): string[] {
  return editor.getEditorState().read(() => $getRoot().getChildrenKeys())
}

function getBlockElement(
  anchorElem: HTMLElement,
  editor: LexicalEditor,
  event: MouseEvent
): HTMLElement | null {
  const anchorElementRect = anchorElem.getBoundingClientRect()
  const topLevelNodeKeys = getTopLevelNodeKeys(editor)

  let blockElem: HTMLElement | null = null

  editor.getEditorState().read(() => {
    let index = getCurrentIndex(topLevelNodeKeys.length)
    let direction = Indeterminate

    while (index >= 0 && index < topLevelNodeKeys.length) {
      const key = topLevelNodeKeys[index]
      const elem = editor.getElementByKey(key)
      if (elem === null) {
        break
      }
      const point = new Point(event.x, event.y)
      const domRect = Rect.fromDOM(elem)
      const { marginTop, marginBottom } = window.getComputedStyle(elem)

      const rect = domRect.generateNewRect({
        bottom: domRect.bottom + parseFloat(marginBottom),
        left: anchorElementRect.left,
        right: anchorElementRect.right,
        top: domRect.top - parseFloat(marginTop),
      })

      const {
        result,
        reason: { isOnTopSide, isOnBottomSide },
      } = rect.contains(point)

      if (result) {
        blockElem = elem
        prevIndex = index
        break
      }

      if (direction === Indeterminate) {
        if (isOnTopSide) {
          direction = Upward
        } else if (isOnBottomSide) {
          direction = Downward
        } else {
          // stop search block element
          direction = Infinity
        }
      }

      index += direction
    }
  })

  return blockElem
}

function isOnMenu(element: HTMLElement): boolean {
  return !!element.closest(`.${DRAGGABLE_BLOCK_MENU_CLASSNAME}`)
}

function setMenuPosition(
  targetElem: HTMLElement | null,
  floatingElem: HTMLElement,
  anchorElem: HTMLElement
) {
  if (!targetElem) {
    floatingElem.style.opacity = "0"
    floatingElem.style.transform = "translate(-10000px, -10000px)"
    return
  }

  const targetRect = targetElem.getBoundingClientRect()
  const targetStyle = window.getComputedStyle(targetElem)
  const floatingElemRect = floatingElem.getBoundingClientRect()
  const anchorElementRect = anchorElem.getBoundingClientRect()

  const top =
    targetRect.top +
    (parseInt(targetStyle.lineHeight, 10) - floatingElemRect.height) / 2 -
    anchorElementRect.top

  const left = SPACE

  floatingElem.style.opacity = "1"
  floatingElem.style.transform = `translate(${left}px, ${top}px)`
}

function setDragImage(
  dataTransfer: DataTransfer,
  draggableBlockElem: HTMLElement
) {
  const { transform } = draggableBlockElem.style

  // Remove dragImage borders
  draggableBlockElem.style.transform = "translateZ(0)"
  dataTransfer.setDragImage(draggableBlockElem, 0, 0)

  setTimeout(() => {
    draggableBlockElem.style.transform = transform
  })
}

function setTargetLine(
  targetLineElem: HTMLElement,
  targetBlockElem: HTMLElement,
  mouseY: number,
  anchorElem: HTMLElement
) {
  const targetStyle = window.getComputedStyle(targetBlockElem)
  const { top: targetBlockElemTop, height: targetBlockElemHeight } =
    targetBlockElem.getBoundingClientRect()
  const { top: anchorTop, width: anchorWidth } =
    anchorElem.getBoundingClientRect()

  let lineTop = targetBlockElemTop
  // At the bottom of the target
  if (mouseY - targetBlockElemTop > targetBlockElemHeight / 2) {
    lineTop += targetBlockElemHeight + parseFloat(targetStyle.marginBottom)
  } else {
    lineTop -= parseFloat(targetStyle.marginTop)
  }

  const top = lineTop - anchorTop - TARGET_LINE_HALF_HEIGHT
  const left = TEXT_BOX_HORIZONTAL_PADDING - SPACE

  targetLineElem.style.transform = `translate(${left}px, ${top}px)`
  targetLineElem.style.width = `${
    anchorWidth - (TEXT_BOX_HORIZONTAL_PADDING - SPACE) * 2
  }px`
  targetLineElem.style.opacity = ".4"
}

function hideTargetLine(targetLineElem: HTMLElement | null) {
  if (targetLineElem) {
    targetLineElem.style.opacity = "0"
    targetLineElem.style.transform = "translate(-10000px, -10000px)"
  }
}

function useDraggableBlockMenu(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  isEditable: boolean
): JSX.Element {
  const scrollerElem = anchorElem?.parentElement
  // don't remove next line, otherwise the drag will not work, idk why (
  const { isFileManagerOpen } = useAppStore()
  const menuRef = useRef<HTMLDivElement>(null)
  const targetLineRef = useRef<HTMLDivElement>(null)
  const isDraggingBlockRef = useRef<boolean>(false)
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)
  const [currentNodeKey, setCurrentNodeKey] = useState<NodeKey | null>(null)
  const [draggableBlockElem, setDraggableBlockElem] =
    useState<HTMLElement | null>(null)

  const addNodeBelow = () => {
    editor.update(() => {
      const node =
        draggableBlockElem && $getNearestNodeFromDOMNode(draggableBlockElem)
      if (node) {
        const newLine = $createParagraphNode()
        const textNode = $createTextNode("/")
        newLine.append(textNode)
        node.insertAfter(newLine)
        newLine.select()
      }
    })
  }
  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      // if (isContextMenuOpen) {
      //   return
      // }
      const target = event.target
      if (!isHTMLElement(target)) {
        setDraggableBlockElem(null)
        return
      }

      if (isOnMenu(target)) {
        return
      }

      const _draggableBlockElem = getBlockElement(anchorElem, editor, event)

      setDraggableBlockElem(_draggableBlockElem)
    }

    function onMouseLeave() {
      if (isContextMenuOpen) {
        return
      }
      setDraggableBlockElem(null)
    }

    scrollerElem?.addEventListener("mousemove", onMouseMove)
    scrollerElem?.addEventListener("mouseleave", onMouseLeave)

    return () => {
      scrollerElem?.removeEventListener("mousemove", onMouseMove)
      scrollerElem?.removeEventListener("mouseleave", onMouseLeave)
    }
  }, [scrollerElem, anchorElem, editor, isContextMenuOpen])

  useEffect(() => {
    if (menuRef.current) {
      setMenuPosition(draggableBlockElem, menuRef.current, anchorElem)
    }
  }, [anchorElem, draggableBlockElem])

  useEffect(() => {
    function onDragover(event: DragEvent): boolean {
      if (!isDraggingBlockRef.current) {
        return false
      }
      const [isFileTransfer] = eventFiles(event)
      if (isFileTransfer) {
        return false
      }
      const { pageY, target } = event
      if (!isHTMLElement(target)) {
        return false
      }
      const targetBlockElem = getBlockElement(anchorElem, editor, event)
      const targetLineElem = targetLineRef.current
      if (targetBlockElem === null || targetLineElem === null) {
        return false
      }
      setTargetLine(targetLineElem, targetBlockElem, pageY, anchorElem)
      // Prevent default event to be able to trigger onDrop events
      event.preventDefault()
      return true
    }

    function onDrop(event: DragEvent): boolean {
      if (!isDraggingBlockRef.current) {
        return false
      }
      const [isFileTransfer] = eventFiles(event)
      if (isFileTransfer) {
        return false
      }
      const { target, dataTransfer, pageY } = event
      const dragData = dataTransfer?.getData(DRAG_DATA_FORMAT) || ""
      const draggedNode = $getNodeByKey(dragData)
      if (!draggedNode) {
        return false
      }
      if (!isHTMLElement(target)) {
        return false
      }
      const targetBlockElem = getBlockElement(anchorElem, editor, event)
      if (!targetBlockElem) {
        return false
      }
      const targetNode = $getNearestNodeFromDOMNode(targetBlockElem)
      if (!targetNode) {
        return false
      }
      if (targetNode === draggedNode) {
        return true
      }
      const { top, height } = targetBlockElem.getBoundingClientRect()
      const shouldInsertAfter = pageY - top > height / 2
      if (shouldInsertAfter) {
        targetNode.insertAfter(draggedNode)
      } else {
        targetNode.insertBefore(draggedNode)
      }
      setDraggableBlockElem(null)

      return true
    }

    return mergeRegister(
      editor.registerCommand(
        DRAGOVER_COMMAND,
        (event) => {
          return onDragover(event)
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          return onDrop(event)
        },
        COMMAND_PRIORITY_HIGH
      )
    )
  }, [anchorElem, editor])

  function onDragStart(event: ReactDragEvent<HTMLDivElement>): void {
    const dataTransfer = event.dataTransfer
    if (!dataTransfer || !draggableBlockElem) {
      return
    }
    setDragImage(dataTransfer, draggableBlockElem)
    console.log("onDragStart setDragImage", draggableBlockElem)
    let nodeKey = ""
    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(draggableBlockElem)
      if (node) {
        nodeKey = node.getKey()
      }
    })
    isDraggingBlockRef.current = true
    dataTransfer.setData(DRAG_DATA_FORMAT, nodeKey)
  }

  function onDragEnd(): void {
    isDraggingBlockRef.current = false
    hideTargetLine(targetLineRef.current)
  }

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
    setIsContextMenuOpen(true)
    if (!draggableBlockElem) {
      return
    }
    let nodeKey = null
    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(draggableBlockElem)
      if (node) {
        nodeKey = node.getKey()
      }
    })
    setCurrentNodeKey(nodeKey)
  }

  const [currentNode, setCurrentNode] = useState<LexicalNode | null>(null)

  useEffect(() => {
    editor.update(() => {
      if (currentNodeKey) {
        const node = $getNodeByKey(currentNodeKey)
        setCurrentNode(node)
      }
    })
  }, [currentNodeKey, editor])

  return createPortal(
    <>
      <div ref={menuRef} className="draggable-block-menu flex gap-1">
        <div className={isEditable ? "add-icon" : ""} onClick={addNodeBelow} />
        <DropdownMenu
          open={isContextMenuOpen}
          onOpenChange={setIsContextMenuOpen}
        >
          <DropdownMenuTrigger asChild>
            <div></div>
          </DropdownMenuTrigger>
          <div
            className={isEditable ? "icon" : ""}
            draggable={true}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={handleClick}
          />
          <DropdownMenuContent
            align="center"
            side="left"
            className="min-w-[200px]"
          >
            <DropdownMenuItem
              onSelect={() => {
                editor.update(() => {
                  if (!currentNodeKey) return
                  const node = $getNodeByKey(currentNodeKey)
                  if (node) {
                    node.remove()
                  }
                })
              }}
            >
              <Trash2Icon className="mr-2 h-4 w-4"></Trash2Icon>
              <span>Delete</span>
            </DropdownMenuItem>
            {/* {currentNode?.__type == "audio" && (
              <AudioMenu nodeKey={currentNodeKey} editor={editor} />
            )} */}
            {currentNode?.__type == "file" && (
              <FileMenu nodeKey={currentNodeKey} editor={editor} />
            )}
            <TurnIntoMenu editor={editor} currentNodeKey={currentNodeKey} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="draggable-block-target-line" ref={targetLineRef} />
    </>,
    anchorElem
  )
}

export function DraggableBlockPlugin({
  anchorElem = document.body,
}: {
  anchorElem?: HTMLElement
}): JSX.Element {
  const [editor] = useLexicalComposerContext()
  return useDraggableBlockMenu(editor, anchorElem, editor._editable)
}
