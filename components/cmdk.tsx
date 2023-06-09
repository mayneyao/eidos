"use client"

import {
  Calculator,
  Calendar,
  Palette,
  Settings,
  Smile
} from "lucide-react"
import * as React from "react"

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
import { useKeyPress } from "ahooks"
import { useTheme } from "next-themes"
import { useRouter } from "next/navigation"

export function CommandDialogDemo() {
  const [open, setOpen] = React.useState(false)

  const { theme, setTheme } = useTheme()
  const router = useRouter()
  useKeyPress('ctrl.k', (e) => {
    e.preventDefault();
    setOpen(!open);
  });

  const goto = (path: string) => () => {
    setOpen(false)
    router.push(path)
  }

  const switchTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <Calendar className="mr-2 h-4 w-4" />
            <span>Calendar</span>
          </CommandItem>
          <CommandItem>
            <Smile className="mr-2 h-4 w-4" />
            <span>Search Emoji</span>
          </CommandItem>
          <CommandItem>
            <Calculator className="mr-2 h-4 w-4" />
            <span>Calculator</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={switchTheme}>
            <Palette className="mr-2 h-4 w-4" />
            <span>Switch Theme</span>
            <CommandShortcut>⌘+Shift+L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={goto('/settings')}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
