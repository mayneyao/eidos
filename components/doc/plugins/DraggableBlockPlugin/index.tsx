/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { DragEvent as ReactDragEvent, useEffect, useRef, useState } from "react"
import { $isCodeNode } from "@lexical/code"
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { eventFiles } from "@lexical/rich-text"
import { $dfs, mergeRegister } from "@lexical/utils"
import {
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  LexicalEditor,
} from "lexical"
import { createPortal } from "react-dom"

import "./index.css"
import { $isBookmarkNode } from "../../nodes/BookmarkNode"
import { $isImageNode } from "../../nodes/ImageNode/ImageNode"
import { isHTMLElement } from "../../utils/guard"
import { Point } from "../../utils/point"
import { Rect } from "../../utils/rect"

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

function getAllListItemNodeKeys(editor: LexicalEditor): string[] {
  return editor
    .getEditorState()
    .read(() => $dfs().map((node) => node.node.getKey()))
}

function isBlockElement(element: HTMLElement) {
  let closestParent = element.closest(".eidos_block")
  if (closestParent) {
    return closestParent
  }
}

function getDraggableBlockElement(
  anchorElem: HTMLElement,
  editor: LexicalEditor,
  event: MouseEvent
) {
  let blockElem: HTMLElement | null = null
  if (event.target) {
    const element = isBlockElement(event.target as HTMLElement)
    if (element) {
      blockElem = element as HTMLElement
    }
  }
  return blockElem
}

function getBlockElement(
  anchorElem: HTMLElement,
  editor: LexicalEditor,
  event: MouseEvent
): HTMLElement | null {
  const anchorElementRect = anchorElem.getBoundingClientRect()
  // const topLevelNodeKeys = getTopLevelNodeKeys(editor)
  const allListItemNodeKeys = getAllListItemNodeKeys(editor)
  const allNodeKeys = allListItemNodeKeys //topLevelNodeKeys.concat(allListItemNodeKeys)

  let blockElem: HTMLElement | null = null

  editor.getEditorState().read(() => {
    let index = getCurrentIndex(allNodeKeys.length)
    let direction = Indeterminate
    while (index >= 0 && index < allNodeKeys.length) {
      const key = allNodeKeys[index]
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
          // direction = Infinity
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
  const containerElementRect = document
    .getElementById("eidos-editor-container")
    ?.getBoundingClientRect()

  const top =
    targetRect.top +
    (parseInt(targetStyle.lineHeight, 10) - floatingElemRect.height) / 2 -
    anchorElementRect.top

  // Calculate the new left position for the floating element
  const left =
    targetRect.left -
    floatingElemRect.width -
    SPACE -
    (containerElementRect?.left || 0) +
    20

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

  // get targetBlockElem padding left
  const paddingLeft = parseFloat(targetStyle.paddingLeft)

  let lineTop = targetBlockElemTop
  // At the bottom of the target
  if (mouseY - targetBlockElemTop > targetBlockElemHeight / 2) {
    lineTop += targetBlockElemHeight + parseFloat(targetStyle.marginBottom)
  } else {
    lineTop -= parseFloat(targetStyle.marginTop)
  }

  const top = lineTop - anchorTop - TARGET_LINE_HALF_HEIGHT
  const left = TEXT_BOX_HORIZONTAL_PADDING - SPACE + paddingLeft

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

  const menuRef = useRef<HTMLDivElement>(null)
  const targetLineRef = useRef<HTMLDivElement>(null)
  const isDraggingBlockRef = useRef<boolean>(false)
  const [draggableBlockElem, setDraggableBlockElem] =
    useState<HTMLElement | null>(null)

  const addNodeBelow = () => {
    editor.update(() => {
      const node =
        draggableBlockElem && $getNearestNodeFromDOMNode(draggableBlockElem)
      if (node) {
        const newLine = $createParagraphNode()
        node.insertAfter(newLine)
        newLine.select()
      }
    })
  }
  useEffect(() => {
    function onMouseMove(event: MouseEvent) {
      const target = event.target
      if (!isHTMLElement(target)) {
        setDraggableBlockElem(null)
        return
      }

      if (isOnMenu(target)) {
        return
      }

      const _draggableBlockElem = getDraggableBlockElement(
        anchorElem,
        editor,
        event
      )

      setDraggableBlockElem(_draggableBlockElem)
    }

    function onMouseLeave() {
      setDraggableBlockElem(null)
    }

    scrollerElem?.addEventListener("mousemove", onMouseMove)
    scrollerElem?.addEventListener("mouseleave", onMouseLeave)

    return () => {
      scrollerElem?.removeEventListener("mousemove", onMouseMove)
      scrollerElem?.removeEventListener("mouseleave", onMouseLeave)
    }
  }, [scrollerElem, anchorElem, editor])

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
      // const dom = editor.getElementByKey(dragData)
      // if (dom) {
      //   dom.style.backgroundColor = "transparent"
      // }

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
      let insertNode = draggedNode
      if ($isListItemNode(targetNode)) {
        if (
          $isCodeNode(draggedNode) ||
          $isImageNode(draggedNode) ||
          $isBookmarkNode(draggedNode)
        ) {
          const newTargetNode = shouldInsertAfter
            ? targetNode
            : (targetNode.getPreviousSibling() as ListItemNode)
          insertNode = $createParagraphNode().append(
            ...newTargetNode.getChildren(),
            draggedNode
          )
          if (newTargetNode) {
            newTargetNode.append(insertNode)
          } else {
            targetNode.insertBefore(insertNode)
          }
          return true
        } else {
          insertNode = $createListItemNode()
          ;(insertNode as ListItemNode).append(draggedNode)
        }
      }
      if (
        draggedNode &&
        $isListItemNode(draggedNode) &&
        !$isListNode(targetNode.getParent())
      ) {
        const listType = (draggedNode?.getParent() as ListNode)?.getListType()
        insertNode = $createListNode(listType)
        ;(insertNode as ListNode).append(draggedNode as ListItemNode)
      }
      if (shouldInsertAfter) {
        targetNode.insertAfter(insertNode)
      } else {
        targetNode.insertBefore(insertNode)
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
    // draggableBlockElem.style.backgroundColor = "rgba(0, 0, 0, 0.1)"
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

  useEffect(() => {
    isDraggingBlockRef.current = false
    return () => {
      isDraggingBlockRef.current = false
    }
  }, [])

  return createPortal(
    <>
      <div
        ref={menuRef}
        className="draggable-block-menu flex gap-1"
        draggable={true}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className={isEditable ? "add-icon" : ""} onClick={addNodeBelow} />
        <div className={isEditable ? "icon" : ""} />
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
