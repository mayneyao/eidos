import { useCallback } from "react"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { LexicalNestedComposer } from "@lexical/react/LexicalNestedComposer"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { $getNodeByKey, type LexicalEditor, type NodeKey } from "lexical"

import { DOMAINS } from "@/lib/const"

import { $isImageNode } from "./ImageNode"

const imageCache = new Set()

export function useSuspenseImage(src: string) {
  if (!imageCache.has(src)) {
    throw new Promise((resolve) => {
      const img = new Image()
      img.src = src
      img.onload = () => {
        imageCache.add(src)
        resolve(null)
      }
    })
  }
}

export const getDisplayURL = (url: string) => {
  try {
    const urlObj = new URL(url)
    if (urlObj.host === window.location.host) {
      return url
    }
    return DOMAINS.IMAGE_PROXY + "/?url=" + url
  } catch (error) {
    return url
  }
}

export function LazyImage({
  altText,
  className,
  imageRef,
  src,
  width,
  height,
  maxWidth,
  nodeKey,
  editor,
  isResizing,
  setIsResizing,
  showCaption,
  caption,
}: {
  altText: string
  className: string | null
  height: "inherit" | number
  imageRef: { current: null | HTMLImageElement }
  maxWidth: number
  src: string
  width: "inherit" | number
  nodeKey: NodeKey
  editor: LexicalEditor
  isResizing: boolean
  setIsResizing: (value: boolean) => void
  showCaption: boolean
  caption: LexicalEditor
}): JSX.Element {
  const displaySrc = getDisplayURL(src)
  useSuspenseImage(displaySrc)

  const setShowCaption = () => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if ($isImageNode(node)) {
        node.setShowCaption(!showCaption)
      }
    })
  }

  const handleResize = useCallback(
    (event: MouseEvent, direction: "left" | "right") => {
      if (isResizing) return

      event.preventDefault()
      event.stopPropagation()

      setIsResizing(true)

      const image = imageRef.current
      if (!image) return

      const startWidth = image.offsetWidth
      const startX = event.clientX
      const aspectRatio = image.naturalHeight / image.naturalWidth

      const handleMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault()
        moveEvent.stopPropagation()

        const dx = moveEvent.clientX - startX
        const newWidth =
          direction === "right" ? startWidth + dx : startWidth - dx

        const constrainedWidth = Math.min(Math.max(newWidth, 100), maxWidth)
        const newHeight = Math.round(constrainedWidth * aspectRatio)

        editor.update(() => {
          const node = $getNodeByKey(nodeKey)
          if ($isImageNode(node)) {
            node.setWidthAndHeight(constrainedWidth, newHeight)
          }
        })
      }

      const handleMouseUp = (upEvent: MouseEvent) => {
        upEvent.preventDefault()
        upEvent.stopPropagation()

        document.removeEventListener("mousemove", handleMouseMove, true)
        document.removeEventListener("mouseup", handleMouseUp, true)
        setIsResizing(false)
      }

      document.addEventListener("mousemove", handleMouseMove, true)
      document.addEventListener("mouseup", handleMouseUp, true)
    },
    [editor, maxWidth, nodeKey, setIsResizing, isResizing, imageRef]
  )

  return (
    <div>
      <div className="relative inline-block group">
        <img
          className={className ?? ""}
          src={displaySrc}
          alt={altText}
          ref={imageRef}
          style={{
            height,
            width,
            display: "block",
          }}
          draggable="false"
        />
        <button
          onClick={setShowCaption}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 hover:bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          title="Add caption"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 10H3" />
            <path d="M21 6H3" />
            <path d="M21 14H3" />
            <path d="M17 18H3" />
          </svg>
        </button>
        <div
          role="left-handle"
          className="absolute left-[4px] top-1/2 -translate-y-1/2 w-2 h-12 rounded-lg cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          onMouseDown={(e) => handleResize(e as any, "left")}
        >
          <div className="absolute inset-0 bg-black/70 hover:bg-black/60 border border-white rounded-full" />
        </div>
        <div
          role="right-handle"
          className="absolute right-[4px] top-1/2 -translate-y-1/2 w-2 h-12 rounded-lg cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          onMouseDown={(e) => handleResize(e as any, "right")}
        >
          <div className="absolute inset-0 bg-black/70 hover:bg-black/60 border border-white rounded-full" />
        </div>
      </div>
      {showCaption && (
        <div className="image-caption-container">
          <LexicalNestedComposer initialEditor={caption}>
            <AutoFocusPlugin />
            <LinkPlugin />
            {/* <HistoryPlugin externalHistoryState={historyState} /> */}
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className="ImageNode__contentEditable"
                  style={{ width }}
                />
              }
              placeholder={
                <div className="ImageNode__placeholder">Enter a caption...</div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
          </LexicalNestedComposer>
        </div>
      )}
    </div>
  )
}
