import { useEffect, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useKeyPress } from "ahooks"
import { $getNodeByKey, $getRoot, LexicalNode } from "lexical"

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
  // const selectedKeySet = new Set<string>()
  const [selectedKeySet, setSelectedKeySet] = useState(new Set<string>())

  const [editor] = useLexicalComposerContext()
  const [isSelecting, setSelecting] = useState(false)
  const [startX, setStartX] = useState(0)
  const [startY, setStartY] = useState(0)
  const [endX, setEndX] = useState(0)
  const [endY, setEndY] = useState(0)
  const [boxStyle, setBoxStyle] = useState<BoxStyle>({
    display: "none",
    left: "",
    top: "",
    width: "",
    height: "",
    position: "fixed",
    opacity: 0.5,
  })

  const clearSelectedKetSet = () => {
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
        clearSelectedKetSet()
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
      })
    })
  }, [editor])

  useEffect(() => {
    const container = document.querySelector(".doc-editor-area") as HTMLElement

    function disableSelection() {
      container.setAttribute("style", "user-select: none")
      document.querySelectorAll("#main-content > *").forEach((el) => {
        ;(el as HTMLElement).style.userSelect = "none"
      })
    }

    function enableSelection() {
      container.setAttribute("style", "user-select: auto")
      document.querySelectorAll("#main-content > *").forEach((el) => {
        ;(el as HTMLElement).style.userSelect = "auto"
      })
    }
    function handleMouseDown(e: MouseEvent) {
      removeAllSelection()
      const docTitle = document.querySelector("#doc-title")
      const editorContainer = document.querySelector(".editor-input")
      const dragHandle = document.querySelector(".draggable-block-menu")
      const isClickOnEditor = editorContainer?.contains(e.target as Node)
      const isClickOnDragHandle = dragHandle?.contains(e.target as Node)
      const isClickOnDocTitle = docTitle?.contains(e.target as Node)
      if (
        isSelecting ||
        isClickOnEditor ||
        isClickOnDragHandle ||
        isClickOnDocTitle
      ) {
        return
      }
      setSelecting(true)
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
      setSelecting(false)
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
      clearSelectedKetSet()
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
  }, [isSelecting, startX, startY, boxStyle, getSelectionItems, selectedKeySet])

  return { boxStyle }
}
