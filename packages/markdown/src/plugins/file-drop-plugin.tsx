import { useEffect, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $insertNodes,
  $setSelection,
  DRAGOVER_COMMAND,
  DROP_COMMAND,
  COMMAND_PRIORITY_HIGH,
  HISTORY_PUSH_TAG,
  type LexicalNode,
} from "lexical"
import type { MarkdownFileDropHandler } from "../types"
import { droppedFileSource, fileDropCaretRange } from "../markdown/file-drop"
import {
  $createEfmBlockNode,
  $createEfmInlineNode,
} from "../nodes/efm-semantic-node"
import { parseObsidianWikilink } from "../markdown/obsidian-internal-link"
import { resolveEfmResourceUri } from "../markdown/efm-uri"

export function FileDropPlugin({
  handler,
  documentKey,
  baseUri,
  supportsImages,
  onError,
}: {
  handler: MarkdownFileDropHandler
  documentKey: string
  baseUri?: string
  supportsImages: boolean
  onError(error: Error): void
}) {
  const [editor] = useLexicalComposerContext()
  const errorRef = useRef(handler.onError ?? onError)
  errorRef.current = handler.onError ?? onError
  useEffect(() => {
    const controllers = new Set<AbortController>()
    const accepts = (event: DragEvent) =>
      Boolean(
        editor.isEditable() &&
        event.dataTransfer &&
        handler.accepts(Array.from(event.dataTransfer.types))
      )
    const over = editor.registerCommand(
      DRAGOVER_COMMAND,
      (event) => {
        if (!accepts(event)) return false
        event.preventDefault()
        event.dataTransfer!.dropEffect = "copy"
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
    const drop = editor.registerCommand(
      DROP_COMMAND,
      (event) => {
        if (!accepts(event)) return false
        event.preventDefault()
        event.stopPropagation()
        const root = editor.getRootElement()
        if (!root) return true
        const range = fileDropCaretRange(root, event.clientX, event.clientY)
        const selection = $createRangeSelection()
        if (range) selection.applyDOMRange(range)
        else {
          const last = $getRoot().getChildrenSize()
          selection.anchor.set("root", last, "element")
          selection.focus.set("root", last, "element")
        }
        const content = JSON.stringify(editor.getEditorState().toJSON().root)
        const controller = new AbortController()
        controllers.add(controller)
        // Invoke synchronously: drag data is readable only while handling drop.
        void handler
          .resolve({
            documentKey,
            dataTransfer: event.dataTransfer!,
            signal: controller.signal,
          })
          .then((files) => {
            if (
              controller.signal.aborted ||
              !editor.isEditable() ||
              !editor.getRootElement()
            )
              return
            const valid = files.map((candidate) => {
              const file = supportsImages
                ? candidate
                : { ...candidate, imageUrl: undefined }
              return { file, source: droppedFileSource(file) }
            })
            if (!valid.length || valid.some((item) => !item.source)) return
            if (
              JSON.stringify(editor.getEditorState().toJSON().root) !== content
            ) {
              errorRef.current(
                new Error(
                  "The document changed while dropping files. Drop them again."
                )
              )
              return
            }
            editor.update(
              () => {
                if (
                  !$getNodeByKey(selection.anchor.key) ||
                  !$getNodeByKey(selection.focus.key)
                )
                  return
                $setSelection(selection)
                const nodes = valid.flatMap<LexicalNode>(
                  ({ file, source }, index) => {
                    const node = file.imageUrl
                      ? $createEfmBlockNode({
                          kind: "image",
                          source: source!,
                          url: file.imageUrl,
                          alt: file.title,
                          resolvedUrl:
                            resolveEfmResourceUri(file.imageUrl, baseUri, {
                              image: true,
                            }) ?? undefined,
                        })
                      : $createEfmInlineNode({
                          kind: "obsidian-link",
                          source: source!,
                          ...parseObsidianWikilink(source!)!,
                        })
                    return index ? [$createTextNode(" "), node] : [node]
                  }
                )
                $insertNodes(nodes)
              },
              { tag: HISTORY_PUSH_TAG }
            )
          })
          .catch((cause) => {
            if (!controller.signal.aborted)
              errorRef.current(
                cause instanceof Error ? cause : new Error(String(cause))
              )
          })
          .finally(() => controllers.delete(controller))
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
    return () => {
      over()
      drop()
      for (const controller of controllers) controller.abort()
    }
  }, [editor, handler, documentKey, baseUri, supportsImages])
  return null
}
