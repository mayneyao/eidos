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
  COMMAND_PRIORITY_HIGH,
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

import { CustomBlockMenu } from "../../blocks/custom/menu"
import { FileMenu } from "../../blocks/file/menu"
import { isHTMLElement } from "../../utils/guard"
import { $moveNode } from "./$moveNode"
import {
  DRAG_DATA_FORMAT,
  getBlockElement,
  hideTargetLine,
  isOnMenu,
  setDragImage,
  setMenuPosition,
  setTargetLine,
} from "./helper"
import "./index.css"
import { TurnIntoMenu } from "./turn-into-menu"

function useDraggableBlockMenu(
  editor: LexicalEditor,
  anchorElem: HTMLElement,
  isEditable: boolean
): JSX.Element {
  const scrollerElem = anchorElem?.parentElement
  // don't remove next line, otherwise the drag will not work, idk why (
  // const { isFileManagerOpen } = useAppStore()
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

      const targetBlockElem = getBlockElement(
        anchorElem,
        editor,
        event,
        draggableBlockElem || undefined
      )
      const targetLineElem = targetLineRef.current

      if (targetBlockElem === null || targetLineElem === null) {
        return false
      }

      event.preventDefault()
      event.stopPropagation()

      setTargetLine(targetLineElem, targetBlockElem, pageY, anchorElem, event)
      return true
    }

    function onDrop(event: DragEvent): boolean {
      if (!isDraggingBlockRef.current) {
        return false
      }

      event.preventDefault()
      event.stopPropagation()

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

      const targetBlockElem = getBlockElement(
        anchorElem,
        editor,
        event,
        draggableBlockElem || undefined
      )
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

      if (targetLineRef.current) {
        setTargetLine(
          targetLineRef.current,
          targetBlockElem,
          pageY,
          anchorElem,
          event
        )
      }

      $moveNode(draggedNode, targetNode, shouldInsertAfter, editor, event)
      setDraggableBlockElem(null)

      isDraggingBlockRef.current = false
      hideTargetLine(targetLineRef.current)

      return true
    }

    return mergeRegister(
      editor.registerCommand(
        DRAGOVER_COMMAND,
        onDragover,
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(DROP_COMMAND, onDrop, COMMAND_PRIORITY_HIGH)
    )
  }, [anchorElem, editor, draggableBlockElem])

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
    console.log("onDragStart setData", nodeKey)
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
      <div
        ref={menuRef}
        className="draggable-block-menu flex gap-1"
        style={{
          position: "absolute",
          pointerEvents: "auto",
          zIndex: 100,
        }}
      >
        <div className={isEditable ? "add-icon" : ""} onClick={addNodeBelow} />
        <DropdownMenu
          open={isContextMenuOpen}
          onOpenChange={setIsContextMenuOpen}
        >
          <DropdownMenuTrigger asChild>
            <div></div>
          </DropdownMenuTrigger>
          <div
            className={`${isEditable ? "icon" : ""}`}
            draggable={isEditable}
            onDragStart={(event) => {
              event.stopPropagation()
              onDragStart(event)
            }}
            onDragEnd={(event) => {
              event.stopPropagation()
              onDragEnd()
            }}
            onClick={handleClick}
            style={{
              touchAction: "none",
              position: "relative",
              width: "24px",
              height: "24px",
              display: "block",
            }}
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
            {currentNode?.__type == "custom" && (
              <CustomBlockMenu nodeKey={currentNodeKey} editor={editor} />
            )}
            <TurnIntoMenu editor={editor} currentNodeKey={currentNodeKey} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        className="draggable-block-target-line"
        ref={targetLineRef}
        style={{ pointerEvents: "none" }}
      />
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
