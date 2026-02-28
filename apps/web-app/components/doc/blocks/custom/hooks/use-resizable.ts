import React, { useState, useCallback, useRef, useEffect } from "react"
import type { LexicalEditor, NodeKey } from "lexical"
import { $getNodeByKey } from "lexical"

import { $isCustomBlockNode } from "../node"
import { useEditorInstance } from "../../../hooks/editor-instance-context"

export function useResizable({
  initialHeight,
  nodeKey,
  editor,
  isSelecting,
}: {
  initialHeight: number
  nodeKey: NodeKey
  editor: LexicalEditor
  isSelecting: boolean
}) {
  const { container } = useEditorInstance()
  const [height, setHeight] = useState<number>(initialHeight)
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const deltaY = e.clientY - startY.current
    const newHeight = Math.max(100, startHeight.current + deltaY)
    setHeight(newHeight)
  }, [])

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current) return
      const finalHeight = Math.max(
        100,
        startHeight.current + (e.clientY - startY.current)
      )

      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isCustomBlockNode(node)) {
          node.setHeight(finalHeight)
        }
      })

      setHeight(finalHeight)
      isDragging.current = false
      cleanup()
    },
    [editor, nodeKey]
  )

  const cleanup = useCallback(() => {
    const target = (container ?? document.body) as HTMLElement
    target.style.cursor = ""
    target.style.userSelect = ""
    window.removeEventListener("mousemove", handleMouseMove)
    window.removeEventListener("mouseup", handleMouseUp)
    const overlay = target.querySelector("#drag-overlay")
    overlay?.remove()
  }, [container, handleMouseMove, handleMouseUp])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isSelecting) return
      e.preventDefault()

      isDragging.current = true
      startY.current = e.clientY
      startHeight.current = height

      const target = (container ?? document.body) as HTMLElement
      target.style.cursor = "ns-resize"
      target.style.userSelect = "none"

      const overlay = document.createElement("div")
      overlay.id = "drag-overlay"
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 9999;
      `
      target.appendChild(overlay)

      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
    },
    [container, height, handleMouseMove, handleMouseUp, isSelecting]
  )

  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  return { height, handleMouseDown, setHeight }
}
