import { useCallback, useEffect, useRef, useSyncExternalStore } from "react"
import { Image, LoaderCircle } from "lucide-react"

import { useEidosFileUI } from "./context"
import {
  eidosFileCanvasImageSourceDimensions,
  sharedEidosFileUrlImageSourceCache,
  type EidosFileUrlImageSourceSnapshot,
} from "./eidos-file-url-image-source-cache"
import { cn } from "./lib/cn"

const UNAVAILABLE_SNAPSHOT: EidosFileUrlImageSourceSnapshot = {
  state: "unavailable",
}

function drawCover(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  fitContent: boolean
): void {
  const dimensions = eidosFileCanvasImageSourceDimensions(source)
  const bounds = canvas.getBoundingClientRect()
  if (!dimensions || bounds.width <= 0 || bounds.height <= 0) return
  const scale = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1))
  const targetWidth = Math.max(1, Math.round(bounds.width * scale))
  const targetHeight = Math.max(1, Math.round(bounds.height * scale))
  if (canvas.width !== targetWidth) canvas.width = targetWidth
  if (canvas.height !== targetHeight) canvas.height = targetHeight
  const context = canvas.getContext("2d")
  if (!context) return
  context.setTransform(scale, 0, 0, scale, 0, 0)
  context.clearRect(0, 0, bounds.width, bounds.height)
  const imageScale = fitContent
    ? Math.min(
        bounds.width / dimensions.width,
        bounds.height / dimensions.height
      )
    : Math.max(
        bounds.width / dimensions.width,
        bounds.height / dimensions.height
      )
  const width = dimensions.width * imageScale
  const height = dimensions.height * imageScale
  context.drawImage(
    source,
    (bounds.width - width) / 2,
    (bounds.height - height) / 2,
    width,
    height
  )
}

export function EidosFileUrlImageCoverSurface({
  uri,
  altText,
  fitContent = false,
  className,
}: {
  uri: string
  altText: string
  fitContent?: boolean
  className?: string
}) {
  const { assetPresenter, assetSession } = useEidosFileUI()
  const cache = sharedEidosFileUrlImageSourceCache(assetSession, assetPresenter)
  const subscribe = useCallback(
    (listener: () => void) => cache?.subscribe(uri, listener) ?? (() => {}),
    [cache, uri]
  )
  const getSnapshot = useCallback(
    () => cache?.snapshot(uri) ?? UNAVAILABLE_SNAPSHOT,
    [cache, uri]
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const source = snapshot.source
    if (!canvas || !source) return
    const draw = () => drawCover(canvas, source, fitContent)
    draw()
    if (typeof ResizeObserver === "undefined") {
      globalThis.addEventListener("resize", draw)
      return () => globalThis.removeEventListener("resize", draw)
    }
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [fitContent, snapshot.source])

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center overflow-hidden bg-muted text-muted-foreground",
        className
      )}
    >
      {snapshot.source ? (
        <canvas
          ref={canvasRef}
          className="h-full w-full"
          role="img"
          aria-label={altText}
        />
      ) : snapshot.state === "loading" ? (
        <LoaderCircle aria-label={altText} className="h-5 w-5 animate-spin" />
      ) : (
        <span role="img" aria-label={altText} title={altText}>
          <Image aria-hidden="true" className="h-5 w-5" />
        </span>
      )}
    </div>
  )
}
