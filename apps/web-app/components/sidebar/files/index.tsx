"use client"

import { useMemo, useState } from "react"
import { CaretSortIcon } from "@radix-ui/react-icons"
import { useTranslation } from "react-i18next"

import { useMounts } from "@/apps/web-app/hooks/use-mounts"

import FileTree from "../../file-tree"
import { Button } from "../../ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "../../ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../ui/popover"

export const FilesSidebar = () => {
  const { t } = useTranslation()
  const [selectedDir, setSelectedDir] = useState<string>("~/")
  const [open, setOpen] = useState(false)
  const { mounts } = useMounts()

  const getDisplayName = (path: string) => {
    if (path === "~/") {
      return t("sidebar.files.projectRoot", "Project Root")
    }
    if (path.startsWith("@/")) {
      const mountName = path.replace("@/", "").replace(/\/$/, "")
      return `@${mountName}`
    }
    return path
  }

  const directoryOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [
      { value: "~/", label: t("sidebar.files.projectRoot", "Project Root") },
    ]

    mounts.forEach((mount) => {
      options.push({
        value: `@/${mount.name}/`,
        label: `@${mount.name}`,
      })
    })

    return options
  }, [mounts, t])

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-sidebar-border p-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              size="sm"
              aria-expanded={open}
              className="w-full justify-between"
            >
              {getDisplayName(selectedDir)}
              <CaretSortIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[200px] p-0" align="start">
            <Command>
              <CommandInput
                placeholder={t("sidebar.files.searchDirectory", "Search directory...")}
                className="h-9"
              />
              <CommandEmpty>
                {t("sidebar.files.noDirectoryFound", "No directory found")}
              </CommandEmpty>
              <CommandGroup>
                {directoryOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      setSelectedDir(option.value)
                      setOpen(false)
                    }}
                  >
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex-1 min-h-0">
        <FileTree rootDir={selectedDir} />
      </div>
    </div>
  )
}

