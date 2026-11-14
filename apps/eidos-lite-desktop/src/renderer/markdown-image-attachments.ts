import { useCallback, useEffect, useMemo, useRef } from "react"
import type {
  MarkdownEditorImageUrlResolver,
  MarkdownEditorPasteImageHandler,
  MarkdownEditorProps,
} from "@eidos.space/markdown"

/** A browser file input opens the native chooser without exposing source paths. */
export function chooseMarkdownFiles(
  kind: "image" | "file",
  signal: AbortSignal
): Promise<File[]> {
  if (signal.aborted) return Promise.resolve([])
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    input.hidden = true
    if (kind === "image") input.accept = "image/*"
    const finish = (files: File[]) => {
      signal.removeEventListener("abort", cancel)
      input.remove()
      resolve(files)
    }
    const cancel = () => finish([])
    input.addEventListener(
      "change",
      () => finish(Array.from(input.files ?? [])),
      { once: true }
    )
    input.addEventListener("cancel", cancel, { once: true })
    signal.addEventListener("abort", cancel, { once: true })
    document.body.append(input)
    input.click()
  })
}

interface MarkdownImageAttachmentHost {
  onImportFiles: NonNullable<MarkdownEditorProps["onImportFiles"]>
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
    async onImportFiles({ kind, signal }) {
      if (disposed || signal.aborted) return []
      const files = await chooseMarkdownFiles(kind, signal)
      const imported = []
      for (const file of files) {
        if (disposed || signal.aborted) return []
        const asset = await (kind === "image"
          ? window.eidosLite.importMarkdownImage(relativePath, file)
          : window.eidosLite.importMarkdownFile(relativePath, file))
        if (disposed || signal.aborted) return []
        imported.push({ ...asset, name: file.name })
      }
      return imported
    },
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

  const onImportFiles = useCallback<
    NonNullable<MarkdownEditorProps["onImportFiles"]>
  >(
    (request) => {
      const entry = hostRef.current
      return entry && entry.relativePath === relativePath
        ? entry.host.onImportFiles(request)
        : Promise.resolve([])
    },
    [relativePath]
  )

  return useMemo(
    () =>
      relativePath ? { onPasteImage, onImportFiles, resolveImageUrl } : null,
    [onPasteImage, onImportFiles, relativePath, resolveImageUrl]
  )
}
