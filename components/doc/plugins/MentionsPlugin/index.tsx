/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import { useCallback, useEffect, useMemo, useState } from "react"
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
  MenuTextMatch,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { $getSelection, $insertNodes, RangeSelection, TextNode } from "lexical"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { shortenId, uuidv4 } from "@/lib/utils"
import { useQueryNode } from "@/hooks/use-query-node"
import { useSqlite } from "@/hooks/use-sqlite"
import { ItemIcon } from "@/components/sidebar/item-tree"
import { NodeIconEditor } from "@/app/[database]/[node]/node-icon"

import { $createMentionNode } from "../../nodes/MentionNode/MentionNode"
import { $createSyncBlock } from "../../nodes/SyncBlock/SyncBlock"

const PUNCTUATION =
  "\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%'\"~=<>_:;"
const NAME = "\\b[A-Z][^\\s" + PUNCTUATION + "]"

const DocumentMentionsRegex = {
  NAME,
  PUNCTUATION,
}

const PUNC = DocumentMentionsRegex.PUNCTUATION

const TRIGGERS = ["@"].join("")

// Chars we expect to see in a mention (non-space, non-punctuation).
const VALID_CHARS = "[^" + TRIGGERS + PUNC + "\\s]"

// Non-standard series of chars. Each series must be preceded and followed by
// a valid char.
const VALID_JOINS =
  "(?:" +
  "\\.[ |$]|" + // E.g. "r. " in "Mr. Smith"
  " |" + // E.g. " " in "Josh Duck"
  "[" +
  PUNC +
  "]|" + // E.g. "-' in "Salier-Hellendag"
  ")"

const LENGTH_LIMIT = 75

const AtSignMentionsRegex = new RegExp(
  "(^|\\s|\\()(" +
    "[" +
    TRIGGERS +
    "]" +
    "((?:" +
    VALID_CHARS +
    VALID_JOINS +
    "){0," +
    LENGTH_LIMIT +
    "})" +
    ")$"
)

// 50 is the longest alias length limit.
const ALIAS_LENGTH_LIMIT = 50

// Regex used to match alias.
const AtSignMentionsRegexAliasRegex = new RegExp(
  "(^|\\s|\\()(" +
    "[" +
    TRIGGERS +
    "]" +
    "((?:" +
    VALID_CHARS +
    "){0," +
    ALIAS_LENGTH_LIMIT +
    "})" +
    ")$"
)

// At most, 5 suggestions are shown in the popup.
const SUGGESTION_LIST_LENGTH_LIMIT = 5

const mentionsCache = new Map()

function useMentionLookupService(
  mentionString: string | null,
  enabledCreate: boolean
) {
  const [results, setResults] = useState<Array<ITreeNode>>([])

  const { queryNodes } = useQueryNode()

  useEffect(() => {
    const cachedResults = mentionsCache.get(mentionString)
    if (cachedResults === null) {
      return
    } else if (cachedResults !== undefined) {
      setResults(cachedResults)
      return
    }
    mentionString &&
      queryNodes(mentionString ?? "").then((newResults) => {
        const _newResults = [...(newResults || [])] as any
        if (enabledCreate) {
          _newResults.push({
            id: `new-${mentionString}`,
            name: `New "${mentionString}" sub-doc`,
            type: "doc",
            mode: "node",
          })
        }
        mentionsCache.set(mentionString, _newResults)
        setResults(_newResults ?? [])
      })
  }, [enabledCreate, mentionString, queryNodes])

  return results
}

function checkForAtSignMentions(
  text: string,
  minMatchLength: number
): MenuTextMatch | null {
  let match = AtSignMentionsRegex.exec(text)

  if (match === null) {
    match = AtSignMentionsRegexAliasRegex.exec(text)
  }
  if (match !== null) {
    // The strategy ignores leading whitespace but we need to know it's
    // length to add it to the leadOffset
    const maybeLeadingWhitespace = match[1]

    const matchingString = match[3]
    if (matchingString.length >= minMatchLength) {
      return {
        leadOffset: match.index + maybeLeadingWhitespace.length,
        matchingString,
        replaceableString: match[2],
      }
    }
  }
  return null
}

function getPossibleQueryMatch(text: string): MenuTextMatch | null {
  const match = checkForAtSignMentions(text, 0)
  if (text.startsWith("@") && match === null) {
    return {
      leadOffset: 0,
      matchingString: "",
      replaceableString: "@",
    }
  }
  return match
}

class MentionTypeaheadOption extends MenuOption {
  name: string
  id: string
  picture: JSX.Element
  rawData: ITreeNode

  constructor(
    name: string,
    id: string,
    rawData: ITreeNode,
    picture: JSX.Element
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
  onClick: (e: React.MouseEvent) => void
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

export interface MentionPluginProps {
  onOptionSelectCallback?: (selectedOption: MentionTypeaheadOption) => void
  currentDocId?: string
}

export default function NewMentionsPlugin(
  props: MentionPluginProps
): JSX.Element | null {
  // fix context menu position
  // https://github.com/facebook/lexical/issues/3834
  const { x, y, refs, strategy } = useFloating({
    placement: "top-start",
    middleware: [offset(24), flip(), shift()],
  })

  const [editor] = useLexicalComposerContext()

  const [queryString, setQueryString] = useState<string | null>(null)

  const results = useMentionLookupService(
    queryString,
    Boolean(props.currentDocId)
  )
  const { currentDocId } = props
  const { createDoc } = useSqlite()

  const checkForSlashTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
  })

  const options = useMemo(() => {
    return results
      .map(
        (result) =>
          new MentionTypeaheadOption(
            result.name,
            result.id,
            result,
            (
              <NodeIconEditor
                icon={result.icon}
                nodeId={result.id}
                disabled
                size="1em"
                customTrigger={
                  <ItemIcon
                    type={result?.type ?? ""}
                    className="mr-1 inline-block h-5 w-5"
                  />
                }
              />
            )
          )
      )
      .slice(0, SUGGESTION_LIST_LENGTH_LIMIT)
  }, [results])

  const onSelectOption = useCallback(
    (
      selectedOption: MentionTypeaheadOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void
    ) => {
      let nodeId = selectedOption.id
      if (nodeId.startsWith("new-")) {
        const docTitle = nodeId.slice(4)
        const docId = shortenId(uuidv4())
        createDoc(docTitle, currentDocId, docId)
        docId && (nodeId = docId)
      }
      editor.update(() => {
        const selection = $getSelection()
        const selectedNode = (selection as RangeSelection).anchor.getNode()
        const mentionNode = $createMentionNode(nodeId)
        $insertNodes([mentionNode])
        selectedNode.insertAfter(mentionNode)
        nodeToReplace?.remove()
        closeMenu()
        props.onOptionSelectCallback?.(selectedOption)
      })
    },
    [createDoc, currentDocId, editor, props]
  )

  const checkForMentionMatch = useCallback(
    (text: string) => {
      const slashMatch = checkForSlashTriggerMatch(text, editor)
      if (slashMatch !== null) {
        return null
      }
      const match = getPossibleQueryMatch(text)
      // console.log("match", match)
      return match
    },
    [checkForSlashTriggerMatch, editor]
  )
  const handleQueryChange = setQueryString

  const createSyncBlock = (nodeId: string) => {
    console.log("createSyncBlock")
    editor.update(() => {
      const selection = $getSelection()
      const selectedNode = (selection as RangeSelection).anchor.getNode()
      const mentionNode = $createSyncBlock(nodeId)
      selectedNode.replace(mentionNode)
    })
  }

  return (
    <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
      onQueryChange={handleQueryChange}
      onSelectOption={onSelectOption}
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
                    onClick={(e) => {
                      if (e.altKey) {
                        createSyncBlock(option.id)
                      } else {
                        setHighlightedIndex(i)
                        selectOptionAndCleanUp(option)
                      }
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
