"use client"

import { useEffect } from "react"
import { useDebounceFn, useKeyPress } from "ahooks"
import { Bot, Forward, Home, Palette, Settings } from "lucide-react"
import { useTheme } from "next-themes"
import { useNavigate } from "react-router-dom"

import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useQueryNode } from "@/hooks/use-query-node"
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

export function CommandDialogDemo() {
  const { isCmdkOpen, setCmdkOpen } = useAppRuntimeStore()
  const { input, setInput, mode } = useInput()
  const { queryNodes } = useQueryNode()
  const { theme, setTheme } = useTheme()
  const { space } = useCurrentPathInfo()
  const { setSearchNodes } = useCMDKStore()
  const router = useNavigate()
  useKeyPress("ctrl.k", (e) => {
    e.preventDefault()
    setCmdkOpen(!isCmdkOpen)
  })

  const updateSearchNodes = async (qs: string) => {
    if (qs.length > 0) {
      const nodes = await queryNodes(qs)
      setSearchNodes(nodes ?? [])
    }
  }
  const { run } = useDebounceFn(updateSearchNodes, { wait: 500 })

  useEffect(() => {
    space && run(input)
  }, [input, run, space])

  const { isAiOpen, setIsAiOpen } = useSpaceAppStore()
  const { lastOpenedDatabase } = useAppStore()

  const goto = useCMDKGoto()
  const goHome = goto(`/${lastOpenedDatabase}`)

  const goShare = goto("/share")

  const switchTheme = () => {
    setTheme(theme === "light" ? "dark" : "light")
  }

  const toggleAI = () => {
    setCmdkOpen(false)
    setIsAiOpen(!isAiOpen)
  }

  if (mode === "action") {
    return <ActionList />
  }

  return (
    <CommandDialog open={isCmdkOpen} onOpenChange={setCmdkOpen}>
      <CommandInput
        placeholder="Type a command or search..."
        value={input}
        onValueChange={setInput}
      />
      <CommandList>
        <CommandEmpty>
          <span className="text-gray-400">No results</span>
        </CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem onSelect={toggleAI}>
            <Bot className="mr-2 h-4 w-4" />
            <span>AI</span>
          </CommandItem>
          <CommandItem onSelect={goHome}>
            <Home className="mr-2 h-4 w-4" />
            <span>Home</span>
          </CommandItem>
          <CommandItem onSelect={goShare}>
            <Forward className="mr-2 h-4 w-4" />
            <span>Share</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <SpaceCommandItems />
        <NodeCommandItems />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={switchTheme}>
            <Palette className="mr-2 h-4 w-4" />
            <span>Switch Theme</span>
            <CommandShortcut>⌘+Shift+L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={goto("/settings")}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
