import { useCallback, useEffect, useMemo, useState } from "react"
import { IScript } from "@/worker/web-worker/meta-table/script"
import {
  FloatingPortal,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { TextNode } from "lexical"

import { useAIChatStore, useUserPrompts } from "../../hooks"

// At most, 5 suggestions are shown in the popup.
const SUGGESTION_LIST_LENGTH_LIMIT = 7

function useMentionLookupService(mentionString: string | null) {
  const [results, setResults] = useState<Array<IScript>>([])
  const { prompts } = useUserPrompts()

  const _prompts = useMemo(() => {
    return [{ name: "base", id: "base" } as IScript, ...prompts]
  }, [prompts])

  useEffect(() => {
    if (mentionString) {
      const filteredResults = _prompts.filter((prompt) => {
        return prompt.name.toLowerCase().includes(mentionString.toLowerCase())
      })
      setResults(filteredResults)
    } else {
      setResults(_prompts)
    }
  }, [mentionString, _prompts])
  return results
}

class MentionTypeaheadOption extends MenuOption {
  name: string
  id: string
  picture: JSX.Element
  rawData?: IScript

  constructor(
    name: string,
    id: string,
    picture: JSX.Element,
    rawData?: IScript
  ) {
    super(name)
    this.name = name
    this.id = id
    this.rawData = rawData
    this.picture = picture
  }
}

function MentionsTypeaheadMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
  option: MentionTypeaheadOption
}) {
  let className = "item"
  if (isSelected) {
    className += " selected"
  }
  return (
    <li
      key={option.key}
      tabIndex={-1}
      className={className}
      ref={option.setRefElement}
      role="option"
      aria-selected={isSelected}
      id={"typeahead-item-" + index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {option.picture}
      <span className="text truncate" title={option.name}>
        {option.name || "Untitled"}
      </span>
    </li>
  )
}

export function SwitchPromptPlugin(): JSX.Element | null {
  // fix context menu position
  // https://github.com/facebook/lexical/issues/3834
  const { x, y, refs, strategy } = useFloating({
    placement: "top-start",
    middleware: [offset(24), flip(), shift()],
  })

  const [editor] = useLexicalComposerContext()

  const [queryString, setQueryString] = useState<string | null>(null)

  const results = useMentionLookupService(queryString)

  const checkForSlashTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
  })

  const options = useMemo(() => {
    return results
      .map(
        (result) =>
          new MentionTypeaheadOption(result.name, result.id, <div></div>)
      )
      .slice(0, SUGGESTION_LIST_LENGTH_LIMIT)
  }, [results])

  const checkForMentionMatch = useCallback(
    (text: string) => {
      const slashMatch = checkForSlashTriggerMatch(text, editor)
      return slashMatch
    },
    [checkForSlashTriggerMatch, editor]
  )
  const { setCurrentSysPrompt } = useAIChatStore()

  const handleSelectOption = useCallback(
    (
      option: MentionTypeaheadOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void
    ) => {
      setCurrentSysPrompt(option.id)
      editor.update(() => {
        if (nodeToReplace) {
          nodeToReplace.remove()
        }
        closeMenu()
      })
    },
    [editor, setCurrentSysPrompt]
  )

  return (
    <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
      onQueryChange={setQueryString}
      onSelectOption={handleSelectOption}
      triggerFn={checkForMentionMatch}
      options={options}
      onOpen={(r) => {
        refs.setPositionReference({
          getBoundingClientRect: r.getRect,
        })
      }}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) =>
        anchorElementRef.current && results.length ? (
          <FloatingPortal root={anchorElementRef.current}>
            <div
              className="typeahead-popover mentions-menu min-w-[220px]"
              ref={refs.setFloating}
              style={{
                position: strategy,
                top: y ?? 0,
                left: x ?? 0,
                width: "max-content",
              }}
            >
              <ul>
                {options.map((option, i: number) => (
                  <MentionsTypeaheadMenuItem
                    index={i}
                    isSelected={selectedIndex === i}
                    onClick={() => {
                      setHighlightedIndex(i)
                      selectOptionAndCleanUp(option)
                    }}
                    onMouseEnter={() => {
                      setHighlightedIndex(i)
                    }}
                    key={option.id}
                    option={option}
                  />
                ))}
              </ul>
            </div>
          </FloatingPortal>
        ) : null
      }
    />
  )
}
