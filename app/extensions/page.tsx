import * as React from "react"
import { Check, ChevronsUpDown, PlusIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useIndexedDB } from "@/hooks/use-indexed-db"
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

import { ExtensionContainer } from "./container"
import { useExtensions } from "./hooks/use-extensions"

export function ExtensionPage() {
  const { extensions, uploadExtension, getAllExtensions } = useExtensions()

  const handleUploadExtension = async () => {
    const dirHandle: FileSystemDirectoryHandle = await (
      window as any
    ).showDirectoryPicker()
    await uploadExtension(dirHandle)
    await getAllExtensions()
  }

  console.log("extensions", extensions)
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = useIndexedDB("kv", "lastOpenedApp", "")

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex justify-between">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[300px] justify-between"
            >
              {value
                ? extensions.find((app) => app.name === value)?.name
                : "Select app..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0">
            <Command>
              <CommandInput placeholder="Search app..." />
              <CommandEmpty>No app found.</CommandEmpty>
              <CommandGroup>
                {extensions.map((extension) => (
                  <CommandItem
                    key={extension.name}
                    value={extension.name}
                    onSelect={(currentValue) => {
                      setValue(currentValue)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === extension.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {extension.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <hr />
            </Command>
          </PopoverContent>
        </Popover>
        <div className="flex gap-1">
          <Button variant="ghost" onClick={handleUploadExtension}>
            <PlusIcon></PlusIcon>
          </Button>
        </div>
      </div>
      <ExtensionContainer ext={value} />
    </div>
  )
}
