import React, { useState, useCallback, useRef, useEffect } from "react"
import { LexicalEditor, $getNodeByKey, NodeKey } from "lexical"

import { $isCustomBlockNode } from "../node"

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
            const finalHeight = Math.max(100, startHeight.current + (e.clientY - startY.current))

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
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
        const overlay = document.getElementById("drag-overlay")
        overlay?.remove()
    }, [handleMouseMove, handleMouseUp])

    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            if (isSelecting) return
            e.preventDefault()

            isDragging.current = true
            startY.current = e.clientY
            startHeight.current = height

            document.body.style.cursor = "ns-resize"
            document.body.style.userSelect = "none"

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
            document.body.appendChild(overlay)

            window.addEventListener("mousemove", handleMouseMove)
            window.addEventListener("mouseup", handleMouseUp)
        },
        [height, handleMouseMove, handleMouseUp, isSelecting]
    )

    useEffect(() => {
        return () => cleanup()
    }, [cleanup])

    return { height, handleMouseDown }
} 