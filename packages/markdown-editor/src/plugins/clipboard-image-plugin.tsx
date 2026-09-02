import { useEffect, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  PASTE_COMMAND,
  PASTE_TAG,
  type BaseSelection,
  type PasteCommandType,
} from "lexical"

import {
  isDeniedEfmUri,
  normalizeEfmUri,
  resolveEfmImagePresentationUri,
  resolveEfmResourceUri,
} from "../markdown/efm-uri"
import {
  $createEfmBlockNode,
  type EfmBlockData,
} from "../nodes/efm-semantic-node"
import type {
  MarkdownEditorPasteImageHandler,
  MarkdownEditorPastedImage,
} from "../types"

interface PersistedClipboardImage {
  asset: MarkdownEditorPastedImage
  file: File
}

function errorFrom(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}

function clipboardDataFromEvent(event: PasteCommandType): DataTransfer | null {
  return "clipboardData" in event ? event.clipboardData : null
}

function clipboardImageFiles(event: PasteCommandType): File[] {
  const data = clipboardDataFromEvent(event)
  if (!data) return []

  const itemFiles = Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  if (itemFiles.length > 0) return itemFiles
  return Array.from(data.files).filter((file) => file.type.startsWith("image/"))
}

function pasteTargetsLocalEditor(event: PasteCommandType): boolean {
  const target = event.target
  return (
    target instanceof Element &&
    (target.matches("input, textarea, select") ||
      target.closest("[data-efm-editor-interactive='true']") !== null)
  )
}

function escapedImageSource(
  markdownUrl: string,
  alt: string,
  title?: string
): string {
  const escapedAlt = alt.replace(/\\/gu, "\\\\").replace(/\]/gu, "\\]")
  const titleSource = title
    ? ` "${title.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`
    : ""
  return `![${escapedAlt}](<${markdownUrl}>${titleSource})`
}

export function pastedImageData(
  asset: MarkdownEditorPastedImage,
  file: File,
  baseUri?: string
): EfmBlockData {
  const markdownUrl = asset.markdownUrl.trim()
  const normalizedUrl = normalizeEfmUri(markdownUrl)
  if (
    !normalizedUrl ||
    isDeniedEfmUri(normalizedUrl) ||
    /[\r\n<>]/u.test(markdownUrl)
  ) {
    throw new Error(
      "onPasteImage must return a non-empty, non-dangerous EFM image destination."
    )
  }

  const alt = asset.alt ?? file.name
  const source = escapedImageSource(markdownUrl, alt, asset.title)
  const displayUrl = asset.displayUrl
    ? resolveEfmImagePresentationUri(asset.displayUrl)
    : null
  if (asset.displayUrl && !displayUrl) {
    throw new Error(
      "onPasteImage displayUrl must use the blob, http, or https scheme."
    )
  }

  return {
    kind: "image",
    source,
    url: markdownUrl,
    resolvedUrl:
      displayUrl ??
      resolveEfmResourceUri(markdownUrl, baseUri, { image: true }) ??
      undefined,
    alt,
    ...(asset.title ? { title: asset.title } : {}),
  }
}

function $restorePasteSelection(selection: BaseSelection): void {
  if ($isRangeSelection(selection)) {
    if (
      $getNodeByKey(selection.anchor.key) &&
      $getNodeByKey(selection.focus.key)
    ) {
      $setSelection(selection.clone())
      return
    }
  } else if ($isNodeSelection(selection) && selection.getNodes().length > 0) {
    $setSelection(selection.clone())
    return
  }
  $getRoot().selectEnd()
}

export function ClipboardImagePlugin({
  baseUri,
  documentKey,
  onError,
  onPasteImage,
  readOnly,
}: {
  baseUri?: string
  documentKey: string
  onError(error: Error): void
  onPasteImage?: MarkdownEditorPasteImageHandler
  readOnly: boolean
}) {
  const [editor] = useLexicalComposerContext()
  const controllers = useRef(new Set<AbortController>())

  useEffect(
    () => () => {
      for (const controller of controllers.current) controller.abort()
      controllers.current.clear()
    },
    []
  )

  useEffect(() => {
    if (!onPasteImage || readOnly) return

    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (pasteTargetsLocalEditor(event)) return false
        const files = clipboardImageFiles(event)
        if (files.length === 0) return false
        const selection = $getSelection()?.clone()
        if (!selection) return false

        event.preventDefault()
        const controller = new AbortController()
        controllers.current.add(controller)

        void Promise.all(
          files.map(
            async (file, index): Promise<PersistedClipboardImage | null> => {
              try {
                const asset = await onPasteImage({
                  documentKey,
                  file,
                  index,
                  total: files.length,
                  signal: controller.signal,
                })
                return asset ? { asset, file } : null
              } catch (cause) {
                if (!controller.signal.aborted) onError(errorFrom(cause))
                return null
              }
            }
          )
        )
          .then((persisted) => {
            if (controller.signal.aborted) return

            const images: EfmBlockData[] = []
            for (const result of persisted) {
              if (!result) continue
              try {
                images.push(pastedImageData(result.asset, result.file, baseUri))
              } catch (cause) {
                onError(errorFrom(cause))
              }
            }
            if (images.length === 0) return

            editor.update(
              () => {
                $restorePasteSelection(selection)
                $insertNodes(images.map((data) => $createEfmBlockNode(data)))
              },
              { tag: PASTE_TAG }
            )
          })
          .catch((cause) => {
            if (!controller.signal.aborted) onError(errorFrom(cause))
          })
          .finally(() => controllers.current.delete(controller))
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [baseUri, documentKey, editor, onError, onPasteImage, readOnly])

  return null
}
