import React, { useCallback, useEffect, useMemo } from "react"
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
  $nodesOfType,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_NORMAL,
  LexicalCommand,
  PASTE_COMMAND,
  TextNode,
  createCommand,
} from "lexical"
import ReactDOM from "react-dom"

import {
  $createBookmarkNode,
  $getUrlMetaData,
  $isBookmarkNode,
  BookmarkNode,
  BookmarkPayload,
} from "../../nodes/BookmarkNode"
import { $createYouTubeNode } from "../../nodes/YoutubeNode"
import { getSelectedNode } from "../../utils/getSelectedNode"
import { validateUrl } from "../../utils/url"

export type InsertBookmarkPayload = Readonly<BookmarkPayload>

export const INSERT_BOOKMARK_COMMAND: LexicalCommand<InsertBookmarkPayload> =
  createCommand("INSERT_BOOKMARK_COMMAND")

export const INSERT_YOUTUBE_COMMAND: LexicalCommand<{ videoId: string }> =
  createCommand("INSERT_YOUTUBE_COMMAND")

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

export function BookmarkPlugin({
  captionsEnabled,
}: {
  captionsEnabled?: boolean
}): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const [isPaste, setIsPaste] = React.useState(false)
  const [link, setLink] = React.useState("")

  const checkForLinkTriggerMatch = useBasicTypeaheadTriggerMatch("http", {
    minLength: 4,
  })

  const checkForLinkMatch = useCallback(
    (text: string) => {
      const linkMatch = checkForLinkTriggerMatch(text, editor)
      if (linkMatch !== null) {
        setLink("")
        return null
      }
      if (isPaste && validateUrl(text)) {
        setLink(text)
        return {
          leadOffset: text.length,
          matchingString: text,
          replaceableString: text,
        }
      }
      setLink("")
      return null
    },
    [checkForLinkTriggerMatch, editor, isPaste]
  )

  const options = useMemo(() => {
    const res = [
      {
        id: "dismiss",
        name: "Dismiss",
      },
      {
        id: "bookmark",
        name: "Create bookmark",
      },
    ]
    if (link.startsWith("https://www.youtube.com/watch?v=")) {
      res.push({
        id: "youtube",
        name: "Embed YouTube video",
      })
    }
    return res.map(
      (option) => new LinkOptTypeaheadOption(option.name, option.id)
    )
  }, [link])

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
            const node = getSelectedNode(selection)
            if ($isListItemNode(node)) {
              node.append(bookmarkNode)
            } else {
              selection.insertNodes([bookmarkNode])
            }
          } else {
            $insertNodeToNearestRoot(bookmarkNode)
          }
          return true
        },
        COMMAND_PRIORITY_EDITOR
      ),
      editor.registerCommand<{ videoId: string }>(
        INSERT_YOUTUBE_COMMAND,
        (payload) => {
          const selection = $getSelection()
          const youtubeNode = $createYouTubeNode(payload.videoId)
          if ($isRangeSelection(selection)) {
            // $insertNodes([youtubeNode])
            const node = getSelectedNode(selection)
            if ($isListItemNode(node)) {
              node.append(youtubeNode)
            } else {
              $insertNodeToNearestRoot(youtubeNode)
            }
          } else {
            $insertNodeToNearestRoot(youtubeNode)
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

  const updateBookmarkInfo = useCallback(async () => {
    editor.update(() => {
      const nodes = $nodesOfType(BookmarkNode)
      const needFetchNodes = nodes.filter((node) => {
        if ($isBookmarkNode(node)) {
          return !node.getFetched()
        }
        return false
      })
      if (!needFetchNodes.length) return
      const data = Promise.all(
        needFetchNodes.map((node) => {
          return $getUrlMetaData(node.getUrl())
        })
      )
      data.then((res) => {
        editor.update(() => {
          res.forEach((item, index) => {
            const node = needFetchNodes[index]
            if (item.error) {
              node.setAll({
                title: node.getUrl(),
                url: node.getUrl(),
                fetched: true,
              })
            } else {
              node.setAll(item)
            }
          })
        })
      })
    })
  }, [editor])

  const handleSelectOption = useCallback(
    (
      option: LinkOptTypeaheadOption,
      textNode: TextNode | null,
      closeMenu: () => void,
      matchingString: string
    ) => {
      if (option.id === "bookmark") {
        if (textNode) {
          const url = textNode.getTextContent()
          editor.update(() => {
            textNode.remove()
            editor.dispatchCommand(INSERT_BOOKMARK_COMMAND, {
              url,
              title: url,
              fetched: false,
            })
          })

          setTimeout(() => {
            updateBookmarkInfo()
          }, 1000)
        }
      }
      if (option.id === "youtube") {
        const videoId = link.split("v=")[1]
        if (textNode) {
          textNode.remove()
        }
        editor.dispatchCommand(INSERT_YOUTUBE_COMMAND, { videoId })
      }
      setIsPaste(false)
      closeMenu()
    },
    [editor, link, updateBookmarkInfo]
  )

  return (
    <LexicalTypeaheadMenuPlugin<LinkOptTypeaheadOption>
      onQueryChange={() => {}}
      onSelectOption={handleSelectOption}
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
