import { useState } from "react"
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
  const onItemSelect = (action: IScript) => () => {
    const paramsString = Object.keys(action.inputJSONSchema?.properties || {})
      .map((param) => {
        return `--${param}=`
      })
      .join(" ")
    setInput(`!${action.name} ${paramsString}`)
    setTimeout(() => {
      setCurrentAction(action)
    }, 400)
  }

  useKeyPress("Enter", () => {
    if (currentAction) {
      console.log("executing command: " + input)
      const realParams: Record<string, any> = ActionExecutor.getParams(input)
      callFunction({
        input: realParams,
        context: {
          tables: currentAction.fieldsMap,
          env: {},
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
        onValueChange={setInput}
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
