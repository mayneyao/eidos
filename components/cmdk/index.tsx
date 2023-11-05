"use client"

import { useEffect } from "react"
import { useDebounceFn, useKeyPress } from "ahooks"
import {
  Bot,
  CalendarDays,
  Clock3Icon,
  FilePlus2Icon,
  Forward,
  Palette,
  Settings,
} from "lucide-react"
import { useTheme } from "next-themes"

import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { getToday } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useQueryNode } from "@/hooks/use-query-node"
import { useSqlite } from "@/hooks/use-sqlite"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useSpaceAppStore } from "@/app/[database]/store"

import { ActionList } from "./action"
import { useCMDKGoto, useCMDKStore, useInput } from "./hooks"
import { NodeCommandItems } from "./nodes"
import { SpaceCommandItems } from "./spaces"
import { SyscallAction } from "./syscall"

export function CommandDialogDemo() {
  const { isCmdkOpen, setCmdkOpen } = useAppRuntimeStore()
  const { input, setInput, mode } = useInput()
  const { queryNodes, fullTextSearch } = useQueryNode()
  const { theme, setTheme } = useTheme()
  const { space } = useCurrentPathInfo()
  const { setSearchNodes } = useCMDKStore()
  useKeyPress(["ctrl.k", "meta.k"], (e) => {
    e.preventDefault()
    setCmdkOpen(!isCmdkOpen)
  })

  const updateSearchNodes = async (qs: string) => {
    if (qs.length > 0) {
      const nodes = await queryNodes(qs)
      const ftsNodes = await fullTextSearch(qs)
      setSearchNodes([...(ftsNodes || []), ...(nodes || [])])
    }
  }
  const { run } = useDebounceFn(updateSearchNodes, { wait: 500 })

  useEffect(() => {
    space && run(input)
  }, [input, run, space])

  const { isAiOpen, setIsAiOpen } = useSpaceAppStore()
  const { lastOpenedDatabase } = useAppStore()

  const { createDoc } = useSqlite()
  const goto = useCMDKGoto()
  const goEveryday = goto(`/${lastOpenedDatabase}/everyday`)

  const today = getToday()
  const goToday = goto(`/${lastOpenedDatabase}/everyday/${today}`)
  const goShare = goto("/share")

  const switchTheme = () => {
    setTheme(theme === "light" ? "dark" : "light")
  }

  const toggleAI = () => {
    setCmdkOpen(false)
    setIsAiOpen(!isAiOpen)
  }

  const createNewDoc = async () => {
    const docId = await createDoc("")
    goto(`/${lastOpenedDatabase}/${docId}`)()
  }

  if (mode === "action") {
    return <ActionList />
  }
  // if (mode === "syscall") {
  //   return <SyscallAction />
  // }

  return (
    <CommandDialog open={isCmdkOpen} onOpenChange={setCmdkOpen}>
      <CommandInput
        placeholder="Type a command or search..."
        value={input}
        onValueChange={setInput}
      />
      <CommandList>
        <CommandEmpty>
          <span>not found "{input}"</span>
        </CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem onSelect={goToday} value="today">
            <Clock3Icon className="mr-2 h-4 w-4" />
            <span>Today</span>
          </CommandItem>
          <CommandItem onSelect={goEveryday} value="everyday">
            <CalendarDays className="mr-2 h-4 w-4" />
            <span>Everyday</span>
          </CommandItem>
          <CommandItem onSelect={createNewDoc} value="new draft doc">
            <FilePlus2Icon className="mr-2 h-4 w-4" />
            <span>New Draft Doc</span>
          </CommandItem>
          <CommandItem onSelect={toggleAI}>
            <Bot className="mr-2 h-4 w-4" />
            <span>AI</span>
          </CommandItem>
          <CommandItem onSelect={goShare}>
            <Forward className="mr-2 h-4 w-4" />
            <span>Share</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <NodeCommandItems />
        <SpaceCommandItems />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={switchTheme}>
            <Palette className="mr-2 h-4 w-4" />
            <span>Switch Theme</span>
            <CommandShortcut>⌘+Shift+L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={goto("/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
