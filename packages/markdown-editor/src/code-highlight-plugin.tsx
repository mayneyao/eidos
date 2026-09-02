import { useEffect } from "react"
import { $isCodeNode, CodeNode } from "@lexical/code-core"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getNodeByKey, type NodeKey } from "lexical"

import {
  CODE_HIGHLIGHT_KINDS,
  type CodeHighlightKind,
  type CodeHighlightToken,
  type CodeHighlightTokenizer,
  tokenizeCodeLightweight,
} from "./code-highlight-tokenizer"

interface HighlightRuntime {
  createHighlight: (...ranges: AbstractRange[]) => Highlight
  registry: HighlightRegistry
}

interface DocumentHighlightState {
  createHighlight: HighlightRuntime["createHighlight"]
  published: Map<CodeHighlightKind, Highlight>
  registry: HighlightRegistry
  sources: Map<symbol, ReadonlyMap<CodeHighlightKind, readonly Range[]>>
}

type BlockRanges = Map<
  NodeKey,
  ReadonlyMap<CodeHighlightKind, readonly Range[]>
>

const HIGHLIGHT_PREFIX = "eme-code-"
const documentHighlightStates = new WeakMap<Document, DocumentHighlightState>()

function getHighlightRuntime(ownerDocument: Document): HighlightRuntime | null {
  const view = ownerDocument.defaultView as
    | (Window & {
        CSS?: { highlights?: HighlightRegistry }
        Highlight?: new (...ranges: AbstractRange[]) => Highlight
      })
    | null
  const registry = view?.CSS?.highlights
  const HighlightConstructor = view?.Highlight
  if (!registry || !HighlightConstructor) return null
  return {
    createHighlight: (...ranges) => new HighlightConstructor(...ranges),
    registry,
  }
}

function getDocumentHighlightState(
  ownerDocument: Document
): DocumentHighlightState | null {
  const existing = documentHighlightStates.get(ownerDocument)
  if (existing) return existing
  const runtime = getHighlightRuntime(ownerDocument)
  if (!runtime) return null
  const state: DocumentHighlightState = {
    ...runtime,
    published: new Map(),
    sources: new Map(),
  }
  documentHighlightStates.set(ownerDocument, state)
  return state
}

function refreshDocumentHighlights(state: DocumentHighlightState) {
  for (const kind of CODE_HIGHLIGHT_KINDS) {
    const ranges: Range[] = []
    for (const source of state.sources.values()) {
      ranges.push(...(source.get(kind) ?? []))
    }

    const name = `${HIGHLIGHT_PREFIX}${kind}`
    const previous = state.published.get(kind)
    if (ranges.length === 0) {
      if (previous && state.registry.get(name) === previous) {
        state.registry.delete(name)
      }
      state.published.delete(kind)
      continue
    }

    const next = state.createHighlight(...ranges)
    state.registry.set(name, next)
    state.published.set(kind, next)
  }
}

function setDocumentSource(
  ownerDocument: Document,
  sourceKey: symbol,
  ranges: ReadonlyMap<CodeHighlightKind, readonly Range[]>
) {
  const state = getDocumentHighlightState(ownerDocument)
  if (!state) return
  state.sources.set(sourceKey, ranges)
  refreshDocumentHighlights(state)
}

function removeDocumentSource(ownerDocument: Document, sourceKey: symbol) {
  const state = documentHighlightStates.get(ownerDocument)
  if (!state || !state.sources.delete(sourceKey)) return
  refreshDocumentHighlights(state)
}

function flattenBlockRanges(
  blocks: BlockRanges
): ReadonlyMap<CodeHighlightKind, readonly Range[]> {
  const flattened = new Map<CodeHighlightKind, Range[]>()
  for (const block of blocks.values()) {
    for (const [kind, ranges] of block) {
      const existing = flattened.get(kind)
      if (existing) existing.push(...ranges)
      else flattened.set(kind, [...ranges])
    }
  }
  return flattened
}

interface TextSegment {
  end: number
  node: Text
  start: number
}

interface TextLayout {
  segments: TextSegment[]
  text: string
}

function collectTextLayout(element: HTMLElement): TextLayout {
  const segments: TextSegment[] = []
  const chunks: string[] = []
  let offset = 0

  const visit = (parent: Node) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === 3) {
        const text = child as Text
        const start = offset
        offset += text.data.length
        chunks.push(text.data)
        segments.push({ start, end: offset, node: text })
      } else if (child.nodeName === "BR") {
        chunks.push("\n")
        offset += 1
      } else {
        visit(child)
      }
    }
  }

  visit(element)
  return { segments, text: chunks.join("") }
}

function findTextPoint(
  segments: readonly TextSegment[],
  offset: number
): { node: Text; offset: number } | null {
  for (const segment of segments) {
    if (offset >= segment.start && offset <= segment.end) {
      return { node: segment.node, offset: offset - segment.start }
    }
  }
  return null
}

function createTokenRanges(
  element: HTMLElement,
  tokens: readonly CodeHighlightToken[],
  layout: TextLayout
): ReadonlyMap<CodeHighlightKind, readonly Range[]> {
  const { segments, text } = layout
  if (segments.length === 0) return new Map()
  const textLength = text.length
  const ranges = new Map<CodeHighlightKind, Range[]>()

  for (const token of tokens) {
    if (token.start < 0 || token.end <= token.start || token.end > textLength) {
      continue
    }
    const start = findTextPoint(segments, token.start)
    const end = findTextPoint(segments, token.end)
    if (!start || !end) continue
    const range = element.ownerDocument.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    const existing = ranges.get(token.kind)
    if (existing) existing.push(range)
    else ranges.set(token.kind, [range])
  }

  return ranges
}

export interface CodeHighlightPluginProps {
  onError?: (error: Error) => void
  tokenizer?: CodeHighlightTokenizer
}

/**
 * Highlights Lexical CodeNodes through the CSS Custom Highlight API.
 * Tokens remain rendering-only DOM ranges; Lexical state and Markdown stay
 * plain text, and unsupported browsers retain fully editable code blocks.
 */
export function CodeHighlightPlugin({
  onError,
  tokenizer = tokenizeCodeLightweight,
}: CodeHighlightPluginProps = {}) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const sourceKey = Symbol("eidos-code-highlights")
    const blockRanges: BlockRanges = new Map()
    const pendingKeys = new Set<NodeKey>()
    const versions = new Map<NodeKey, number>()
    let disposed = false
    let frame: number | null = null
    let publishedDocument: Document | null = null

    const publish = (ownerDocument: Document) => {
      if (publishedDocument && publishedDocument !== ownerDocument) {
        removeDocumentSource(publishedDocument, sourceKey)
      }
      publishedDocument = ownerDocument
      setDocumentSource(
        ownerDocument,
        sourceKey,
        flattenBlockRanges(blockRanges)
      )
    }

    const reportError = (cause: unknown) => {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      if (onError) onError(error)
      else console.error(error)
    }

    const highlightKey = async (key: NodeKey, version: number) => {
      const snapshot = editor.getEditorState().read(() => {
        const node = $getNodeByKey(key)
        if (!$isCodeNode(node)) return null
        return {
          code: node.getTextContent(),
          language: node.getLanguage() ?? "",
        }
      })
      const element = editor.getElementByKey(key)
      if (!snapshot || !element) {
        blockRanges.delete(key)
        return
      }
      const runtime = getHighlightRuntime(element.ownerDocument)
      if (!runtime) return

      const tokens = await tokenizer(snapshot.code, snapshot.language)
      if (disposed || versions.get(key) !== version) return
      const currentElement = editor.getElementByKey(key)
      if (!currentElement) return
      const layout = collectTextLayout(currentElement)
      if (layout.text !== snapshot.code) return
      blockRanges.set(key, createTokenRanges(currentElement, tokens, layout))
      publish(currentElement.ownerDocument)
    }

    const flush = () => {
      frame = null
      const keys = [...pendingKeys]
      pendingKeys.clear()
      for (const key of keys) {
        const version = versions.get(key)
        if (version === undefined) continue
        void highlightKey(key, version).catch(reportError)
      }
    }

    const schedule = () => {
      if (frame !== null || pendingKeys.size === 0) return
      const view = editor.getRootElement()?.ownerDocument.defaultView
      if (!view) return
      frame = view.requestAnimationFrame(flush)
    }

    const queueKey = (key: NodeKey) => {
      versions.set(key, (versions.get(key) ?? 0) + 1)
      pendingKeys.add(key)
    }

    const unregisterMutations = editor.registerMutationListener(
      CodeNode,
      (mutations) => {
        let removed = false
        for (const [key, mutation] of mutations) {
          if (mutation === "destroyed") {
            versions.set(key, (versions.get(key) ?? 0) + 1)
            pendingKeys.delete(key)
            blockRanges.delete(key)
            removed = true
          } else {
            queueKey(key)
          }
        }
        if (removed && publishedDocument) publish(publishedDocument)
        schedule()
      },
      { skipInitialization: false }
    )

    const unregisterUpdates = editor.registerUpdateListener(
      ({ dirtyElements, editorState }) => {
        const indirectlyDirtyCodeKeys = editorState.read(() => {
          const keys: NodeKey[] = []
          for (const [key, intentionallyDirty] of dirtyElements) {
            if (intentionallyDirty) continue
            const node = $getNodeByKey(key)
            if ($isCodeNode(node)) keys.push(key)
          }
          return keys
        })
        for (const key of indirectlyDirtyCodeKeys) queueKey(key)
        schedule()
      }
    )

    return () => {
      disposed = true
      unregisterUpdates()
      unregisterMutations()
      const view = editor.getRootElement()?.ownerDocument.defaultView
      if (frame !== null && view) view.cancelAnimationFrame(frame)
      if (publishedDocument) removeDocumentSource(publishedDocument, sourceKey)
    }
  }, [editor, onError, tokenizer])

  return null
}
