import { useCallback, useEffect, useMemo, useRef } from "react"
import type {
  MarkdownEditorImageUrlResolver,
  MarkdownEditorPasteImageHandler,
} from "@eidos.space/markdown"

interface MarkdownImageAttachmentHost {
  onPasteImage: MarkdownEditorPasteImageHandler
  resolveImageUrl: MarkdownEditorImageUrlResolver
  dispose(): void
}

export function createMarkdownImageAttachmentHost(
  relativePath: string
): MarkdownImageAttachmentHost {
  const objectUrls = new Map<string, string>()
  let disposed = false

  const rememberObjectUrl = (
    markdownUrl: string,
    blob: Blob
  ): string | null => {
    if (disposed) return null
    const nextUrl = URL.createObjectURL(blob)
    const previousUrl = objectUrls.get(markdownUrl)
    if (previousUrl) URL.revokeObjectURL(previousUrl)
    objectUrls.set(markdownUrl, nextUrl)
    return nextUrl
  }

  return {
    async onPasteImage({ file, signal }) {
      if (disposed || signal.aborted) return null
      const asset = await window.eidosLite.importMarkdownImage(
        relativePath,
        file
      )
      if (disposed || signal.aborted) return null
      const displayUrl = rememberObjectUrl(asset.markdownUrl, file)
      return displayUrl
        ? {
            markdownUrl: asset.markdownUrl,
            displayUrl,
            alt: file.name,
          }
        : null
    },

    async resolveImageUrl({ markdownUrl, signal }) {
      if (disposed || signal.aborted || /^https?:/iu.test(markdownUrl)) {
        return null
      }
      const cached = objectUrls.get(markdownUrl)
      if (cached) return cached
      const resolution = await window.eidosLite.resolveMarkdownImage(
        relativePath,
        markdownUrl
      )
      if (!resolution || disposed || signal.aborted) return null
      const response = await fetch(resolution.previewUrl, { signal })
      if (!response.ok) throw new Error("The Markdown image could not be read")
      const blob = await response.blob()
      if (blob.type && blob.type !== resolution.mediaType) {
        throw new Error("The Markdown image media type changed while loading")
      }
      return rememberObjectUrl(markdownUrl, blob)
    },

    dispose() {
      if (disposed) return
      disposed = true
      for (const url of objectUrls.values()) URL.revokeObjectURL(url)
      objectUrls.clear()
    },
  }
}

export function useMarkdownImageAttachments(relativePath?: string) {
  const hostRef = useRef<{
    relativePath: string
    host: MarkdownImageAttachmentHost
  } | null>(null)

  useEffect(() => {
    if (!relativePath) {
      hostRef.current = null
      return
    }
    const entry = {
      relativePath,
      host: createMarkdownImageAttachmentHost(relativePath),
    }
    hostRef.current = entry
    return () => {
      if (hostRef.current === entry) hostRef.current = null
      entry.host.dispose()
    }
  }, [relativePath])

  const onPasteImage = useCallback<MarkdownEditorPasteImageHandler>(
    (request) => {
      const entry = hostRef.current
      return entry && entry.relativePath === relativePath
        ? entry.host.onPasteImage(request)
        : Promise.resolve(null)
    },
    [relativePath]
  )
  const resolveImageUrl = useCallback<MarkdownEditorImageUrlResolver>(
    (request) => {
      const entry = hostRef.current
      return entry && entry.relativePath === relativePath
        ? entry.host.resolveImageUrl(request)
        : Promise.resolve(null)
    },
    [relativePath]
  )

  return useMemo(
    () => (relativePath ? { onPasteImage, resolveImageUrl } : null),
    [onPasteImage, relativePath, resolveImageUrl]
  )
}
