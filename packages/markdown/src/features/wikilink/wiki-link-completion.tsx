import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import {
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isTextNode,
} from "lexical"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { MarkdownPluginBehaviorProps } from "../../plugin-system/plugin-api"
import type { MarkdownNoteCandidate } from "../../types"
import { parseObsidianWikilink } from "../../markdown/obsidian-internal-link"
import {
  $createEfmBlockNode,
  $createEfmInlineNode,
} from "../../nodes/efm-semantic-node"
import {
  isDeniedEfmUri,
  normalizeEfmUri,
  resolveEfmResourceUri,
} from "../../markdown/efm-uri"
import { markdownImageSource } from "../../markdown/image-source"
import { MARKDOWN_FEATURES } from "../../plugin-system/feature-ids"

function safeImageUrl(value: string | undefined): value is string {
  if (!value || /[\r\n<>]/u.test(value)) return false
  const normalized = normalizeEfmUri(value)
  return Boolean(normalized && !isDeniedEfmUri(normalized))
}

export function matchWikiQuery(text: string) {
  const bracketStart = text.lastIndexOf("[[")
  if (bracketStart < 0 || text[bracketStart - 1] === "!") return null
  const start = bracketStart
  let slashes = 0
  for (let i = start - 1; i >= 0 && text[i] === "\\"; i--) slashes++
  const query = text.slice(bracketStart + 2)
  if (slashes % 2 || /[\[\]\n\r|]/u.test(query) || query.length > 240)
    return null
  return {
    leadOffset: start,
    matchingString: query,
    replaceableString: text.slice(start),
  }
}

class NoteOption extends MenuOption {
  constructor(
    public note: MarkdownNoteCandidate,
    public action: "link" | "image" = "link",
    public pathLabel = note.displayPath ?? note.path
  ) {
    super(`${action}:${note.path}`)
  }
}

function candidatePathLabel(
  note: MarkdownNoteCandidate,
  candidates: readonly MarkdownNoteCandidate[]
): string {
  const path = note.displayPath ?? note.path
  if (!note.displayPath || path.length < 48) return path
  const namesakes = candidates.filter(
    (other) => other.title === note.title && other.path !== note.path
  )
  if (!namesakes.length) return path
  const parts = path.split("/")
  // Keep enough parent directories to distinguish namesakes after removing
  // their long common ancestry. The complete host path stays accessible.
  for (let size = 2; size < parts.length; size++) {
    const suffix = parts.slice(-size).join("/")
    if (
      namesakes.every(
        (other) =>
          (other.displayPath ?? other.path)
            .split("/")
            .slice(-size)
            .join("/") !== suffix
      )
    )
      return `…/${suffix}`
  }
  return path
}

export function WikiLinkCompletion(props: MarkdownPluginBehaviorProps) {
  return props.searchNotes && !props.readOnly ? (
    <NoteCompletion {...props} />
  ) : null
}

function NoteCompletion({
  searchNotes,
  documentKey,
  labels,
  baseUri,
  syntaxFeatures,
}: MarkdownPluginBehaviorProps) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState<string | null>(null)
  const [options, setOptions] = useState<NoteOption[]>([])
  const [status, setStatus] = useState<
    "searchFiles" | "searchingFiles" | "noMatchingFiles" | "fileSearchFailed"
  >("searchFiles")
  const [parent, setParent] = useState<HTMLElement>()
  const [composing, setComposing] = useState(false)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const generation = useRef(0)
  const queryRef = useRef<string | null>(null)
  const changeQuery = useCallback((value: string | null) => {
    if (queryRef.current === value) return
    queryRef.current = value
    generation.current++
    setOptions([])
    setQuery(value)
  }, [])

  useEffect(() => {
    function start() {
      setComposing(true)
    }
    function end() {
      setComposing(false)
    }
    const unregister = editor.registerRootListener((root, previous) => {
      previous?.removeEventListener("compositionstart", start)
      previous?.removeEventListener("compositionend", end)
      root?.addEventListener("compositionstart", start)
      root?.addEventListener("compositionend", end)
      setParent(root?.parentElement ?? undefined)
    })
    return () => {
      unregister()
      editor.getRootElement()?.removeEventListener("compositionstart", start)
      editor.getRootElement()?.removeEventListener("compositionend", end)
    }
  }, [editor])

  useEffect(() => {
    if (query === null || !searchNotes || composing) return
    const controller = new AbortController()
    const current = generation.current
    setStatus("searchingFiles")
    const timer = setTimeout(() => {
      void Promise.resolve()
        .then(() =>
          searchNotes({ documentKey, query, signal: controller.signal })
        )
        .then((notes) => {
          if (controller.signal.aborted || current !== generation.current)
            return
          const seen = new Set<string>()
          const candidates = notes
            .filter((note) => {
              if (
                !note.path ||
                /[\[\]\n\r|\\]/u.test(note.path) ||
                seen.has(note.path)
              )
                return false
              seen.add(note.path)
              return true
            })
            .slice(0, 30)
          setOptions(
            candidates.flatMap((note) => [
              new NoteOption(
                note,
                "link",
                candidatePathLabel(note, candidates)
              ),
              ...(syntaxFeatures.has(MARKDOWN_FEATURES.image) &&
              safeImageUrl(note.imageUrl)
                ? [
                    new NoteOption(
                      note,
                      "image",
                      candidatePathLabel(note, candidates)
                    ),
                  ]
                : []),
            ])
          )
          setStatus("noMatchingFiles")
        })
        .catch(() => {
          if (!controller.signal.aborted && current === generation.current)
            setStatus("fileSearchFailed")
        })
    }, 100)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, searchNotes, documentKey, composing, syntaxFeatures])

  if (composing) return null
  return (
    <LexicalTypeaheadMenuPlugin<NoteOption>
      anchorClassName="eme-note-menu-anchor"
      parent={parent}
      options={options}
      onQueryChange={changeQuery}
      triggerFn={(text) => {
        if (editor.isComposing()) return null
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return null
        const node = selection.anchor.getNode()
        if (!$isTextNode(node) || node.hasFormat("code")) return null
        if (
          node
            .getParents()
            .some((parentNode) =>
              ["code", "link", "autolink"].includes(parentNode.getType())
            )
        )
          return null
        const match = matchWikiQuery(text)
        return match
      }}
      onSelectOption={(option, textNode, close) => {
        if (!textNode || editor.isComposing()) return
        const { path } = option.note
        const alias = option.note.displayText?.trim()
        if (alias && /[\[\]\n\r]/u.test(alias)) return
        const destination = parseObsidianWikilink(`[[${path}]]`)
        if (!destination) return
        const next = textNode.getNextSibling()
        if ($isTextNode(next) && next.getTextContent().startsWith("]]"))
          next.spliceText(0, 2, "")
        if (option.action === "image" && safeImageUrl(option.note.imageUrl)) {
          const url = option.note.imageUrl
          const alt = option.note.title
          textNode.select(0, textNode.getTextContentSize())
          $insertNodes([
            $createEfmBlockNode({
              kind: "image",
              source: markdownImageSource(url, alt),
              url,
              alt,
              resolvedUrl:
                resolveEfmResourceUri(url, baseUri, { image: true }) ??
                undefined,
            }),
          ])
          close()
          changeQuery(null)
          return
        }
        const link = $createEfmInlineNode({
          kind: "obsidian-link",
          source: `[[${path}${alias ? `|${alias.replace(/\|/gu, "\\|")}` : ""}]]`,
          label: alias || undefined,
          target: destination.target,
          path: destination.path,
          heading: destination.heading,
          blockId: destination.blockId,
        })
        textNode.replace(link)
        link.selectNext()
        close()
        changeQuery(null)
      }}
      menuRenderFn={(
        anchor,
        { selectedIndex, setHighlightedIndex, selectOptionAndCleanUp }
      ) =>
        anchor.current
          ? createPortal(
              <div
                className="eme-note-menu"
                onMouseDown={(event) => event.preventDefault()}
              >
                <div className="eme-note-menu-title">{labels.linkToFile}</div>
                <div className="eme-note-menu-options">
                  {options.length ? (
                    options.map((option, index) => (
                      <button
                        key={option.key}
                        id={`typeahead-item-${index}`}
                        ref={(element) => {
                          option.setRefElement(element)
                          const list = element?.parentElement
                          if (element && list && index === selectedIndex) {
                            const row = element.getBoundingClientRect()
                            const viewport = list.getBoundingClientRect()
                            if (row.top < viewport.top)
                              list.scrollTop -= viewport.top - row.top
                            else if (row.bottom > viewport.bottom)
                              list.scrollTop += row.bottom - viewport.bottom
                          }
                        }}
                        type="button"
                        role="option"
                        title={option.note.displayPath ?? option.note.path}
                        aria-label={[
                          option.note.title,
                          safeImageUrl(option.note.imageUrl)
                            ? option.action === "image"
                              ? (labels.insertFileImage ?? "Insert image")
                              : (labels.insertFileLink ?? "Insert link")
                            : null,
                          option.note.displayPath ?? option.note.path,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        aria-selected={index === selectedIndex}
                        className={index === selectedIndex ? "is-selected" : ""}
                        onPointerMove={(event) => {
                          const last = pointer.current
                          pointer.current = {
                            x: event.clientX,
                            y: event.clientY,
                          }
                          if (
                            last &&
                            (last.x !== event.clientX ||
                              last.y !== event.clientY)
                          )
                            setHighlightedIndex(index)
                        }}
                        onClick={() => selectOptionAndCleanUp(option)}
                      >
                        <span className="eme-note-option-title">
                          <span>{option.note.title}</span>
                          {safeImageUrl(option.note.imageUrl) ? (
                            <span className="eme-note-option-action">
                              {" "}
                              ·{" "}
                              {option.action === "image"
                                ? (labels.insertFileImage ?? "Insert image")
                                : (labels.insertFileLink ?? "Insert link")}
                            </span>
                          ) : null}
                        </span>
                        <small>{option.pathLabel}</small>
                      </button>
                    ))
                  ) : (
                    <div role="status">{labels[status]}</div>
                  )}
                </div>
              </div>,
              anchor.current
            )
          : null
      }
    />
  )
}
