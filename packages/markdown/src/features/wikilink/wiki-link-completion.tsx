import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { $getSelection, $isRangeSelection, $isTextNode } from "lexical"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { MarkdownPluginBehaviorProps } from "../../plugin-system/plugin-api"
import type { MarkdownNoteCandidate } from "../../types"
import { parseObsidianWikilink } from "../../markdown/obsidian-internal-link"
import { $createEfmInlineNode } from "../../nodes/efm-semantic-node"

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
  constructor(public note: MarkdownNoteCandidate) {
    super(note.path)
  }
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
          setOptions(
            notes
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
              .map((note) => new NoteOption(note))
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
  }, [query, searchNotes, documentKey, composing])

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
                        <span>{option.note.title}</span>
                        <small>{option.note.path}</small>
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
