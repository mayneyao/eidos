"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useKeyPress } from "ahooks"
import { Bot, Forward, Home, Palette, Settings } from "lucide-react"
import { useTheme } from "next-themes"

import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
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
import { useDatabaseAppStore } from "@/app/[database]/store"

export function CommandDialogDemo() {
  // const [open, setOpen] = React.useState(false)
  const { isCmdkOpen, setCmdkOpen } = useAppRuntimeStore()

  const { theme, setTheme } = useTheme()
  const router = useRouter()
  useKeyPress("ctrl.k", (e) => {
    e.preventDefault()
    setCmdkOpen(!isCmdkOpen)
  })

  const { isAiOpen, setIsAiOpen } = useDatabaseAppStore()
  const { lastOpenedDatabase } = useAppStore()

  const goto = (path: string) => () => {
    setCmdkOpen(false)
    router.push(path)
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

  return (
    <CommandDialog open={isCmdkOpen} onOpenChange={setCmdkOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
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
