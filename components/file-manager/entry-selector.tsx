"use client"

import * as React from "react"
import { CaretSortIcon } from "@radix-ui/react-icons"
import { FolderPlusIcon } from "lucide-react"

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

import { useCurrentRootDir } from "./hooks/use-current-root-dir"
import { useExternalFolder } from "./hooks/use-external-folder"
import { useSpaceDir } from "./hooks/use-space-dir"

export function EntrySelector() {
  const { setRootDir, rootDir } = useCurrentRootDir()
  const [open, setOpen] = React.useState(false)
  const { externalFolders, handleSelectExternalFolder } = useExternalFolder()
  const spaceRootDir = useSpaceDir()
  const [isCurrentSpaceDir, setIsCurrentSpaceDir] = React.useState(false)
  // React.useEffect(() => {
  //   rootDir && spaceRootDir?.isSameEntry(rootDir).then(setIsCurrentSpaceDir)
  // }, [rootDir, spaceRootDir])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          size="xs"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {isCurrentSpaceDir ? "Current Space" : rootDir?.name}
          <CaretSortIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search folder..." className="h-9" />
          <CommandEmpty>No folder found.</CommandEmpty>
          <CommandGroup heading="Default">
            <CommandItem
              key={"Current Space"}
              value={"Current Space"}
              onSelect={(currentValue) => {
                setRootDir(spaceRootDir)
                setOpen(false)
              }}
            >
              Current Space
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="External Folders" className="border-t">
            {externalFolders.map((dirHandler) => (
              <CommandItem
                key={dirHandler.name}
                value={dirHandler.name}
                onSelect={(currentValue) => {
                  setRootDir(dirHandler)
                  setOpen(false)
                }}
              >
                {dirHandler.name}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandItem
            onSelect={handleSelectExternalFolder}
            className="flex gap-2 rounded-none border-t px-3"
          >
            <FolderPlusIcon className="h-5 w-5 opacity-60" />
            Mount New Folder
          </CommandItem>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
