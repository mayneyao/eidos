/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * fork from lexical, but change a lot
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  FloatingPortal,
  Placement,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { $getSelection, $insertNodes, RangeSelection, TextNode } from "lexical"

import { shortenId, uuidv7 } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import { useEditorInstance } from "@/components/doc/hooks/editor-instance-context"

import { $createSyncBlockNode } from "../../sync/node"
import { $createMentionNode } from "../node"
import { MentionTypeaheadOption } from "./MentionTypeaheadOption"
import { MentionsTypeaheadMenuItem } from "./MentionsTypeaheadMenuItem"
import { getPossibleQueryMatch } from "./helper"
import { useMentionLookupService } from "./useMentionLookupService"

// At most, 5 suggestions are shown in the popup.
const SUGGESTION_LIST_LENGTH_LIMIT = 5

export interface MentionPluginProps {
  onOptionSelectCallback?: (selectedOption: MentionTypeaheadOption) => void
  placement?: Placement
}

export default function NewMentionsPlugin(
  props: MentionPluginProps
): JSX.Element | null {
  const { docId } = useEditorInstance()
  const placement = props.placement || "bottom-start"
  const middleware = [flip(), shift()]
  if (placement == "top-start") {
    middleware.push(offset(24))
  }
  // fix context menu position
  // https://github.com/facebook/lexical/issues/3834
  const { x, y, refs, strategy, update } = useFloating({
    placement: placement,
    middleware: middleware,
  })

  const [editor] = useLexicalComposerContext()
  const currentDocId = docId ?? undefined

  const [queryString, setQueryString] = useState<string | null>(null)

  const results = useMentionLookupService(
    queryString,
    Boolean(docId),
    currentDocId
  )
  const { createDoc } = useSqlite()

  const checkForSlashTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
  })

  const options = useMemo(() => {
    return results
      .map(
        (result) => new MentionTypeaheadOption(result.name, result.id, result)
      )
      .slice(0, SUGGESTION_LIST_LENGTH_LIMIT)
  }, [results])

  useEffect(() => {
    update()
  }, [options, update])

  const onSelectOption = useCallback(
    (
      selectedOption: MentionTypeaheadOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void
    ) => {
      let nodeId = selectedOption.id
      if (nodeId.startsWith("new-")) {
        const docTitle = nodeId.slice(4)
        const docId = shortenId(uuidv7())
        createDoc(docTitle, currentDocId, docId)
        docId && (nodeId = docId)
      }
      editor.update(() => {
        if (currentDocId === nodeId) {
          return
        }
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
    if (nodeId.startsWith("new-")) {
      return
    }
    if (currentDocId === nodeId) {
      return
    }
    editor.update(() => {
      const selection = $getSelection()
      const selectedNode = (selection as RangeSelection).anchor.getNode()
      const mentionNode = $createSyncBlockNode(nodeId)
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
              className="typeahead-popover mentions-menu min-w-[220px] max-w-[300px]"
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
