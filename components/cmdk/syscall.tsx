import { useKeyPress } from "ahooks"

import { MsgType } from "@/lib/const"
import { getWorker } from "@/lib/sqlite/worker"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { getUuid } from "@/lib/utils"

import { CommandDialogDemo } from "."
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "../ui/command"
import { useInput } from "./hooks"

export const SyscallAction = () => {
  const { isCmdkOpen, setCmdkOpen } = useAppRuntimeStore()
  const { input, setInput, mode } = useInput()

  useKeyPress("Enter", () => {
    if (input) {
      console.log("executing command: " + input)
      const worker = getWorker()
      worker.postMessage({
        type: MsgType.Syscall,
        data: input.split("!")[1],
        id: getUuid(),
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
        <CommandGroup></CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
