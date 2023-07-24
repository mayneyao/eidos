"use client"

import { useKeyPress } from "ahooks"
import { Bot, Forward, Home, Palette, Settings } from "lucide-react"
import { useTheme } from "next-themes"
import { useNavigate } from "react-router-dom"

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
import { useSpaceAppStore } from "@/app/[database]/store"

import { ActionList } from "./action"
import { useInput } from "./hooks"

export function CommandDialogDemo() {
  // const [open, setOpen] = React.useState(false)
  const { isCmdkOpen, setCmdkOpen } = useAppRuntimeStore()
  const { input, setInput, mode } = useInput()

  const { theme, setTheme } = useTheme()
  const router = useNavigate()
  useKeyPress("ctrl.k", (e) => {
    e.preventDefault()
    setCmdkOpen(!isCmdkOpen)
  })

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
