import { useEffect, useRef, useState, type ReactNode } from "react"
import type { EfmBlockData } from "../nodes/efm-semantic-data"
import { pastedImageData } from "../plugins/clipboard-image-plugin"
import { useEfmSourceBlockContext } from "./efm-source-block-context"

/** Hosts persist selected files; only portable image destinations enter the document. */
export function ImagePlaceholder({
  children,
  onImport,
}: {
  children: ReactNode
  onImport?: (images: EfmBlockData[]) => void
}) {
  const {
    baseUri,
    documentKey,
    onError,
    onImportFiles,
    onPasteImage,
    readOnly,
  } = useEfmSourceBlockContext()
  const input = useRef<HTMLInputElement>(null)
  const pending = useRef<AbortController | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    if (readOnly) {
      pending.current?.abort()
      pending.current = null
      setBusy(false)
    }
  }, [readOnly])

  const importImages = async (file?: File) => {
    if (readOnly || pending.current || !onImport) return
    const controller = new AbortController()
    pending.current = controller
    setBusy(true)
    try {
      let images: EfmBlockData[] = []
      if (file && onPasteImage) {
        if (!file.type.startsWith("image/"))
          throw new Error("Choose an image file.")
        const asset = await onPasteImage({
          documentKey,
          file,
          index: 0,
          total: 1,
          signal: controller.signal,
        })
        if (asset) images = [pastedImageData(asset, file, baseUri)]
      } else if (onImportFiles) {
        const files = await onImportFiles({
          kind: "image",
          signal: controller.signal,
        })
        images = files.map((asset) => {
          if (!asset.mediaType.startsWith("image/"))
            throw new Error("Choose an image file.")
          return pastedImageData(
            { markdownUrl: asset.markdownUrl, alt: asset.name },
            new File([], asset.name, { type: asset.mediaType }),
            baseUri
          )
        })
      }
      if (!controller.signal.aborted && images.length) onImport(images)
    } catch (cause) {
      if (!controller.signal.aborted)
        onError(cause instanceof Error ? cause : new Error(String(cause)))
    } finally {
      if (pending.current === controller) pending.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  if (readOnly || !onImport || (!onImportFiles && !onPasteImage)) {
    return <div className="eme-efm-image-placeholder">{children}</div>
  }
  return (
    <>
      <button
        type="button"
        className="eme-efm-image-placeholder"
        disabled={busy}
        aria-busy={busy || undefined}
        onClick={() => {
          if (onImportFiles) void importImages()
          else input.current?.click()
        }}
      >
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        tabIndex={-1}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ""
          if (file) void importImages(file)
        }}
      />
    </>
  )
}
