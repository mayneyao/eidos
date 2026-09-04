import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $convertSelectionToMarkdownString } from "@lexical/markdown"
import {
  $addUpdateTag,
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  HISTORIC_TAG,
  KEY_DOWN_COMMAND,
  type LexicalNode,
} from "lexical"
import { useEffect } from "react"

import { resolveEfmEditableSourceRange } from "../markdown/source-range"
import { $isEfmBlockNode } from "../nodes/efm-semantic-node"
import { $createEfmSourceRangeNode } from "../nodes/efm-source-range-node"
import type { MarkdownPluginBehaviorProps } from "../plugin-system/plugin-api"
import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"
import { useEfmSourceBlockContext } from "../ui/efm-source-block-context"

const TEXT_INPUT_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
].join(",")

function addNodeAndDescendants(
  selection: ReturnType<typeof $createNodeSelection>,
  node: LexicalNode
): void {
  selection.add(node.getKey())
  if (!$isElementNode(node)) return
  for (const child of node.getChildren())
    addNodeAndDescendants(selection, child)
}

function nodeOwnsMarkdownSource(
  node: LexicalNode,
  transformers: MarkdownPluginBehaviorProps["transformers"]
): boolean {
  const selection = $createNodeSelection()
  addNodeAndDescendants(selection, node)
  return Boolean(
    $convertSelectionToMarkdownString([...transformers], selection)
  )
}

function nodeCanJoinSourceRange(node: LexicalNode): boolean {
  return !(
    $isEfmBlockNode(node) && node.getData().kind === "footnote-definition"
  )
}

/** Keyboard guard shared by the behavior and its focused tests. */
export function canOpenSourceRangeEditorFromEvent(
  event: KeyboardEvent,
  editorIsComposing: boolean,
  hasNodeSelection: boolean
): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    editorIsComposing ||
    !hasNodeSelection
  ) {
    return false
  }
  const target = event.target
  const element =
    target instanceof Element
      ? target
      : target instanceof Node
        ? target.parentElement
        : null
  const textInput = element?.closest(TEXT_INPUT_SELECTOR)
  return (
    textInput === null ||
    textInput === undefined ||
    textInput?.classList.contains("eme-content-editable") === true
  )
}

/**
 * Opens one in-place Markdown source surface for a consecutive NodeSelection.
 * The behavior is contributed by `sourceEditingPlugin`; the editor assembly
 * only supplies the compiled transformer and feature context.
 */
export function SourceRangeEditingPlugin({
  inputProfile,
  onError,
  readOnly,
  syntaxFeatures,
  transformers,
}: MarkdownPluginBehaviorProps) {
  const [editor] = useLexicalComposerContext()
  const { matches } = useMarkdownShortcuts()
  const { activeDrafts, getAcceptedMarkdown } = useEfmSourceBlockContext()

  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (readOnly || !matches(event, "selection.edit-source")) {
            return false
          }

          const selection = $getSelection()
          const hasNodeSelection = $isNodeSelection(selection)
          if (
            !canOpenSourceRangeEditorFromEvent(
              event,
              editor.isComposing(),
              hasNodeSelection
            )
          ) {
            return false
          }

          event.preventDefault()
          if (!selection || !$isNodeSelection(selection) || activeDrafts > 0) {
            return true
          }

          const root = $getRoot()
          const rootChildren = root.getChildren()
          const selectedKeys = new Set(
            selection.getNodes().map((node) => node.getKey())
          )
          const rootKeys = new Set(rootChildren.map((node) => node.getKey()))
          if ([...selectedKeys].some((key) => !rootKeys.has(key))) return true

          const sourceMappedChildren = rootChildren.flatMap((node, rootIndex) =>
            nodeOwnsMarkdownSource(node, transformers)
              ? [{ node, rootIndex }]
              : []
          )
          const selectedSourceIndices = sourceMappedChildren.flatMap(
            ({ node }, sourceIndex) =>
              selectedKeys.has(node.getKey()) && nodeCanJoinSourceRange(node)
                ? [sourceIndex]
                : []
          )
          const selectedIndices = sourceMappedChildren.flatMap(
            ({ node, rootIndex }) =>
              selectedKeys.has(node.getKey()) && nodeCanJoinSourceRange(node)
                ? [rootIndex]
                : []
          )
          if (selectedIndices.length === 0) return true

          const acceptedMarkdown = getAcceptedMarkdown()
          const resolved = resolveEfmEditableSourceRange({
            inputProfile,
            markdown: acceptedMarkdown,
            selectedIndices: selectedSourceIndices,
            syntaxFeatures,
            topLevelCount: sourceMappedChildren.length,
          })
          if (!resolved.range) {
            if (resolved.reason === "source-map-mismatch") {
              onError(
                new Error(
                  "The selected blocks do not have one unambiguous Markdown source range."
                )
              )
            }
            return true
          }

          const markdownSelection = $createNodeSelection()
          for (const node of selectedIndices.map(
            (index) => rootChildren[index]
          )) {
            addNodeAndDescendants(markdownSelection, node)
          }
          const canonicalSource = $convertSelectionToMarkdownString(
            [...transformers],
            markdownSelection
          )
          if (!canonicalSource) return true

          const selectedElements = selectedIndices.flatMap((index) => {
            const element = editor.getElementByKey(rootChildren[index].getKey())
            return element ? [element] : []
          })
          const minimumHeight =
            selectedElements.length > 0
              ? Math.max(
                  ...selectedElements.map(
                    (element) => element.getBoundingClientRect().bottom
                  )
                ) -
                Math.min(
                  ...selectedElements.map(
                    (element) => element.getBoundingClientRect().top
                  )
                )
              : 0
          const selectedNodes = selectedIndices.map(
            (index) => rootChildren[index]
          )
          const first = selectedNodes[0]
          if (!first) return true

          const sourceNode = $createEfmSourceRangeNode({
            canonicalSource,
            documentInputProfile: inputProfile,
            expectedSource: resolved.range.expectedSource,
            inputProfile: resolved.range.inputProfile,
            minimumHeight,
            protectedSourceSuffix: resolved.range.protectedSourceSuffix,
            selectionIndex: selectedIndices[0],
            source: resolved.range.source,
            sourceStart: resolved.range.start,
            sourceEnd: resolved.range.end,
          })
          first.replace(sourceNode)
          for (const node of selectedNodes.slice(1)) node.remove()
          const nextSelection = $createNodeSelection()
          nextSelection.add(sourceNode.getKey())
          $setSelection(nextSelection)
          $addUpdateTag(HISTORIC_TAG)
          return true
        },
        COMMAND_PRIORITY_HIGH
      ),
    [
      activeDrafts,
      editor,
      getAcceptedMarkdown,
      inputProfile,
      matches,
      onError,
      readOnly,
      syntaxFeatures,
      transformers,
    ]
  )

  return null
}
