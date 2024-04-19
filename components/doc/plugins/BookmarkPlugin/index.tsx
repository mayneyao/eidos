import React, { useCallback, useEffect } from "react"
import { $isListItemNode } from "@lexical/list"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { $insertNodeToNearestRoot, mergeRegister } from "@lexical/utils"
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_NORMAL,
  LexicalCommand,
  PASTE_COMMAND,
  createCommand,
} from "lexical"
import ReactDOM from "react-dom"

import {
  $createBookmarkNode,
  $getUrlMetaData,
  BookmarkNode,
  BookmarkPayload,
} from "../../nodes/BookmarkNode"
import { getSelectedNode } from "../../utils/getSelectedNode"
import { validateUrl } from "../../utils/url"

export type InsertBookmarkPayload = Readonly<BookmarkPayload>

export const INSERT_BOOKMARK_COMMAND: LexicalCommand<InsertBookmarkPayload> =
  createCommand("INSERT_BOOKMARK_COMMAND")

// extends MenuOption to get some ux sugar
class LinkOptTypeaheadOption extends MenuOption {
  name: string
  id: string

  constructor(name: string, id: string) {
    super(name)
    this.name = name
    this.id = id
  }
}

function LinkOptTypeaheadMenuItem({
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
  option: LinkOptTypeaheadOption
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
      <span className="text truncate" title={option.name}>
        {option.name}
      </span>
    </li>
  )
}

const options = [
  {
    id: "dismiss",
    name: "Dismiss",
  },
  {
    id: "bookmark",
    name: "Create bookmark",
  },
].map((option) => new LinkOptTypeaheadOption(option.name, option.id))

export function BookmarkPlugin({
  captionsEnabled,
}: {
  captionsEnabled?: boolean
}): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const [isPaste, setIsPaste] = React.useState(false)

  const checkForLinkTriggerMatch = useBasicTypeaheadTriggerMatch("http", {
    minLength: 4,
  })

  const checkForLinkMatch = useCallback(
    (text: string) => {
      const linkMatch = checkForLinkTriggerMatch(text, editor)
      if (linkMatch !== null) {
        return null
      }
      if (isPaste && validateUrl(text)) {
        return {
          leadOffset: text.length,
          matchingString: text,
          replaceableString: text,
        }
      }
      return null
    },
    [checkForLinkTriggerMatch, editor, isPaste]
  )

  useEffect(() => {
    if (!editor.hasNodes([BookmarkNode])) {
      throw new Error("BookmarkPlugin: BookmarkNode not registered on editor")
    }
    return mergeRegister(
      editor.registerCommand<InsertBookmarkPayload>(
        INSERT_BOOKMARK_COMMAND,
        (payload) => {
          const selection = $getSelection()
          const bookmarkNode = $createBookmarkNode(payload)
          if ($isRangeSelection(selection)) {
            // $insertNodes([bookmarkNode])
            const node = getSelectedNode(selection)
            if ($isListItemNode(node)) {
              node.append(bookmarkNode)
            } else {
              $insertNodeToNearestRoot(bookmarkNode)
            }
          } else {
            $insertNodeToNearestRoot(bookmarkNode)
          }
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const clipboardEvent = event as ClipboardEvent
          if (clipboardEvent.clipboardData === null) {
            return false
          }
          const clipboardText = clipboardEvent.clipboardData.getData("text")
          try {
            new URL(clipboardText)
            if (validateUrl(clipboardText)) {
              setIsPaste(true)
              return false
            }
          } catch (error) {}
          return false
        },
        COMMAND_PRIORITY_NORMAL
      )
    )
  }, [captionsEnabled, editor])

  return (
    <LexicalTypeaheadMenuPlugin<LinkOptTypeaheadOption>
      onQueryChange={() => {}}
      onSelectOption={(option, textNode, closeMenu) => {
        if (option.id === "bookmark") {
          if (textNode) {
            $getUrlMetaData(textNode.getTextContent()).then((metaData) => {
              editor.update(() => {
                textNode.remove()
                editor.dispatchCommand(INSERT_BOOKMARK_COMMAND, metaData)
              })
            })
          }
        }
        setIsPaste(false)
        closeMenu()
      }}
      options={options}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) =>
        anchorElementRef.current
          ? ReactDOM.createPortal(
              <div className="typeahead-popover mentions-menu min-w-[220px]">
                <ul>
                  {options.map((option, i: number) => {
                    return (
                      <LinkOptTypeaheadMenuItem
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
                    )
                  })}
                </ul>
              </div>,
              anchorElementRef.current
            )
          : null
      }
      triggerFn={checkForLinkMatch}
    />
  )
}
