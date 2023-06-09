'use client'


import * as React from "react"
import { Check, ChevronsUpDown, PlusCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Label } from "./ui/label"
import { Input } from "./ui/input"

interface IDatabaseSelectorProps {
  databases: string[]
  defaultValue?: string
}

export function DatabaseSelect({ databases, defaultValue }: IDatabaseSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(defaultValue ?? "")
  const [searchValue, setSearchValue] = React.useState("")
  const [showNewTeamDialog, setShowNewTeamDialog] = React.useState(false)
  const [databaseName, setDatabaseName] = React.useState("")

  const router = useRouter()
  const handleSelect = (currentValue: string) => {
    setValue(currentValue === value ? "" : currentValue)
    setOpen(false)
    router.push(`/${currentValue}`)
  }

  const handleCreateDatabase = () => {
    if (databaseName) {
      setShowNewTeamDialog(false)
      router.push(`/${databaseName}`)
    }
  }

  return (
    <Dialog open={showNewTeamDialog} onOpenChange={setShowNewTeamDialog}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[180px] justify-between"
          >
            {value
              ? databases.find((db) => db === value)
              : "Select Database..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[180px] p-0">
          <Command>
            <CommandList>
              <CommandInput placeholder="Search Database..." value={searchValue} onValueChange={setSearchValue} />
              <CommandEmpty>
                <div>No database found.</div>

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
            </CommandList>
            <CommandSeparator />
            <CommandList>
              <CommandGroup>
                <DialogTrigger asChild>
                  <CommandItem onSelect={() => {
                    setOpen(false)
                    setShowNewTeamDialog(true)
                  }}>
                    <PlusCircle className="mr-2 h-5 w-5" /> Create New
                  </CommandItem>
                </DialogTrigger>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create database</DialogTitle>
          <DialogDescription>
            Add a new database to manage data for you
          </DialogDescription>
        </DialogHeader>
        <div>
          <div className="space-y-4 py-2 pb-4">
            <div className="space-y-2">
              <Label htmlFor="name">Database name</Label>
              <Input id="name" placeholder="e.g. mydb" value={databaseName} onChange={(e) => setDatabaseName(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline">
            Cancel
          </Button>
          <Button type="submit" onClick={handleCreateDatabase}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
