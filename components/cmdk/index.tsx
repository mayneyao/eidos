"use client"

import { ITreeNode } from "@/worker/meta_table/tree"
import { useDebounceFn, useKeyPress } from "ahooks"
import { Bot, Forward, Home, Palette, Settings } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { useSpaceAppStore } from "@/app/[database]/store"
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
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useQueryNode } from "@/hooks/use-query-node"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"

import { ItemIcon } from "../sidebar/item-tree"
import { ActionList } from "./action"
import { useInput } from "./hooks"

export function CommandDialogDemo() {
  // const [open, setOpen] = React.useState(false)
  const { isCmdkOpen, setCmdkOpen } = useAppRuntimeStore()
  const { input, setInput, mode } = useInput()
  const { queryNodes } = useQueryNode()
  const { theme, setTheme } = useTheme()
  const { space } = useCurrentPathInfo()
  const [searchNodes, setSearchNodes] = useState<ITreeNode[]>([])
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

  const goto = (path: string) => () => {
    setCmdkOpen(false)
    router(path)
  }
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
        {Boolean(space && searchNodes.length) && (
          <>
            <CommandGroup heading="Nodes">
              {searchNodes.map((node) => (
                <CommandItem
                  key={node.id}
                  onSelect={goto(`/${space}/${node.id}`)}
                  value={node.name}
                >
                  <ItemIcon type={node.type} className="mr-2 h-4 w-4" />
                  <span>{node.name}</span>
                  <CommandShortcut>Jump to</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
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
