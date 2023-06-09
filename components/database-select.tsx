'use client'


import { Check, ChevronsUpDown } from "lucide-react"
import * as React from "react"

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
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"


interface IDatabaseSelectorProps {
  databases: string[]
  defaultValue?: string
}

export function DatabaseSelect({ databases, defaultValue }: IDatabaseSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(defaultValue ?? "")
  const [searchValue, setSearchValue] = React.useState("")

  const router = useRouter()
  const handleSelect = (currentValue: string) => {
    setValue(currentValue === value ? "" : currentValue)
    setOpen(false)
    router.push(`/${currentValue}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
        >
          {value
            ? databases.find((db) => db === value)
            : "Select Database..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search Database..." value={searchValue} onValueChange={setSearchValue} />
          <CommandEmpty>
            <div className="flex flex-col gap-4 px-4 py-2">
              <div>No database found.</div>
              <Button onClick={() => router.push(`/${searchValue}`)}>
                Create New
              </Button>
            </div>

          </CommandEmpty>
          <CommandGroup>
            {databases.map((database) => (
              <CommandItem
                key={database}
                onSelect={handleSelect}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    value === database ? "opacity-100" : "opacity-0"
                  )}
                />
                {database}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
