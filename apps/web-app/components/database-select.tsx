"use client"

import * as React from "react"
import kebabCase from "lodash/kebabCase"
import { Check, ChevronsUpDown, HomeIcon, PlusCircle } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useSpace, useSpaceFileSystem } from "@/apps/web-app/hooks/use-space"
import { useLastOpened } from "@/apps/web-app/pages/[database]/hook"
import { isDesktopMode } from "@/lib/env"

import { Input } from "./ui/input"
import { Label } from "./ui/label"

interface IDatabaseSelectorProps {
  databases: string[]
}

export function DatabaseSelect({ databases }: IDatabaseSelectorProps) {
  const { t } = useTranslation()
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
  const [enableSync, setEnableSync] = React.useState(false)
  const [volumeId, setVolumeId] = React.useState("")
  const [selectedFolder, setSelectedFolder] = React.useState<string>("")
  const [isSelectingFolder, setIsSelectingFolder] = React.useState(false)

  const reset = () => {
    setDatabaseName("")
    setFile(null)
    setSpaceNameFromFile("")
    setSelectedFolder("")
    setIsSelectingFolder(false)
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

  const handleSelect = async (currentValue: string) => {
    setLastOpenedDatabase(currentValue)
    setOpen(false)
    
    if (isDesktopMode && typeof window !== 'undefined' && window.eidos) {
      // Desktop mode: use Electron IPC to switch workspace
      try {
        const result = await window.eidos.invoke('switch-space', currentValue);
        if (result.success) {
          // Workspace switched successfully, Electron will automatically reload to new subdomain
        } else {
          console.error('Failed to switch space:', result.error);
        }
      } catch (error) {
        console.error('Error switching space:', error);
      }
    } else {
      // Web mode: use route navigation
      goto(currentValue)
    }
  }

  const handleSelectFolder = async () => {
    if (isDesktopMode && typeof window !== 'undefined' && window.eidos) {
      setIsSelectingFolder(true)
      try {
        const folderPath = await window.eidos.selectFolder()
        if (folderPath) {
          setSelectedFolder(folderPath)
          // Auto-generate space name from folder name
          const folderName = folderPath.split('/').pop() || folderPath.split('\\').pop() || 'New Space'
          setDatabaseName(folderName)
        }
      } catch (error) {
        console.error('Error selecting folder:', error)
      } finally {
        setIsSelectingFolder(false)
      }
    }
  }

  const handleCreateDatabase = async () => {
    const databaseName = slugifyDatabaseName
    if (databaseName) {
      setLoading(true)
      try {
        if (file && spaceFileSystem) {
          // Import from file
          await spaceFileSystem.import(databaseName, file)
        } else if (isDesktopMode && selectedFolder) {
          // Desktop mode: create space with selected folder
          const result = await window.eidos.invoke('register-space', selectedFolder, databaseName)
          if (result.success) {
            await updateSpaceList()
            await handleSelect(databaseName)
          } else {
            throw new Error(result.error || 'Failed to create space')
          }
        } else {
          // Web mode: use existing method
          await createSpace(databaseName, enableSync)
          setLastOpenedDatabase(databaseName)
          goto(databaseName)
          updateSpaceList()
        }
      } catch (error) {
        console.error('Error creating space:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        alert(`Failed to create space: ${errorMessage}`)
      } finally {
        setLoading(false)
        setShowNewTeamDialog(false)
        reset()
      }
    }
  }
  return (
    <Dialog open={showNewTeamDialog} onOpenChange={setShowNewTeamDialog}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            role="combobox"
            size="sm"
            aria-expanded={open}
            className="w-full min-w-[180px] justify-between"
          >
            {space ? (
              <div className="flex items-center gap-3">
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-80" />
                <span>{space}</span>
              </div>
            ) : (
              t("space.select.selectDatabase")
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full min-w-[180px] p-0">
          <Command>
            <CommandList>
              <CommandInput
                placeholder={t("space.select.searchDatabase")}
                value={searchValue}
                onValueChange={setSearchValue}
              />
              <CommandEmpty>
                <div>{t("common.noResultsFound")}</div>
              </CommandEmpty>
              <CommandGroup>
                {databases.map((database) => (
                  <CommandItem
                    key={database}
                    onSelect={() => {
                      handleSelect(database)
                      setOpen(false)
                    }}
                  >
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
                    <PlusCircle className="mr-2 h-4 w-4" />
                    <span>{t("space.select.createNew")}</span>
                  </CommandItem>
                </DialogTrigger>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("space.select.createSpace")}</DialogTitle>
          <DialogDescription>
            {t("space.select.createSpaceDescription")}
          </DialogDescription>
        </DialogHeader>
        <div>
          <div className="space-y-4 py-2 pb-4">
            {isDesktopMode && (
              <div className="space-y-2">
                <Label htmlFor="folder-selection">
                  {t("space.select.selectFolder")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="folder-selection"
                    placeholder={t("space.select.folderPlaceholder")}
                    value={selectedFolder}
                    readOnly
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSelectFolder}
                    disabled={isSelectingFolder}
                  >
                    {isSelectingFolder ? t("space.select.selecting") : t("space.select.browse")}
                  </Button>
                </div>
                <div className="text-sm text-muted-foreground">
                  {t("space.select.folderDescription")}
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="database-name">
                {t("space.select.spaceName")}
              </Label>
              <Input
                id="database-name"
                placeholder={t("space.select.spaceNamePlaceholder")}
                value={databaseName}
                autoComplete="off"
                type="text"
                pattern="[\x00-\x7F]+"
                required
                onChange={(e) => {
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
                    {t("space.select.spaceAlreadyExists")}
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="space-y-4 py-2 pb-4">
            <div className="space-y-2">
              <Label htmlFor="importFromFile">
                {t("space.select.importFromFile")}
              </Label>
              <div className="text-sm text-muted-foreground">
                {t("space.select.importFromFileDescription")}
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
                  {t("space.select.overwriteWarning")}
                </span>
              )}
            </div>
          </div>
          {/* <div className="space-y-4 py-2 pb-4">
            <div className="flex items-center justify-between space-x-2">
              <Label htmlFor="enable-sync">{t('space.select.enableSync')}</Label>
              <Switch
                id="enable-sync"
                checked={enableSync}
                onCheckedChange={setEnableSync}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {t('space.select.enableSyncDescription')}
            </p>
            {enableSync && (
              <div className="mt-2">
                <Label htmlFor="volume-id">{t('space.select.volumeId')}</Label>
                <Input
                  id="volume-id"
                  value={volumeId}
                  onChange={(e) => setVolumeId(e.target.value)}
                  placeholder={t('space.select.volumeIdPlaceholder')}
                  className="mt-1"
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('space.select.volumeIdDescription')}
                </p>
              </div>
            )}
          </div> */}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowNewTeamDialog(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            onClick={handleCreateDatabase}
            disabled={loading || (isDesktopMode && !selectedFolder && !file) || !databaseName.trim()}
          >
            {loading ? t("space.select.creating") : t("common.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
