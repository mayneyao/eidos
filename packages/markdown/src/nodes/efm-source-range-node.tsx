import {
  DecoratorBlockNode,
  type SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import {
  $applyNodeReplacement,
  $createNodeSelection,
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  $setSelection,
  HISTORIC_TAG,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react"

import {
  tokenizeCodeLightweight,
  type CodeHighlightToken,
} from "../highlighting/code-highlight-tokenizer"
import {
  analyzeEfmMarkdown,
  $convertFromEfmMarkdownString,
} from "../markdown/efm-document"
import { useMarkdownShortcuts } from "../shortcuts/shortcut-context"
import type { EfmInputProfile } from "../types"
import {
  EXTERNAL_MARKDOWN_CONFLICT_MESSAGE,
  SOURCE_RANGE_COMMIT_TAG,
  useEfmSourceBlockContext,
} from "../ui/efm-source-block-context"
import {
  applySourceTextareaCommand,
  SOURCE_TEXTAREA_SHORTCUT_IDS,
  sourceTextareaCommandForEvent,
  type SourceTextareaState,
} from "../ui/source-textarea-shortcuts"

interface EfmSourceRangeData {
  canonicalSource: string
  documentInputProfile: EfmInputProfile
  expectedSource?: string
  inputProfile: EfmInputProfile
  minimumHeight: number
  protectedSourceSuffix?: string
  selectionIndex: number
  source: string
  sourceEnd: number
  sourceStart: number
}

const SOURCE_HISTORY_LIMIT = 200

function pushSourceHistory(
  history: SourceTextareaState[],
  state: SourceTextareaState
) {
  const previous = history.at(-1)
  if (
    previous?.value === state.value &&
    previous.selectionStart === state.selectionStart &&
    previous.selectionEnd === state.selectionEnd
  ) {
    return
  }
  history.push(state)
  if (history.length > SOURCE_HISTORY_LIMIT) history.shift()
}

type SerializedEfmSourceRangeNode = Spread<
  EfmSourceRangeData,
  SerializedDecoratorBlockNode
>

function focusEditor(editor: LexicalEditor): void {
  const view = editor.getRootElement()?.ownerDocument.defaultView
  view?.requestAnimationFrame(() => {
    editor.getRootElement()?.focus({ preventScroll: true })
  })
}

function selectNearIndex(index: number): void {
  const children = $getRoot().getChildren()
  const target = children[Math.min(index, Math.max(0, children.length - 1))]
  if (!target) return
  if ($isElementNode(target)) {
    target.selectStart()
    return
  }
  const selection = $createNodeSelection()
  selection.add(target.getKey())
  $setSelection(selection)
}

function highlightedSource(
  source: string,
  tokens: readonly CodeHighlightToken[]
): ReactNode[] {
  const output: ReactNode[] = []
  let cursor = 0
  for (const [index, token] of [...tokens]
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .entries()) {
    if (
      token.start < cursor ||
      token.start < 0 ||
      token.end <= token.start ||
      token.end > source.length
    ) {
      continue
    }
    if (token.start > cursor) output.push(source.slice(cursor, token.start))
    output.push(
      <span
        key={`${token.start}:${token.end}:${index}`}
        data-code-highlight-kind={token.kind}
      >
        {source.slice(token.start, token.end)}
      </span>
    )
    cursor = token.end
  }
  if (cursor < source.length) output.push(source.slice(cursor))
  return output
}

function SourceRangeEditor({
  data,
  editor,
  nodeKey,
}: {
  data: EfmSourceRangeData
  editor: LexicalEditor
  nodeKey: NodeKey
}) {
  const {
    baseUri,
    clearSourceRangeCommit,
    codeHighlightTokenizer,
    externalMarkdownConflict,
    getAcceptedMarkdown,
    onError,
    queueSourceRangeCommit,
    readOnly,
    registerDraft,
    syntaxFeatures,
    transformers,
  } = useEfmSourceBlockContext()
  const { ariaKeys, label, matches } = useMarkdownShortcuts()
  const [draft, setDraft] = useState(data.source)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [tokens, setTokens] = useState<readonly CodeHighlightToken[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelectionRef = useRef<{
    end: number
    start: number
  } | null>(null)
  const beforeInputRef = useRef<SourceTextareaState | null>(null)
  const redoHistoryRef = useRef<SourceTextareaState[]>([])
  const undoHistoryRef = useRef<SourceTextareaState[]>([])
  const descriptionId = useId()
  const errorId = useId()

  useEffect(() => registerDraft(), [registerDraft])

  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true })
    const end = textareaRef.current?.value.length ?? 0
    textareaRef.current?.setSelectionRange(end, end)
  }, [])

  useLayoutEffect(() => {
    const selection = pendingSelectionRef.current
    const textarea = textareaRef.current
    if (!selection || !textarea) return
    pendingSelectionRef.current = null
    textarea.setSelectionRange(selection.start, selection.end)
  }, [draft])

  const setTextareaState = (next: SourceTextareaState) => {
    const textarea = textareaRef.current
    if (textarea?.value === next.value) {
      textarea.setSelectionRange(next.selectionStart, next.selectionEnd)
      return
    }
    pendingSelectionRef.current = {
      start: next.selectionStart,
      end: next.selectionEnd,
    }
    setDraft(next.value)
    setDraftError(null)
  }

  useEffect(() => {
    let active = true
    const tokenizer =
      codeHighlightTokenizer === false
        ? null
        : (codeHighlightTokenizer ?? tokenizeCodeLightweight)
    if (!tokenizer) {
      setTokens([])
      return
    }
    try {
      void Promise.resolve(tokenizer(draft, "markdown"))
        .then((nextTokens) => {
          if (active) setTokens(nextTokens)
        })
        .catch((cause) => {
          if (!active) return
          setTokens([])
          onError(cause instanceof Error ? cause : new Error(String(cause)))
        })
    } catch (cause) {
      setTokens([])
      onError(cause instanceof Error ? cause : new Error(String(cause)))
    }
    return () => {
      active = false
    }
  }, [codeHighlightTokenizer, draft, onError])

  const cancel = () => {
    clearSourceRangeCommit()
    const acceptedMarkdown = getAcceptedMarkdown()
    editor.update(
      () => {
        if (!$isEfmSourceRangeNode($getNodeByKey(nodeKey))) return
        $convertFromEfmMarkdownString(acceptedMarkdown, transformers, {
          inputProfile: data.documentInputProfile,
          baseUri,
          syntaxFeatures,
        })
        selectNearIndex(data.selectionIndex)
      },
      { discrete: true, tag: HISTORIC_TAG }
    )
    focusEditor(editor)
  }

  useEffect(() => {
    if (readOnly) cancel()
  }, [readOnly])

  const save = () => {
    if (draft === data.source) {
      cancel()
      return
    }
    const acceptedMarkdown = getAcceptedMarkdown()
    const expectedSource = data.expectedSource ?? data.source
    if (
      acceptedMarkdown.slice(data.sourceStart, data.sourceEnd) !==
      expectedSource
    ) {
      setDraftError(
        "The selected Markdown source changed before this edit could be committed."
      )
      return
    }

    const draftAnalysis = analyzeEfmMarkdown(draft, {
      inputProfile: data.inputProfile,
      baseUri,
      syntaxFeatures,
    })
    const parseError = draftAnalysis.diagnostics.find(
      (diagnostic) => diagnostic.severity === "error"
    )
    if (parseError) {
      setDraftError(parseError.message)
      return
    }

    const replacementSource = `${draft}${data.protectedSourceSuffix ?? ""}`
    const nextMarkdown = `${acceptedMarkdown.slice(0, data.sourceStart)}${replacementSource}${acceptedMarkdown.slice(data.sourceEnd)}`
    queueSourceRangeCommit({
      start: data.sourceStart,
      end: data.sourceEnd,
      expectedSource,
      source: replacementSource,
    })
    try {
      editor.update(
        () => {
          if (!$isEfmSourceRangeNode($getNodeByKey(nodeKey))) return
          $convertFromEfmMarkdownString(nextMarkdown, transformers, {
            inputProfile: data.documentInputProfile,
            baseUri,
            syntaxFeatures,
          })
          selectNearIndex(data.selectionIndex)
        },
        {
          discrete: true,
          tag: [SOURCE_RANGE_COMMIT_TAG, HISTORY_PUSH_TAG],
        }
      )
      focusEditor(editor)
    } catch (cause) {
      clearSourceRangeCommit()
      const error = cause instanceof Error ? cause : new Error(String(cause))
      setDraftError(error.message)
      onError(error)
    }
  }

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (matches(event, "block-editor.commit")) {
        event.preventDefault()
        save()
      } else if (matches(event, "overlay.dismiss")) {
        event.preventDefault()
        cancel()
      } else if (
        matches(event, "history.undo") ||
        matches(event, "history.redo")
      ) {
        event.preventDefault()
        const undo = matches(event, "history.undo")
        const from = undo ? undoHistoryRef.current : redoHistoryRef.current
        const to = undo ? redoHistoryRef.current : undoHistoryRef.current
        const previous = from.pop()
        if (previous) {
          pushSourceHistory(to, {
            value: textarea.value,
            selectionStart: textarea.selectionStart,
            selectionEnd: textarea.selectionEnd,
          })
          setTextareaState(previous)
        }
      } else {
        const command = sourceTextareaCommandForEvent(event, matches)
        if (command) {
          event.preventDefault()
          const current = {
            value: textarea.value,
            selectionStart: textarea.selectionStart,
            selectionEnd: textarea.selectionEnd,
          }
          const next = applySourceTextareaCommand(current, command)
          if (next.value !== current.value) {
            pushSourceHistory(undoHistoryRef.current, current)
            redoHistoryRef.current = []
          }
          setTextareaState(next)
        }
      }
      // The textarea lives inside Lexical's contenteditable root. Contain every
      // editing key at the native target so Lexical cannot handle it as a
      // document command after the textarea has handled its own default action.
      event.stopPropagation()
    }
    textarea.addEventListener("keydown", handleKeyDown)
    return () => textarea.removeEventListener("keydown", handleKeyDown)
  }, [cancel, matches, save])

  const visibleError =
    draftError ??
    (externalMarkdownConflict ? EXTERNAL_MARKDOWN_CONFLICT_MESSAGE : null)
  const sourceHints = [
    {
      ids: ["format.bold", "format.italic"],
      text: "Format",
    },
    {
      ids: ["source-editor.indent"],
      text: "Indent",
    },
    {
      ids: ["source-editor.move-line-up", "source-editor.move-line-down"],
      text: "Move",
    },
    {
      ids: ["block-editor.commit"],
      text: "Apply",
    },
    {
      ids: ["overlay.dismiss"],
      text: "Cancel",
    },
  ] as const
  const visibleSourceHints = sourceHints.flatMap(({ ids, text }) => {
    const shortcuts = ids.flatMap((id) => {
      const shortcut = label(id)
      return shortcut ? [shortcut] : []
    })
    return shortcuts.length > 0 ? [{ shortcuts, text }] : []
  })

  return (
    <section
      className="eme-source-range-editor"
      contentEditable={false}
      data-efm-editor-interactive="true"
      data-source-range-editor="true"
      style={{ minHeight: `${Math.max(96, data.minimumHeight)}px` }}
      aria-label="Selected blocks source editor"
    >
      <div
        className="eme-source-shortcut-hint"
        data-source-shortcut-hint="true"
        aria-hidden="true"
      >
        {visibleSourceHints.map(({ shortcuts, text }, index) => (
          <span key={text}>
            <span className="eme-shortcut-hint-keys">
              {shortcuts.map((shortcut, shortcutIndex) => (
                <span key={shortcut}>
                  <kbd>{shortcut}</kbd>
                  {shortcutIndex < shortcuts.length - 1 ? "/" : null}
                </span>
              ))}
            </span>
            {text}
            {index < visibleSourceHints.length - 1 ? (
              <span className="eme-shortcut-hint-separator">·</span>
            ) : null}
          </span>
        ))}
      </div>
      <div className="eme-source-range-code">
        <pre aria-hidden="true">
          <code>{highlightedSource(draft, tokens)}</code>
        </pre>
        <textarea
          ref={textareaRef}
          aria-label="Selected blocks Markdown source"
          aria-describedby={`${descriptionId}${visibleError ? ` ${errorId}` : ""}`}
          aria-invalid={Boolean(draftError) || undefined}
          aria-keyshortcuts={ariaKeys([
            "block-editor.commit",
            "overlay.dismiss",
            "history.undo",
            "history.redo",
            ...SOURCE_TEXTAREA_SHORTCUT_IDS,
          ])}
          data-efm-editor-interactive="true"
          data-source-range-textarea="true"
          value={draft}
          wrap="soft"
          spellCheck={false}
          onBeforeInput={(event) => {
            const textarea = event.currentTarget
            beforeInputRef.current = {
              value: textarea.value,
              selectionStart: textarea.selectionStart,
              selectionEnd: textarea.selectionEnd,
            }
          }}
          onChange={(event) => {
            const before = beforeInputRef.current
            beforeInputRef.current = null
            if (before && before.value !== event.target.value) {
              pushSourceHistory(undoHistoryRef.current, before)
              redoHistoryRef.current = []
            }
            setDraft(event.target.value)
            setDraftError(null)
          }}
        />
      </div>
      <p id={descriptionId} className="eme-visually-hidden">
        Edit only the selected source. Press the commit shortcut to apply or
        Escape to restore it. Moving focus away keeps the draft open.
      </p>
      {visibleError ? (
        <p id={errorId} className="eme-source-range-error" role="alert">
          {visibleError}
        </p>
      ) : null}
    </section>
  )
}

/** Transient editor-only node used while a consecutive source range is open. */
export class EfmSourceRangeNode extends DecoratorBlockNode {
  __data: EfmSourceRangeData

  static getType(): string {
    return "efm-source-range"
  }

  static clone(node: EfmSourceRangeNode): EfmSourceRangeNode {
    return new EfmSourceRangeNode({ ...node.__data }, node.__key)
  }

  static importJSON(
    serializedNode: SerializedLexicalNode & Record<string, unknown>
  ): EfmSourceRangeNode {
    const data = serializedNode as unknown as SerializedEfmSourceRangeNode
    return $createEfmSourceRangeNode(data).setFormat(data.format)
  }

  constructor(data: EfmSourceRangeData, key?: NodeKey) {
    super(undefined, key)
    this.__data = data
  }

  exportJSON(): SerializedEfmSourceRangeNode {
    return {
      ...super.exportJSON(),
      ...this.getData(),
      type: "efm-source-range",
      version: 1,
    }
  }

  getData(): EfmSourceRangeData {
    return this.getLatest().__data
  }

  getTextContent(): string {
    return this.getData().canonicalSource
  }

  decorate(editor: LexicalEditor): JSX.Element {
    return (
      <SourceRangeEditor
        data={this.getData()}
        editor={editor}
        nodeKey={this.getKey()}
      />
    )
  }
}

export function $createEfmSourceRangeNode(
  data: EfmSourceRangeData
): EfmSourceRangeNode {
  return $applyNodeReplacement(new EfmSourceRangeNode(data))
}

export function $isEfmSourceRangeNode(
  node: LexicalNode | null | undefined
): node is EfmSourceRangeNode {
  return node instanceof EfmSourceRangeNode
}

export type { EfmSourceRangeData }
