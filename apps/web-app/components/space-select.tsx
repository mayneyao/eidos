"use client"

import * as React from "react"
import { Check, ChevronsUpDown, FolderOpen, Plus, PlusCircle } from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
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
import type { SpaceInfo } from "@/apps/web-app/hooks/use-current-space"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import { useLastOpened } from "@/apps/web-app/pages/[database]/hook"
import { useAuthOptional } from "@/components/auth-provider"

import { Input } from "./ui/input"
import { Label } from "./ui/label"

interface ISpaceSelectProps {
  spaces: SpaceInfo[]
}

const getRemotePathname = (url?: string) => {
  if (!url) return ""
  try {
    const u = new URL(url)
    return u.pathname
  } catch (e) {
    return url
  }
}

export function SpaceSelect({ spaces }: ISpaceSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const { spaceList, updateSpaceList } = useSpace()

  const { lastOpenedDatabase, setLastOpenedDatabase } = useLastOpened()
  const { space } = useCurrentPathInfo()
  const auth = useAuthOptional()

  const [searchValue, setSearchValue] = React.useState("")
  const [showNewTeamDialog, setShowNewTeamDialog] = React.useState(false)
  const [selectedFolder, setSelectedFolder] = React.useState<string>("")
  const [remoteUrl, setRemoteUrl] = React.useState<string>("")
  const [isSelectingFolder, setIsSelectingFolder] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [globalSyncEnabled, setGlobalSyncEnabled] = React.useState(false)
  const [remoteSpaces, setRemoteSpaces] = React.useState<string[]>([])
  const [loadingRemoteSpaces, setLoadingRemoteSpaces] = React.useState(false)

  // Load global sync config
  React.useEffect(() => {
    const loadGlobalSyncConfig = async () => {
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        try {
          const syncConfig = await window.eidos.config.get("sync")
          setGlobalSyncEnabled(syncConfig?.enabled ?? false)
        } catch {
          setGlobalSyncEnabled(false)
        }
      }
    }
    loadGlobalSyncConfig()
  }, [])

  // Load remote spaces when sync is enabled
  React.useEffect(() => {
    const loadRemoteSpaces = async () => {
      if (globalSyncEnabled && isDesktopMode && typeof window !== "undefined" && window.eidos) {
        setLoadingRemoteSpaces(true)
        try {
          const result = await window.eidos.invoke("list-remote-spaces", "eidos.space")
          if (result.success && result.spaces) {
            setRemoteSpaces(result.spaces)
          } else {
            setRemoteSpaces([])
          }
        } catch (error) {
          console.error("Failed to load remote spaces:", error)
          setRemoteSpaces([])
        } finally {
          setLoadingRemoteSpaces(false)
        }
      } else {
        setRemoteSpaces([])
      }
    }
    loadRemoteSpaces()
  }, [globalSyncEnabled])

  const reset = () => {
    setSelectedFolder("")
    setRemoteUrl("")
  }

  const goto = useGoto()

  const handleSelect = async (currentValue: string) => {
    setLastOpenedDatabase(currentValue)
    setOpen(false)

    if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
      // Desktop mode: use Electron IPC to switch workspace
      try {
        const result = await window.eidos.invoke("switch-space", currentValue)
        if (result.success) {
          // Workspace switched successfully, Electron will automatically reload to new subdomain
        } else {
          console.error("Failed to switch space:", result.error)
        }
      } catch (error) {
        console.error("Error switching space:", error)
      }
    } else {
      // Web mode: use route navigation
      goto(currentValue)
    }
  }

  const handleSelectFolder = async () => {
    if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
      setIsSelectingFolder(true)
      try {
        const folderPath = await window.eidos.selectFolder()
        if (folderPath) {
          setSelectedFolder(folderPath)
        }
      } catch (error) {
        console.error("Error selecting folder:", error)
      } finally {
        setIsSelectingFolder(false)
      }
    }
  }

  const handleCreateDatabase = async () => {
    if (!selectedFolder) return

    setLoading(true)
    try {
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        // Desktop mode: create space with selected folder and optional remote URL
        const result = await window.eidos.invoke(
          "register-space",
          selectedFolder,
          {
            remoteUrl: remoteUrl || undefined,
          }
        )

        if (result.success && result.space) {
          await updateSpaceList()
          await handleSelect(result.space.id as string)
        } else {
          throw new Error(result.error || "Failed to create space")
        }
      } else {
        throw new Error("Space creation is only supported in desktop mode")
      }
    } catch (error) {
      console.error("Error creating space:", error)
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error"
      alert(`Failed to create space: ${errorMessage}`)
    } finally {
      setLoading(false)
      setShowNewTeamDialog(false)
      reset()
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
            className="w-full min-w-[180px] justify-between h-auto py-2"
          >
            {space ? (
              <div className="flex items-center gap-3">
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-80" />
                <div className="flex items-center justify-between w-full overflow-hidden text-left">
                  <span className="truncate shrink-0 font-medium mr-2">
                    {spaces.find((s) => s.id === space)?.name || space}
                  </span>
                  {(() => {
                    const currentSpaceInfo = spaces.find((s) => s.id === space)
                    if (
                      currentSpaceInfo?.sync?.enabled &&
                      currentSpaceInfo.sync.remote
                    ) {
                      return (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {getRemotePathname(currentSpaceInfo.sync.remote)}
                        </span>
                      )
                    }
                    return null
                  })()}
                </div>
              </div>
            ) : (
              t("space.select.selectDatabase")
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full min-w-[180px] p-0">
          <Command>
            <CommandInput
              placeholder={t("space.select.searchDatabase")}
              value={searchValue}
              onValueChange={setSearchValue}
              autoFocus
            />
            <CommandList>
              <CommandEmpty>
                <div>{t("common.noResultsFound")}</div>
              </CommandEmpty>
              <CommandGroup>
                {spaces.map((space) => (
                  <CommandItem
                    key={space.id}
                    value={space.id}
                    onSelect={(currentValue) => {
                      handleSelect(currentValue)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        lastOpenedDatabase === space.id
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <div className="flex items-center justify-between w-full overflow-hidden">
                      <span className="truncate shrink-0 mr-2">
                        {space.name}
                      </span>
                      {space.sync?.enabled && space.sync.remote && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {getRemotePathname(space.sync.remote)}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <DialogTrigger asChild>
                  <CommandItem
                    value="create-new"
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
            {isDesktopMode
              ? t("space.select.createSpaceDescription")
              : t("space.select.selectFolder")}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isDesktopMode ? (
            <div className="space-y-4">
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
                    {isSelectingFolder
                      ? t("space.select.selecting")
                      : t("space.select.browse")}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("space.select.folderDescription")}
                </p>
              </div>
              {globalSyncEnabled && (
                <div className="space-y-2">
                  {auth?.user ? (
                    <>
                      <Label htmlFor="remote-url">
                        {t("space.select.remoteUrl")} ({t("common.optional")})
                      </Label>
                      <div className="relative">
                        <Command className="rounded-lg border shadow-md">
                          <CommandInput
                            placeholder={t("space.select.remoteUrlPlaceholder")}
                            value={remoteUrl}
                            onValueChange={setRemoteUrl}
                            className="h-9"
                          />
                          <CommandList className="max-h-48">
                            <CommandEmpty>
                              {t("common.noResultsFound")}
                            </CommandEmpty>
                            {remoteSpaces.length > 0 && (
                              <CommandGroup heading={t("space.select.existingRemoteSpaces")}>
                                {remoteSpaces.map((space) => {
                                  const spaceName = space.replace(/\/$/, "")
                                  const username = auth!.user!.username
                                  const fullUrl = `https://eidos.space/${username}/${spaceName}`
                                  return (
                                    <CommandItem
                                      key={space}
                                      value={fullUrl}
                                      onSelect={(value) => {
                                        setRemoteUrl(value)
                                      }}
                                      className="cursor-pointer"
                                    >
                                      <FolderOpen className="mr-2 h-4 w-4" />
                                      <span>{spaceName}</span>
                                    </CommandItem>
                                  )
                                })}
                              </CommandGroup>
                            )}
                            <CommandSeparator />
                            <CommandGroup>
                              <CommandItem
                                onSelect={() => {
                                  window.open("https://eidos.space/new", "_blank")
                                }}
                                className="cursor-pointer"
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                <span>{t("space.select.createNewRemoteSpace")}</span>
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </div>

                      {loadingRemoteSpaces && (
                        <div className="text-sm text-muted-foreground">
                          {t("space.select.loadingRemoteSpaces")}
                        </div>
                      )}

                      <p className="text-sm text-muted-foreground">
                        {t("space.select.remoteUrlDescription")}
                      </p>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="remote-url">
                        {t("space.select.remoteUrl")} ({t("common.optional")})
                      </Label>
                      <div className="bg-muted/50 rounded-md p-4 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          {t("space.select.authRequiredForRemoteSpaces")}
                        </p>
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={() => auth?.login()}
                          className="w-full"
                        >
                          {t("settings.account.login", "Login")}
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("space.select.remoteUrlDescription")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t("space.select.webModeNote")}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowNewTeamDialog(false)
              reset()
            }}
            disabled={loading}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleCreateDatabase}
            disabled={loading || !selectedFolder}
          >
            {loading ? t("space.select.creating") : t("common.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
