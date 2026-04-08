import { useEffect, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  FolderOpen,
  HardDrive,
  Save,
  Search,
  Settings2,
  Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"

import { isDesktopMode } from "@/lib/env"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useEngine } from "@/apps/web-app/hooks/use-engine"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import type { SpaceInfo } from "@/apps/web-app/hooks/use-current-space"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

export function GeneralSettings() {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const { deleteSpace, rebuildIndex, renameSpace, spaceList, updateSpaceList } =
    useSpace()
  const { navigate } = useRouterAdapter()
  const { close } = useEngine()
  const { toast } = useToast()
  const { sqlite } = useSqlite(space)

  const [confirmName, setConfirmName] = useState("")
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [dataFolder, setDataFolder] = useState<string>("")
  const [spaceInfo, setSpaceInfo] = useState<SpaceInfo | null>(null)
  const [spaceName, setSpaceName] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)

  // Node name uniqueness settings
  const [nameUniquenessEnabled, setNameUniquenessEnabled] = useState(false)
  const [isLoadingUniqueness, setIsLoadingUniqueness] = useState(true)
  const [isTogglingUniqueness, setIsTogglingUniqueness] = useState(false)
  const [duplicateCount, setDuplicateCount] = useState(0)

  useEffect(() => {
    const loadData = async () => {
      if (isDesktopMode) {
        const folder = await window.eidos.config.get("dataFolder")
        setDataFolder(folder || "")

        // Load current space info
        try {
          const info = await window.eidos.spaceMgmt.getCurrentSpace()
          if (info) {
            setSpaceInfo(info)
            setSpaceName(info.name)
          }
        } catch (error) {
          console.error("Error loading space info:", error)
        }
      }
    }
    loadData()
  }, [space])

  // Load node name uniqueness settings
  useEffect(() => {
    const loadUniquenessSettings = async () => {
      if (!sqlite) return
      setIsLoadingUniqueness(true)
      try {
        const enabled = await sqlite.tree.isNameUniquenessEnabled()
        setNameUniquenessEnabled(enabled)

        // Check for duplicates if index doesn't exist yet
        if (!enabled) {
          const duplicates = await sqlite.tree.findDuplicateNames()
          setDuplicateCount(duplicates.length)
        }
      } catch (error) {
        console.error("Error loading name uniqueness settings:", error)
      } finally {
        setIsLoadingUniqueness(false)
      }
    }
    loadUniquenessSettings()
  }, [sqlite])

  const handleRename = async () => {
    if (!space || !spaceName.trim()) return

    setIsRenaming(true)
    try {
      await renameSpace(space, spaceName.trim())
      // Success is silent - no toast per toast rules
      // Reload space info to get updated name
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        try {
          const info = await window.eidos.spaceMgmt.getCurrentSpace()
          if (info) {
            setSpaceInfo(info)
            setSpaceName(info.name)
          }
        } catch (error) {
          console.error("Error reloading space info:", error)
        }
      }
    } catch (error) {
      toast({
        title: t("space.settings.renameFailed"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
      // Reset to original name on error
      if (spaceInfo) {
        setSpaceName(spaceInfo.name)
      }
    } finally {
      setIsRenaming(false)
    }
  }

  const handleUnregister = async () => {
    if (confirmName === space) {
      try {
        await deleteSpace(space)
        await updateSpaceList()
        close()

        if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
          // In desktop mode, switch to another space if available
          const updatedSpaces = await window.eidos.spaceMgmt.listSpaces()
          if (updatedSpaces && updatedSpaces.length > 0) {
            // Switch to the first available space
            const result = await window.eidos.spaceMgmt.switchSpace(
              updatedSpaces[0].id
            )
            if (result.success) {
              // Space switched successfully, Electron will automatically reload to new subdomain
              return
            }
          }
          // If no spaces available, navigate to landing page
          navigate("/")
        } else {
          // Web mode: navigate to landing page
          navigate("/")
        }
      } catch (error) {
        console.error("Error unregistering space:", error)
        toast({
          title: t("space.settings.unregisterFailed"),
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        })
      }
    } else {
      alert(t("space.settings.spaceNameMismatch"))
    }
  }

  const handleRebuildIndex = async () => {
    setIsRebuilding(true)
    try {
      await rebuildIndex()
      alert(t("space.settings.indexRebuildSuccess"))
    } catch (error) {
      console.error("Error rebuilding index:", error)
      alert(t("space.settings.indexRebuildFailed"))
    } finally {
      setIsRebuilding(false)
    }
  }

  const handleOpenFolder = async () => {
    if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
      try {
        // Get current workspace info via IPC
        const spaceInfo = await window.eidos.spaceMgmt.getCurrentSpace()
        if (spaceInfo && spaceInfo.path) {
          window.eidos.showInFileManager(spaceInfo.path)
        } else {
          console.error("No space path found")
        }
      } catch (error) {
        console.error("Error getting space info:", error)
      }
    }
  }

  const handleToggleNameUniqueness = async () => {
    if (!sqlite) return
    setIsTogglingUniqueness(true)
    try {
      if (nameUniquenessEnabled) {
        // Disable - drop the index
        await sqlite.tree.disableNameUniqueness()
        setNameUniquenessEnabled(false)
        toast({
          title: t("node.settings.nameUniquenessDisabled"),
        })
      } else {
        // Enable - check for duplicates first
        const duplicates = await sqlite.tree.findDuplicateNames()
        if (duplicates.length > 0) {
          toast({
            title: t("node.settings.duplicateNodesFound", {
              count: duplicates.length,
            }),
            description: t("node.settings.duplicateNodesWillBeRenamed"),
          })
        }

        const result = await sqlite.tree.enableNameUniqueness()
        if (result.success) {
          setNameUniquenessEnabled(true)
          setDuplicateCount(0)
          if (result.renamed && result.renamed.length > 0) {
            toast({
              title: t("node.settings.duplicateNodesRenamed", {
                count: result.renamed.length,
              }),
            })
          } else {
            toast({
              title: t("node.settings.nameUniquenessEnabled"),
            })
          }
        } else {
          toast({
            title: "Failed to enable name uniqueness",
            description: result.error,
            variant: "destructive",
          })
        }
      }
    } catch (error) {
      console.error("Error toggling name uniqueness:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
    } finally {
      setIsTogglingUniqueness(false)
    }
  }

  return (
    <div className="space-y-0">
      <div className="py-4 flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-medium">{t("space.settings.spaceInfo")}</h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-4">
              {t("space.settings.spaceDescription")}
            </p>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spaceId">{t("space.settings.spaceId")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="spaceId"
                    value={spaceInfo?.id || space || ""}
                    readOnly
                    className="flex-1 bg-muted/50 cursor-default border-dashed"
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground border border-input"
                    onClick={() => {
                      const id = spaceInfo?.id || space || ""
                      navigator.clipboard.writeText(id)
                      toast({
                        title: t("common.copied"),
                      })
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("space.settings.spaceIdDescription")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="spaceName">
                  {t("space.settings.spaceName")}
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="spaceName"
                    value={spaceName}
                    onChange={(e) => setSpaceName(e.target.value)}
                    disabled={isRenaming || !spaceInfo}
                    placeholder={t("space.settings.spaceNamePlaceholder")}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleRename}
                    disabled={
                      isRenaming ||
                      !spaceInfo ||
                      spaceName.trim() === spaceInfo?.name ||
                      !spaceName.trim()
                    }
                    size="xs"
                    className="shrink-0"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {isRenaming
                      ? t("space.settings.saving")
                      : t("space.settings.save")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("space.settings.spaceNameDescription")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="py-4 flex items-center gap-2">
        <Database className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-medium">
          {t("space.settings.dataManagement")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-4">
              {t("space.settings.dataDescription")}
            </p>
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-0.5 flex-[5] min-w-[240px]">
                  <Label>{t("space.settings.rebuildSearchIndex")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.rebuildSearchIndexDescription")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRebuildIndex}
                  disabled={isRebuilding}
                  className="shrink-0"
                >
                  <Search className="h-4 w-4 mr-2" />
                  {isRebuilding
                    ? t("space.settings.rebuilding")
                    : t("common.rebuild", "Rebuild")}
                </Button>
              </div>

              {isDesktopMode && (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-0.5 flex-[5] min-w-[240px]">
                    <Label>{t("space.settings.openDataFolder")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("space.settings.openDataFolderDescription")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenFolder}
                    className="shrink-0"
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    {t("space.settings.openFolder", "Open Folder")}
                  </Button>
                </div>
              )}

              {/* Node Name Uniqueness Setting */}
              <div className="py-6 border-t border-border">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 flex-[5] min-w-[240px]">
                    <Label>{t("node.settings.nameUniqueness")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("node.settings.nameUniquenessDescription")}
                    </p>

                    {!isLoadingUniqueness &&
                      !nameUniquenessEnabled &&
                      duplicateCount > 0 && (
                        <div className="mt-3">
                          <Alert className="bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/50 dark:border-amber-900/30 py-3">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                            <AlertTitle className="text-sm font-medium text-amber-800 dark:text-amber-400">
                              {t("node.settings.duplicateNodesFound", {
                                count: duplicateCount,
                              })}
                            </AlertTitle>
                            <AlertDescription className="text-xs text-amber-700/80 dark:text-amber-500/70">
                              {t("node.settings.duplicateNodesWillBeRenamed")}
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}
                  </div>

                  <div className="shrink-0">
                    {isLoadingUniqueness ? (
                      <div className="h-8 w-20 bg-muted animate-pulse rounded-md" />
                    ) : nameUniquenessEnabled ? (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {t("node.settings.nameUniquenessEnabled")}
                        </span>
                      </div>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isTogglingUniqueness}
                            className="shrink-0"
                          >
                            {t("common.enable", "Enable")}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("node.settings.nameUniqueness")}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="space-y-2">
                              <p>
                                {t("node.settings.nameUniquenessEnableConfirm")}
                              </p>
                              {duplicateCount > 0 && (
                                <p className="text-amber-600 dark:text-amber-400">
                                  {t("node.settings.duplicateNodesFound", {
                                    count: duplicateCount,
                                  })}{" "}
                                  -
                                  {t(
                                    "node.settings.duplicateNodesWillBeRenamed"
                                  )}
                                </p>
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>
                              {t("common.cancel")}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleToggleNameUniqueness}
                            >
                              {t("common.continue")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="py-4 flex items-center gap-2">
        <Trash2 className="h-5 w-5 text-destructive" />
        <h3 className="text-lg font-medium text-destructive">
          {t("space.settings.dangerZone")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-4">
              {t("space.settings.dangerDescription")}
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-destructive">
                    {t("space.settings.unregisterSpace")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.unregisterSpaceDescription")}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-fit">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      {t("space.settings.unregisterSpace")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        {t("common.areYouAbsolutelySure")}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("space.settings.unregisterSpaceWarning", {
                          spaceId: space,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                      id="confirmName"
                      type="text"
                      placeholder={space || ""}
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                    />
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t("common.cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleUnregister}
                        disabled={confirmName !== space}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("common.delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
