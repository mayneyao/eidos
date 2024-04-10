import { useState } from "react"
import { IAction } from "@/worker/web-worker/meta-table/action"
import { useKeyPress } from "ahooks"

import { ActionExecutor } from "@/lib/action/action"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { uuidv4 } from "@/lib/utils"
import { useActions } from "@/hooks/use-actions"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"

import { CommandDialogDemo } from "."
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command"
import { useInput } from "./hooks"

const useFunctionCall = (space: string) => {
  const { sqlite } = useSqlite(space)
  const addRow = ({ tableName, data }: { tableName: string; data: any }) => {
    const keys = ["_id", ...Object.keys(data)].join(",")
    const values = [uuidv4(), ...Object.values(data)]
    const _values = Array(values.length).fill("?").join(",")
    if (!sqlite) return
    sqlite.sql4mainThread(
      `INSERT INTO ${tableName} (${keys}) VALUES (${_values})`,
      values
    )
  }
  return {
    addRow,
  }
}

export const ActionList = () => {
  const { isCmdkOpen, setCmdkOpen } = useAppRuntimeStore()
  const { input, setInput, mode } = useInput()

  const [currentAction, setCurrentAction] = useState<IAction>()
  const { space } = useCurrentPathInfo()
  const { addRow } = useFunctionCall(space)
  const actions = useActions(space)
  const onItemSelect = (action: IAction) => () => {
    const paramsString = action.params
      .map((param) => {
        return `--${param.name}=`
      })
      .join(" ")
    setInput(`/${action.name} ${paramsString}`)
    setTimeout(() => {
      setCurrentAction(action)
    }, 400)
  }

  useKeyPress("Enter", () => {
    if (currentAction) {
      console.log("executing command: " + input)
      const actionExecutor = new ActionExecutor(currentAction)
      actionExecutor.functionMap = {
        addRow,
      }
      actionExecutor.execute(input)
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
          {actions.map((action) => {
            const value = `/${action.name}`
            return (
              <CommandItem
                onSelect={onItemSelect(action)}
                key={action.id}
                value={value}
              >
                {value}
                <div className="ml-2">
                  {action.params.map((param) => {
                    return <span>{` ${param.name}`}</span>
                  })}
                </div>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
