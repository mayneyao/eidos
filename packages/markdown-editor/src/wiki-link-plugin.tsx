import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  type MenuTextMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { $getSelection, $isRangeSelection, type TextNode } from "lexical"

import { $createWikiLinkNode } from "./nodes/wiki-link-node"

export interface MarkdownWikiLinkSuggestion {
  key: string
  label: string
  description?: string
  /** Markdown content between `[[` and `]]`, including an optional `|alias`. */
  insertText: string
}

export type MarkdownWikiLinkSuggestionProvider = (
  query: string
) =>
  | Promise<readonly MarkdownWikiLinkSuggestion[]>
  | readonly MarkdownWikiLinkSuggestion[]

class WikiLinkOption extends MenuOption {
  readonly suggestion: MarkdownWikiLinkSuggestion

  constructor(suggestion: MarkdownWikiLinkSuggestion) {
    super(suggestion.key)
    this.suggestion = suggestion
  }
}

export function matchWikiLinkTypeahead(text: string): MenuTextMatch | null {
  const match = /\[\[([^\]\n|#]*)$/.exec(text)
  if (!match) return null
  return {
    leadOffset: match.index,
    matchingString: match[1].trim(),
    replaceableString: match[0],
  }
}

function wikiPayload(insertText: string): { target: string; label?: string } {
  const separator = insertText.indexOf("|")
  if (separator < 0) return { target: insertText }
  return {
    target: insertText.slice(0, separator),
    label: insertText.slice(separator + 1) || undefined,
  }
}

export function WikiLinkCompletionPlugin({
  provideSuggestions,
}: {
  provideSuggestions: MarkdownWikiLinkSuggestionProvider
}) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<
    readonly MarkdownWikiLinkSuggestion[]
  >([])
  const [loading, setLoading] = useState(false)
  const requestRef = useRef(0)

  useEffect(() => {
    if (query === null) {
      requestRef.current += 1
      setSuggestions([])
      setLoading(false)
      return
    }
    const request = ++requestRef.current
    setLoading(true)
    Promise.resolve(provideSuggestions(query))
      .then((next) => {
        if (request === requestRef.current) setSuggestions(next)
      })
      .catch(() => {
        if (request === requestRef.current) setSuggestions([])
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false)
      })
  }, [provideSuggestions, query])

  const options = useMemo(
    () => suggestions.map((suggestion) => new WikiLinkOption(suggestion)),
    [suggestions]
  )

  const select = useCallback(
    (
      option: WikiLinkOption,
      queryNode: TextNode | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        const payload = wikiPayload(option.suggestion.insertText)
        const node = $createWikiLinkNode({ ...payload, embed: false })
        if (queryNode) queryNode.replace(node)
        else {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) selection.insertNodes([node])
        }
        node.selectNext()
        closeMenu()
      })
    },
    [editor]
  )

  return (
    <LexicalTypeaheadMenuPlugin<WikiLinkOption>
      menuRenderFn={(
        anchor,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) =>
        anchor.current && (loading || options.length > 0)
          ? createPortal(
              <div className="eidos-md-command-menu eidos-md-wiki-menu">
                <div className="eidos-md-command-heading">Link to</div>
                {loading && options.length === 0 ? (
                  <div className="eidos-md-command-empty">Searching…</div>
                ) : (
                  <ul aria-label="Space documents" role="listbox">
                    {options.map((option, index) => {
                      const selected = selectedIndex === index
                      return (
                        <li
                          aria-selected={selected}
                          className={
                            selected ? "eidos-md-command-selected" : undefined
                          }
                          key={option.key}
                          onClick={() => {
                            setHighlightedIndex(index)
                            selectOptionAndCleanUp(option)
                          }}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          ref={option.setRefElement}
                          role="option"
                        >
                          <span className="eidos-md-command-copy">
                            <strong>{option.suggestion.label}</strong>
                            {option.suggestion.description ? (
                              <small>{option.suggestion.description}</small>
                            ) : null}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>,
              anchor.current
            )
          : null
      }
      onClose={() => setQuery(null)}
      onQueryChange={setQuery}
      onSelectOption={select}
      options={options}
      preselectFirstItem
      triggerFn={matchWikiLinkTypeahead}
    />
  )
}
