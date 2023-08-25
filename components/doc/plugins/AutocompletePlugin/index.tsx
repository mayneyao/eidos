import { useEffect, useState } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { mergeRegister } from "@lexical/utils"
import { useDebounceFn } from "ahooks"
import { useCompletion } from "ai/react"
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_TAB_COMMAND,
  TextNode,
  type NodeKey,
} from "lexical"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useConfigStore } from "@/app/settings/store"

import { addSwipeRightListener } from "../../utils/swipe"


//  you can set completeSystemPrompt in localStorage to overwrite the default system prompt.
const defaultSysPrompt = `
your are a program to help user complete doc, your complete doc base on the user's input.

example1:
input: today i wa
output: nt to go outside

example2:
input: what do you 
output: like?
`

export default function AutocompletePlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const { aiConfig } = useConfigStore()
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
      token: aiConfig.token,
      baseUrl: aiConfig.baseUrl,
      systemPrompt:
        defaultSysPrompt || localStorage.getItem("completeSystemPrompt") || "",
    },
  })

  useEffect(() => {
    setCompleteLoading(isLoading)
  }, [isLoading, setCompleteLoading])

  function handleUpdate() {
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
  }
  const { run: debounceHandleUpdate } = useDebounceFn(handleUpdate, {
    wait: 1000,
  })
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
      //   editor.registerNodeTransform(
      //     AutocompleteNode,
      //     handleAutocompleteNodeTransform
      //   ),
      editor.registerUpdateListener(debounceHandleUpdate),
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
      ...(rootElem !== null
        ? [addSwipeRightListener(rootElem, handleSwipeRight)]
        : [])
    )
  }, [
    complete,
    completionNodeKey,
    debounceHandleUpdate,
    editor,
    isLoading,
    needHandle,
    suggestion,
  ])

  return null
}
