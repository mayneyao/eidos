import { useEffect, useRef, useState } from "react"
import type { EfmBlockData } from "../nodes/efm-semantic-data"
import { useEfmSourceBlockContext } from "./efm-source-block-context"
import { MARKDOWN_FEATURES } from "../plugin-system/feature-ids"

export function ResizableImage({
  data,
  url,
  onResize,
}: {
  data: EfmBlockData
  url: string
  onResize?: (width: number) => void
}) {
  const { readOnly, syntaxFeatures } = useEfmSourceBlockContext()
  const frame = useRef<HTMLSpanElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const drag = useRef<{
    pointer: number
    x: number
    width: number
    next: number
    max: number
    side: number
    target: HTMLButtonElement
  } | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const cancel = () => {
    const current = drag.current
    drag.current = null
    if (current?.target.hasPointerCapture(current.pointer)) {
      current.target.releasePointerCapture(current.pointer)
    }
    setPreview(null)
  }
  useEffect(() => {
    cancel()
  }, [readOnly, data.source, url])
  useEffect(() => {
    setLoaded(
      Boolean(image.current?.complete && image.current.naturalWidth > 0)
    )
  }, [url])
  const maximumWidth = () => {
    const parent = frame.current?.parentElement
    if (!parent) return 48
    const style = getComputedStyle(parent)
    return (
      parent.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight)
    )
  }
  const enabled =
    !readOnly &&
    syntaxFeatures.has(MARKDOWN_FEATURES.obsidianAttachment) &&
    loaded &&
    onResize
  return (
    <span
      ref={frame}
      className="eme-image-resize-frame"
      data-resizing={preview !== null || undefined}
      style={{ width: preview ?? data.width }}
    >
      <img
        ref={image}
        src={url}
        alt={data.alt ?? ""}
        title={data.title}
        width={preview ?? data.width}
        height={preview === null ? data.height : undefined}
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
      />
      {enabled &&
        ["left", "right"].map((side) => (
          <button
            key={side}
            type="button"
            className="eme-image-resize-handle"
            data-side={side}
            data-efm-editor-interactive="true"
            aria-label={`Resize image from ${side}`}
            title="Drag to resize · Arrow keys to adjust · Escape to cancel"
            onPointerDown={(event) => {
              if (event.button !== 0 || !frame.current) return
              event.preventDefault()
              event.stopPropagation()
              const width = frame.current.getBoundingClientRect().width
              drag.current = {
                pointer: event.pointerId,
                x: event.clientX,
                width,
                next: width,
                max: maximumWidth(),
                side: side === "left" ? -2 : 2,
                target: event.currentTarget,
              }
              event.currentTarget.focus({ preventScroll: true })
              event.currentTarget.setPointerCapture(event.pointerId)
              setPreview(width)
            }}
            onPointerMove={(event) => {
              const current = drag.current
              if (!current || current.pointer !== event.pointerId) return
              event.stopPropagation()
              current.next = Math.round(
                Math.min(
                  current.max,
                  Math.max(
                    48,
                    current.width + (event.clientX - current.x) * current.side
                  )
                )
              )
              setPreview(current.next)
            }}
            onPointerUp={(event) => {
              if (drag.current?.pointer !== event.pointerId) return
              event.stopPropagation()
              const width = drag.current.next
              const original = drag.current.width
              cancel()
              if (width !== null && Math.abs(width - original) >= 1)
                onResize?.(width)
            }}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape" && drag.current) {
                event.preventDefault()
                event.stopPropagation()
                cancel()
              } else if (
                ["ArrowLeft", "ArrowRight"].includes(event.key) &&
                frame.current
              ) {
                event.preventDefault()
                event.stopPropagation()
                const width = frame.current.getBoundingClientRect().width
                const next = Math.min(
                  maximumWidth(),
                  Math.max(
                    48,
                    width +
                      (event.key === "ArrowRight" ? 1 : -1) *
                        (event.shiftKey ? 32 : 8)
                  )
                )
                onResize?.(Math.round(next))
              }
            }}
          />
        ))}
    </span>
  )
}
