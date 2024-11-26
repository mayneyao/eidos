import { useState } from "react"
import * as Icons from "lucide-react"
import { LucideIcon } from "lucide-react"

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

interface IconSelectorProps {
  value?: string
  onChange?: (value: string) => void
}

const iconNames = Object.keys(Icons).filter(
  (key) => key !== "createLucideIcon" && key !== "default"
)

export function IconSelector({ value, onChange }: IconSelectorProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const filteredIcons = iconNames.filter((name) =>
    name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const SelectedIcon = value
    ? (Icons[value as keyof typeof Icons] as LucideIcon)
    : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {value ? (
            <div className="flex items-center gap-2">
              {SelectedIcon && <SelectedIcon className="h-4 w-4" />}
              <span>{value}</span>
            </div>
          ) : (
            "Select icon..."
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput
            placeholder="Search icon..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandEmpty>No icon found.</CommandEmpty>
          <CommandGroup className="max-h-[300px] overflow-y-auto">
            {filteredIcons.map((iconName) => {
              const Icon = Icons[iconName as keyof typeof Icons] as LucideIcon
              return (
                <CommandItem
                  key={iconName}
                  value={iconName}
                  onSelect={() => {
                    onChange?.(iconName)
                    setOpen(false)
                  }}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  <span>{iconName}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
