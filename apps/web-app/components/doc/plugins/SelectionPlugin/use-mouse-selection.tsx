import { useEffect, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useKeyPress } from "ahooks"
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  type LexicalNode,
} from "lexical"

import { useEditorInstance } from "../../hooks/editor-instance-context"

type BoxStyle = {
  display: string
  left: string
  top: string
  width: string
  height: string
  border?: string
  backgroundColor?: string
  position: "absolute" | "relative" | "fixed"
  opacity?: number
}

export function useMouseSelection(
  getSelectionItems: () => NodeListOf<Element>
) {
  const { setIsSelecting: setGlobalIsSelecting, queryWithinContainer } =
    useEditorInstance()
  const [editor] = useLexicalComposerContext()
  const [startX, setStartX] = useState(0)
  const [startY, setStartY] = useState(0)
  const [endX, setEndX] = useState(0)
  const [endY, setEndY] = useState(0)
  const [selectedKeySet, setSelectedKeySet] = useState(new Set<string>())
  const [boxStyle, setBoxStyle] = useState<BoxStyle>({
    display: "none",
    left: "",
    top: "",
    width: "",
    height: "",
    position: "fixed",
    opacity: 0.5,
  })
  const [isSelecting, _setIsSelecting] = useState(false)

  const setIsSelecting = (isSelecting: boolean) => {
    _setIsSelecting(isSelecting)
    setGlobalIsSelecting(isSelecting)
  }

  const clearSelectedKeySet = () => {
    setSelectedKeySet(new Set())
  }
  useKeyPress(["delete", "backspace"], (e) => {
    if (selectedKeySet.size > 0) {
      e.preventDefault()
      editor.update(() => {
        if (!editor.isEditable()) {
          return
        }
        selectedKeySet.forEach((key) => {
          const node = $getNodeByKey(key) as LexicalNode
          node?.remove()
        })
        clearSelectedKeySet()
      })
    }
  })

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const root = $getRoot()
        root.getChildren().forEach((child) => {
          const key = child.getKey()
          const element = editor.getElementByKey(key)
          element?.setAttribute("data-key", key)
        })
        editor.read(() => {
          const elements = getSelectionItems()
          elements.forEach((element) => {
            if (element.getAttribute("data-key")) {
              return
            }
            const node = $getNearestNodeFromDOMNode(element)
            if (node) {
              element.setAttribute("data-key", node.getKey())
            }
          })
        })
      })
    })
  }, [editor])

  useEffect(() => {
    const container = queryWithinContainer(
      ".doc-editor-area"
    ) as HTMLElement | null

    const queryAllWithinContainer = (selector: string) => {
      if (!container && typeof document === "undefined") return []
      return Array.from(
        (container ?? document).querySelectorAll(selector) ?? []
      )
    }

    const disableSelection = () => {
      container?.setAttribute("style", "user-select: none")
      queryAllWithinContainer("#main-content > *").forEach((el) => {
        ;(el as HTMLElement).style.userSelect = "none"
      })
    }

    const enableSelection = () => {
      container?.setAttribute("style", "user-select: auto")
      queryAllWithinContainer("#main-content > *").forEach((el) => {
        ;(el as HTMLElement).style.userSelect = "auto"
      })
    }
    function handleMouseDown(e: MouseEvent) {
      removeAllSelection()
      const docTitle = queryWithinContainer("#doc-title")
      const editorContainer = queryWithinContainer(".editor-input")
      const dragHandle = queryWithinContainer(".draggable-block-menu")
      const docPropertyGlobalContainer = queryWithinContainer(
        "#doc-property-container"
      )
      const isClickOnEditor = editorContainer?.contains(e.target as Node)
      const isClickOnDragHandle = dragHandle?.contains(e.target as Node)
      const isClickOnDocTitle = docTitle?.contains(e.target as Node)
      const isClickOnDocPropertyGlobalContainer =
        docPropertyGlobalContainer?.contains(e.target as Node)
      if (
        isSelecting ||
        isClickOnEditor ||
        isClickOnDragHandle ||
        isClickOnDocTitle ||
        isClickOnDocPropertyGlobalContainer
      ) {
        return
      }
      setIsSelecting(true)
      const { clientX, clientY } = e
      setStartX(clientX)
      setStartY(clientY)
      setEndX(clientX)
      setEndY(clientY)
      setBoxStyle({
        ...boxStyle,
        left: `${clientX}px`,
        top: `${clientY}px`,
        display: "block",
      })
      // allElements under editor-input should not be selectable
      disableSelection()
    }

    function handleMouseMove(e: MouseEvent) {
      if (!isSelecting) {
        return
      }
      const { clientX, clientY } = e
      setEndX(clientX)
      setEndY(clientY)

      const left = Math.min(startX, clientX)
      const top = Math.min(startY, clientY)
      const width = Math.abs(clientX - startX)
      const height = Math.abs(clientY - startY)

      setBoxStyle({
        ...boxStyle,
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: "lightblue",
      })

      const boxes = getSelectionItems()
      const newSelectedKeySet = new Set<string>()

      Array.from(boxes ?? []).forEach((box) => {
        const rect = box.getBoundingClientRect()
        const boxLeft = rect.left + window.scrollX
        const boxRight = boxLeft + rect.width
        const boxTop = rect.top + window.scrollY
        const boxBottom = boxTop + rect.height
        ;(box as HTMLElement).style.userSelect = "none"
        const isIntersect =
          (left <= boxRight &&
            boxLeft <= left + width &&
            top <= boxBottom &&
            boxTop <= top + height) ||
          (left + width >= boxLeft &&
            boxRight >= left &&
            top + height >= boxTop &&
            boxBottom >= top)
        if (isIntersect) {
          ;(box as HTMLElement).style.backgroundColor =
            "rgba(173, 216, 230, 0.5)"
          const key = (box as HTMLElement).getAttribute("data-key")
          if (key) {
            newSelectedKeySet.add(key)
          }
        } else {
          ;(box as HTMLElement).style.backgroundColor = ""
        }
      })

      setSelectedKeySet(newSelectedKeySet)
    }

    function handleMouseUp(e: MouseEvent) {
      e.stopImmediatePropagation()
      setIsSelecting(false)
      setBoxStyle({
        ...boxStyle,
        display: "none",
        left: "",
        top: "",
        width: "",
        height: "",
      })
      enableSelection()
    }

    function handleMouseLeave() {
      // setSelecting(false)
    }

    function removeAllSelection() {
      const boxes = getSelectionItems()
      Array.from(boxes ?? []).forEach((box) => {
        ;(box as HTMLElement).style.backgroundColor = ""
        ;(box as HTMLElement).style.userSelect = ""
      })
      clearSelectedKeySet()
    }

    if (container) {
      container.addEventListener("mousedown", handleMouseDown)
      container.addEventListener("mousemove", handleMouseMove)
      container.addEventListener("mouseup", handleMouseUp)
      container.addEventListener("mouseleave", handleMouseLeave)
    }

    return () => {
      if (container) {
        container.removeEventListener("mousedown", handleMouseDown)
        container.removeEventListener("mousemove", handleMouseMove)
        container.removeEventListener("mouseup", handleMouseUp)
        container.removeEventListener("mouseleave", handleMouseLeave)
      }
    }
  }, [
    isSelecting,
    startX,
    startY,
    boxStyle,
    getSelectionItems,
    selectedKeySet,
    queryWithinContainer,
  ])

  useEffect(() => {
    return () => {
      setGlobalIsSelecting(false)
    }
  }, [])

  return {
    selectedKeySet,
    isSelecting,
    boxStyle,
  }
}
