import { useEffect, useState } from "react"

type BoxStyle = {
  display: string
  left: string
  top: string
  width: string
  height: string
  border?: string
  backgroundColor?: string
  position: "absolute" | "relative"
  opacity?: number
}

export function useMouseSelection(
  getSelectionItems: () => NodeListOf<Element>
) {
  const [hasSelectionItems, setHasSelectionItems] = useState(false)
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
    position: "absolute",
    opacity: 0.5,
  })

  useEffect(() => {
    const container = document.body

    function handleMouseDown(e: MouseEvent) {
      const editorContainer = document.querySelector(".editor-input")
      const isClickOnEditor = editorContainer?.contains(e.target as Node)
      if (isClickOnEditor) {
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
          ;(box as HTMLElement).style.backgroundColor = "rgb(173 216 230 / 27%)"
        }
      })
    }

    function handleMouseUp() {
      setSelecting(false)
      setBoxStyle({
        ...boxStyle,
        display: "none",
        left: "",
        top: "",
        width: "",
        height: "",
      })
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
    hasSelectionItems,
  ])

  return { boxStyle }
}
