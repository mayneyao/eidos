import { useCallback, useEffect, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { mergeRegister } from "@lexical/utils"
import { useCompletion } from "ai/react"
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  TextNode,
  type NodeKey,
} from "lexical"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useAIConfigStore } from "@/app/settings/ai/store"
import { useConfigStore } from "@/app/settings/store"

import { addSwipeRightListener } from "../../utils/swipe"
import { AI_COMPLETE_COMMAND } from "./cmd"

//  you can set completeSystemPrompt in localStorage to overwrite the default system prompt.
const defaultSysPrompt = `
1. your are a program to help user complete doc
2. your complete doc base on the user's input.
3. your are good at English and Chinese.

example1:
input: 雄关漫道真如铁, 
output: 而今迈步从头越

example2:
input: today i wa
output: nt to go outside
`

export default function AutocompletePlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const { aiConfig } = useAIConfigStore()
  const { disableDocAIComplete, setCompleteLoading } = useAppRuntimeStore()

  const [completionNodeKey, setCompletionNodeKey] = useState<NodeKey | null>(
    null
  )
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [needHandle, setNeedHandle] = useState<boolean>(false)
  const clearSuggestion = () => setSuggestion(null)
  const { complete, isLoading, stop } = useCompletion({
    api: "/api/completion",
    body: {
      // token: aiConfig.token,
      // baseUrl: aiConfig.baseUrl,
      systemPrompt:
        defaultSysPrompt || localStorage.getItem("completeSystemPrompt") || "",
    },
  })

  useEffect(() => {
    setCompleteLoading(isLoading)
  }, [isLoading, setCompleteLoading])

  const handleAIComplete = useCallback(() => {
    if (disableDocAIComplete) {
      return
    }
    if (needHandle || isLoading) {
      stop()
      console.log("stop complete")
      return
    }
    console.log("handleUpdate")
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const maybeNode = selection.anchor.getNode()
        if ($isTextNode(maybeNode)) {
          const text = maybeNode.getTextContent()
          if (text.trim().length) {
            console.log("this node text: ", text)
            complete(text).then((res) => {
              console.log("res: ", res)
              if (res) {
                setSuggestion(res)
              }
            })
          }
        }
      }
    })
  }, [complete, disableDocAIComplete, editor, isLoading, needHandle, stop])

  useEffect(() => {
    editor.update(() => {
      if (suggestion) {
        const newNode = $createTextNode(suggestion)
        const selection = $getSelection()
        if ($isRangeSelection(selection)) {
          const maybeNode = selection.anchor.getNode()
          if ($isTextNode(maybeNode)) {
            maybeNode.insertAfter(newNode)
            newNode.setStyle("color: #908e8e;")
            setCompletionNodeKey(newNode.getKey())
            setNeedHandle(true)
            clearSuggestion()
          }
        }
      }
    })

    function $handleClearCompletionNode(e: Event) {
      if (needHandle && completionNodeKey != null) {
        editor.update(() => {
          const completionNode = $getNodeByKey(completionNodeKey) as TextNode
          // delete completion node
          completionNode?.remove()
        })
        clearSuggestion()
        setCompletionNodeKey(null)
        setNeedHandle(false)
        return true
      }
      return false
    }
    function $handleAutocompleteIntent(): boolean {
      if (isLoading || !needHandle) {
        return false
      }
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const maybeNode = selection.anchor.getNode()
        if ($isTextNode(maybeNode) && completionNodeKey != null) {
          const completionNode = $getNodeByKey(completionNodeKey) as TextNode
          completionNode?.setStyle("")
          completionNode?.select()
          clearSuggestion()
          setCompletionNodeKey(null)
          //  after handle autocomplete intent, we need to disable completion for a while
          //  to avoid the situation that the user input is not finished, but the completion
          //  is triggered again.
          setTimeout(() => {
            setNeedHandle(false)
          }, 1000)
          return true
        }
      }
      return false
    }
    function $handleKeypressCommand(e: Event) {
      if ($handleAutocompleteIntent()) {
        e.preventDefault()
        return true
      }
      return false
    }
    function handleSwipeRight(_force: number, e: TouchEvent) {
      editor.update(() => {
        if ($handleAutocompleteIntent()) {
          e.preventDefault()
        }
      })
    }

    const rootElem = editor.getRootElement()

    return mergeRegister(
      editor.registerCommand(
        KEY_TAB_COMMAND,
        $handleKeypressCommand,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ARROW_RIGHT_COMMAND,
        $handleKeypressCommand,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        $handleClearCompletionNode,
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand<string>(
        AI_COMPLETE_COMMAND,
        (payload) => {
          handleAIComplete()
          return true
        },
        COMMAND_PRIORITY_LOW
      ),
      ...(rootElem !== null
        ? [addSwipeRightListener(rootElem, handleSwipeRight)]
        : [])
    )
  }, [
    complete,
    completionNodeKey,
    handleAIComplete,
    editor,
    isLoading,
    needHandle,
    suggestion,
  ])

  return null
}
