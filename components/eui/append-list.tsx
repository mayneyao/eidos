"use client"

import {
  Check,
  PlusIcon,
  XIcon
} from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface IAppendList {
  list: { label: string; value: string }[]
  options: { label: string; value: string }[]
  onAppend: (value: string) => void
  onRemove?: (value: string) => void
  MoreActions?: React.FunctionComponent<{ value: string }>
}

export function AppendList({
  list,
  options,
  onAppend,
  onRemove,
  MoreActions,
}: IAppendList) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="flex w-full flex-col gap-2">
        {list.map((framework) => (
          <div key={framework.value} className="group flex items-center gap-2">
            <Button
              variant="ghost"
              className="flex w-full justify-start"
              size="sm"
            >
              {framework.label}
            </Button>
            {MoreActions && <MoreActions value={framework.value} />}
            <Button
              variant="ghost"
              size="sm"
              className=" opacity-0 group-hover:opacity-70"
              onClick={onRemove ? () => onRemove(framework.value) : undefined}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full"
            size="sm"
          >
            <PlusIcon className=" opacity-50" />
          </Button>
        </PopoverTrigger>
      </div>

      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search framework..." />
          <CommandList>
            <CommandEmpty>Not found.</CommandEmpty>
            <CommandGroup>
              {options.map((framework) => (
                <CommandItem
                  key={framework.value}
                  value={framework.value}
                  onSelect={(currentValue) => {
                    onAppend(currentValue)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === framework.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {framework.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
