"use client"

import * as React from "react"
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons"

import { cn } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useFileSystem } from "@/hooks/use-files"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { useExternalFolder } from "./hooks"

export function EntrySelector() {
  const [rootDir, setRootDir] = React.useState<FileSystemDirectoryHandle>()
  const { currentPath } = useFileSystem(rootDir)
  const [open, setOpen] = React.useState(false)
  const { space } = useCurrentPathInfo()
  const [value, setValue] = React.useState(
    `/spaces/${space}/files/` + currentPath.join("/")
  )
  const { externalFolders, handleSelectExternalFolder } = useExternalFolder()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          size="xs"
          aria-expanded={open}
          className="w-[200px] justify-between"
        >
          {value}
          <CaretSortIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search folder..." className="h-9" />
          <CommandEmpty>No folder found.</CommandEmpty>
          <CommandGroup heading="Default">
            <CommandItem> Current Space</CommandItem>
          </CommandGroup>
          <CommandGroup heading="External Folders">
            {externalFolders.map((dirHandler) => (
              <CommandItem
                key={dirHandler.name}
                value={dirHandler.name}
                onSelect={(currentValue) => {
                  setValue(currentValue === value ? "" : currentValue)
                  setRootDir(dirHandler)
                  setOpen(false)
                }}
              >
                {dirHandler.name}
                <CheckIcon
                  className={cn(
                    "ml-auto h-4 w-4",
                    value === dirHandler.name ? "opacity-100" : "opacity-0"
                  )}
                />
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandItem onSelect={handleSelectExternalFolder}>
            Mount Folder
          </CommandItem>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
