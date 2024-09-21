"use client"

import * as React from "react"
import { kebabCase } from "lodash"
import { Check, ChevronsUpDown, PlusCircle } from "lucide-react"

import { cn } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useGoto } from "@/hooks/use-goto"
import { useSpace, useSpaceFileSystem } from "@/hooks/use-space"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useLastOpened } from "@/apps/web-app/[database]/hook"

import { Input } from "./ui/input"
import { Label } from "./ui/label"

interface IDatabaseSelectorProps {
  databases: string[]
}

export function DatabaseSelect({ databases }: IDatabaseSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [file, setFile] = React.useState<File | null>(null)
  const { spaceList } = useSpace()
  const { spaceFileSystem } = useSpaceFileSystem()

  const { lastOpenedDatabase, setLastOpenedDatabase } = useLastOpened()
  const { space } = useCurrentPathInfo()

  const [searchValue, setSearchValue] = React.useState("")
  const [showNewTeamDialog, setShowNewTeamDialog] = React.useState(false)
  const [databaseName, setDatabaseName] = React.useState("")
  const [spaceNameFromFile, setSpaceNameFromFile] = React.useState("")

  const reset = () => {
    setDatabaseName("")
    setFile(null)
    setSpaceNameFromFile("")
  }
  const slugifyDatabaseName = React.useMemo(() => {
    if (/^[a-zA-Z0-9-]+$/.test(databaseName)) {
      return databaseName
    }
    return kebabCase(databaseName)
  }, [databaseName])

  const isExistingSpace = spaceList.includes(databaseName.trim())

  const handleFileChange = (e: any) => {
    const importFile = e.target.files[0]
    importFile && setFile(importFile)
    if (importFile.name.startsWith("eidos-export-")) {
      // eidos-export-<space-name>.zip -> <space-name>
      // eidos-export-<space-name> (1).zip -> <space-name>
      const spaceName = importFile.name
        .replace("eidos-export-", "")
        .replace(".zip", "")
        .replace(/\(\d+\)/, "")
        .trim()
      setSpaceNameFromFile(spaceName)
      setDatabaseName(spaceName)
    }
  }

  const regex = new RegExp(
    `^eidos-export-${databaseName}(\\s*\\(\\d+\\))?\\.zip$`
  )
  const isOverwrite =
    spaceList.includes(databaseName) && file && regex.test(file.name)

  const goto = useGoto()
  const { createSpace } = useSpace()
  const [loading, setLoading] = React.useState(false)
  const { updateSpaceList } = useSpace()

  const handleSelect = (currentValue: string) => {
    setLastOpenedDatabase(currentValue)
    setOpen(false)
    goto(currentValue)
  }

  const handleCreateDatabase = async () => {
    const databaseName = slugifyDatabaseName
    if (databaseName) {
      setLoading(true)
      if (file) {
        await spaceFileSystem.import(databaseName, file)
      } else {
        await createSpace(databaseName)
      }
      setLoading(false)
      setShowNewTeamDialog(false)
      setLastOpenedDatabase(databaseName)
      goto(databaseName)
      updateSpaceList()
    }
    reset()
  }
  return (
    <Dialog open={showNewTeamDialog} onOpenChange={setShowNewTeamDialog}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            size="xs"
            aria-expanded={open}
            className="w-full min-w-[180px] justify-between"
          >
            {space ? <div>{space}</div> : "Select Database..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full min-w-[180px] p-0">
          <Command>
            <CommandList>
              <CommandInput
                placeholder="Search Database..."
                value={searchValue}
                onValueChange={setSearchValue}
              />
              <CommandEmpty>
                <div>No database found.</div>
              </CommandEmpty>
              <CommandGroup>
                {databases.map((database) => (
                  <CommandItem key={database} onSelect={handleSelect}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        lastOpenedDatabase === database
                          ? "opacity-100"
                          : "opacity-0"
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
                  <CommandItem
                    onSelect={() => {
                      setOpen(false)
                      setShowNewTeamDialog(true)
                    }}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />{" "}
                    <span>Create New</span>
                  </CommandItem>
                </DialogTrigger>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Space</DialogTitle>
          <DialogDescription>
            Add a new space to manage data for you
          </DialogDescription>
        </DialogHeader>
        <div>
          <div className="space-y-4 py-2 pb-4">
            <div className="space-y-2">
              <Label htmlFor="database-name">Space name</Label>
              <Input
                id="database-name"
                placeholder="e.g. personal"
                value={databaseName}
                autoComplete="off"
                type="text"
                pattern="[\x00-\x7F]+"
                required
                onChange={(e) => {
                  // disable non-ascii characters, sqlite-wasm handle non-ascii characters incorrectly
                  if (e.target.value) {
                    e.target.validity.valid && setDatabaseName(e.target.value)
                  } else {
                    setDatabaseName(e.target.value)
                  }
                }}
              />
              <span className="px-3 text-sm">{slugifyDatabaseName}</span>
              <span>
                {isExistingSpace && !isOverwrite && (
                  <span className="text-sm text-red-500">
                    this space already exists, choose another name
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="space-y-4 py-2 pb-4">
            <div className="space-y-2">
              <Label htmlFor="importFromFile">Import from file</Label>
              <div className="text-sm text-muted-foreground">
                if you export space as a zip file, you can import it here
              </div>
              <Input
                type="file"
                id="importFromFile"
                onChange={handleFileChange}
                className="max-w-max"
                accept=".zip"
              />
              {isOverwrite && (
                <span className="text-sm text-red-500">
                  it seems you are trying to overwrite an existing space. please
                  be careful, this will overwrite data in the existing space.
                </span>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewTeamDialog(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleCreateDatabase}
            disabled={loading}
          >
            {loading ? "Creating" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
