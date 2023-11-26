import { useEffect, useRef, useState } from "react"
import { IScript } from "@/worker/meta_table/script"
import { useKeyPress } from "ahooks"

import { ActionExecutor } from "@/lib/action/action"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useScripts } from "@/hooks/use-scripts"

import { CommandDialogDemo } from "."
import { useScriptFunction } from "../script-container/hook"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command"
import { useInput } from "./hooks"

export const ScriptList = () => {
  const { isCmdkOpen, setCmdkOpen } = useAppRuntimeStore()
  const { input, setInput, mode } = useInput()
  const { callFunction } = useScriptFunction()
  const [currentAction, setCurrentAction] = useState<IScript>()
  const { space } = useCurrentPathInfo()
  const currentNode = useCurrentNode()
  const scripts = useScripts(space)
  const inputRef = useRef<HTMLInputElement>(null)
  const onItemSelect = (action: IScript) => () => {
    const paramsString = Object.keys(action.inputJSONSchema?.properties || {})
      .map((param) => {
        return `--${param}=`
      })
      .join(" ")
    let input = `!${action.name}`
    if (paramsString.length > 0) {
      input += ` ${paramsString}`
    }
    setInput(input)
    setTimeout(() => {
      setCurrentAction(action)
    }, 400)
  }

  useEffect(() => {
    setTimeout(() => {
      if (inputRef.current) {
        const length = inputRef.current.value.length
        inputRef.current.setSelectionRange(length, length)
      }
    }, 0)
  }, [])

  useKeyPress("Enter", () => {
    if (currentAction) {
      console.log("executing command: " + input)
      const realParams: Record<string, any> = ActionExecutor.getParams(input)
      callFunction({
        input: realParams,
        context: {
          tables: currentAction.fieldsMap,
          env: currentAction.envMap,
          currentNodeId: currentNode?.id,
        },
        code: currentAction.code,
        id: currentAction.id,
      })
      setInput("")
      setCmdkOpen(false)
    }
  })

  if (mode === "search") {
    return <CommandDialogDemo />
  }
  return (
    <CommandDialog open={isCmdkOpen} onOpenChange={setCmdkOpen}>
      <CommandInput
        placeholder="Type a command or search..."
        value={input}
        ref={inputRef}
        onValueChange={setInput}
        autoFocus={false}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          {scripts.map((script) => {
            const value = `!${script.name}`
            return (
              <CommandItem
                onSelect={onItemSelect(script)}
                key={script.id}
                value={value}
              >
                {value}
                <div className="ml-2">
                  {Object.keys(script.inputJSONSchema?.properties || {}).map(
                    (name) => {
                      return <span key={name}>{` ${name}`}</span>
                    }
                  )}
                </div>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
