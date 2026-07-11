import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { DRAG_DROP_PASTE } from "@lexical/rich-text"
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
} from "lexical"

import {
  $createMarkdownImageNode,
  type MarkdownImagePayload,
} from "./nodes/image-node"

export interface MarkdownImageUpload extends MarkdownImagePayload {}

export type MarkdownImageUploader = (
  files: readonly File[]
) => Promise<readonly MarkdownImageUpload[]>

function insertImages(images: readonly MarkdownImageUpload[]) {
  const selection = $getSelection()
  if ($isRangeSelection(selection)) {
    images.forEach((image, index) => {
      if (index > 0) selection.insertParagraph()
      $insertNodes([$createMarkdownImageNode(image)])
    })
    return
  }

  const root = $getRoot()
  for (const image of images) {
    root.append($createParagraphNode().append($createMarkdownImageNode(image)))
  }
}

export function ImageUploadPlugin({
  uploadImages,
  onUploadError,
}: {
  uploadImages: MarkdownImageUploader
  onUploadError?: (error: Error) => void
}) {
  const [editor] = useLexicalComposerContext()

  useEffect(
    () =>
      editor.registerCommand(
        DRAG_DROP_PASTE,
        (files) => {
          const images = files.filter((file) => file.type.startsWith("image/"))
          if (images.length === 0) return false

          void uploadImages(images)
            .then((uploads) => {
              if (uploads.length === 0) return
              editor.update(() => insertImages(uploads), {
                tag: "markdown-image-upload",
              })
            })
            .catch((error: unknown) => {
              onUploadError?.(
                error instanceof Error ? error : new Error(String(error))
              )
            })
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),
    [editor, onUploadError, uploadImages]
  )

  return null
}
