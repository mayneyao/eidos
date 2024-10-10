import * as React from "react"
import { useEventEmitter } from "ahooks"
import { Check, ChevronsUpDown, PlusIcon, RefreshCcwIcon } from "lucide-react"

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
  const { extensions, getAllExtensions, loadExtensionFromZipFileHandler } =
    useExtensions()
  const [value, setValue] = useIndexedDB("kv", "lastOpenedApp", "")
  const event$ = useEventEmitter()

  const handleUploadExtension = async () => {
    const [zipFileHandler] = await (window as any).showOpenFilePicker({
      types: [
        {
          description: "Extension Zip File",
          accept: {
            "application/zip": [".zip"],
          },
        },
      ],
      excludeAcceptAllOption: true,
      multiple: false,
    })
    const appName = await loadExtensionFromZipFileHandler(zipFileHandler)
    setOpen(false)
    await getAllExtensions()
    setValue(appName)
    event$.emit()
  }

  const [open, setOpen] = React.useState(false)
  const currentApp = extensions.find((app) => app.name === value)

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex">
        <Popover open={open} onOpenChange={setOpen}>
          <div className="flex items-center justify-center gap-1">
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                size="xs"
                className="justify-between"
              >
                {value && currentApp ? currentApp?.name : "Select app..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <Button
              size="xs"
              variant="ghost"
              onClick={async () => {
                event$.emit()
              }}
            >
              <RefreshCcwIcon className=" h-4 w-4 opacity-50" />
            </Button>
          </div>

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
                <hr />
                <CommandItem
                  onSelect={handleUploadExtension}
                  className="flex gap-1"
                >
                  <PlusIcon className="h-5 w-5 opacity-60"></PlusIcon>
                  Load app
                </CommandItem>
              </CommandGroup>
              <hr />
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <ExtensionContainer ext={'eidos-extension-importer'} reload$={event$} />
    </div>
  )
}
