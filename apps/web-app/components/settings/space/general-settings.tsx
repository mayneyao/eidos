import { useEffect, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FolderOpen,
  GitBranch,
  HardDrive,
  History,
  Save,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { flushPendingFileWrites } from "@/apps/web-app/components/file-space/pending-writes"

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
import { useSpace } from "@/apps/web-app/hooks/use-space"
import type { SpaceInfo } from "@/apps/web-app/hooks/use-current-space"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

import { SettingsRow, SettingsRows, SettingsSection } from "../settings-surface"

function getExportDatabaseFileName(spaceName: string) {
  const safeName =
    spaceName
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-") || "space"
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  return `${safeName}-${timestamp}.sqlite3`
}

function joinLocalPath(dir: string, fileName: string) {
  if (!dir) return fileName
  const separator = dir.includes("\\") ? "\\" : "/"
  return `${dir.replace(/[\\/]+$/, "")}${separator}${fileName}`
}

export function GeneralSettings() {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const {
    deleteSpace,
    rebuildIndex: rebuildLegacyIndex,
    renameSpace,
    spaceList,
    updateSpaceList,
  } = useSpace()
  const { currentSpace } = useCurrentSpace()
  const isFileSpace = currentSpace?.mode === "file"
  const { navigate } = useRouterAdapter()
  const { toast } = useToast()
  const { sqlite } = useSqlite(space)

  const [confirmName, setConfirmName] = useState("")
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [dataFolder, setDataFolder] = useState<string>("")
  const [spaceInfo, setSpaceInfo] = useState<SpaceInfo | null>(null)
  const [spaceName, setSpaceName] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)
  const [isExportingDatabase, setIsExportingDatabase] = useState(false)
  const [isDisablingRemoteSync, setIsDisablingRemoteSync] = useState(false)
  const [isTurningOffHistory, setIsTurningOffHistory] = useState(false)
  const [turnOffHistoryConfirmText, setTurnOffHistoryConfirmText] = useState("")

  // Node name uniqueness settings
  const [nameUniquenessEnabled, setNameUniquenessEnabled] = useState(false)
  const [isLoadingUniqueness, setIsLoadingUniqueness] = useState(true)
  const [isTogglingUniqueness, setIsTogglingUniqueness] = useState(false)
  const [duplicateCount, setDuplicateCount] = useState(0)
  const isVersioningEnabled = Boolean(
    spaceInfo?.versioning?.enabled || spaceInfo?.sync?.enabled
  )
  const isRemoteSyncEnabled = Boolean(spaceInfo?.sync?.enabled)
  const turnOffHistoryConfirmTarget = space || ""

  const reloadCurrentSpaceInfo = async () => {
    if (!isDesktopMode || typeof window === "undefined" || !window.eidos) {
      return
    }

    const info = await window.eidos.spaceMgmt.getCurrentSpace()
    if (info) {
      setSpaceInfo(info)
      setSpaceName(info.name)
    }
  }

  const reloadWorkspace = () => {
    window.setTimeout(() => window.location.reload(), 150)
  }

  useEffect(() => {
    const loadData = async () => {
      if (isDesktopMode) {
        if (!isFileSpace) {
          const folder = await window.eidos.config.get("dataFolder")
          setDataFolder(folder || "")
        }

        // Load current space info
        try {
          await reloadCurrentSpaceInfo()
        } catch (error) {
          console.error("Error loading space info:", error)
        }
      }
    }
    loadData()
  }, [isFileSpace, space])

  // Load node name uniqueness settings
  useEffect(() => {
    const loadUniquenessSettings = async () => {
      if (isFileSpace || !sqlite) {
        setIsLoadingUniqueness(false)
        return
      }
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
  }, [isFileSpace, sqlite])

  const handleRename = async () => {
    if (!space || !spaceName.trim()) return

    setIsRenaming(true)
    try {
      await renameSpace(space, spaceName.trim())
      // Success is silent - no toast per toast rules
      // Reload space info to get updated name
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        try {
          await reloadCurrentSpaceInfo()
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
        if (!(await flushPendingFileWrites())) {
          throw new Error(
            "Eidos could not save the current file. Resolve the error before unregistering this Space."
          )
        }
        const removal = await deleteSpace(space)

        if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
          if (removal.nextSpaceId) {
            try {
              const result = await window.eidos.spaceMgmt.switchSpace(
                removal.nextSpaceId
              )
              if (result.success) return
            } catch (switchError) {
              console.error(
                "Unable to open the next Space after unregistering:",
                switchError
              )
            }
          }
          const landingUrl = new URL("/", window.location.href)
          landingUrl.hostname = "localhost"
          window.location.replace(landingUrl.toString())
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
      await rebuildLegacyIndex()
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

  const handleExportDatabase = async () => {
    if (
      isFileSpace ||
      !isDesktopMode ||
      !space ||
      typeof window === "undefined"
    )
      return

    setIsExportingDatabase(true)
    try {
      const fileName = getExportDatabaseFileName(spaceInfo?.name || space)
      const result = await window.eidos.showSaveDialog({
        defaultPath: joinLocalPath(dataFolder, fileName),
        filters: [
          {
            name: "SQLite Database",
            extensions: ["sqlite3", "sqlite", "db"],
          },
        ],
      })

      if (result.canceled || !result.filePath) {
        return
      }

      const exportResult = await window.eidos.space.exportToSqlite({
        spaceName: spaceInfo?.id || space,
        outputPath: result.filePath,
      })

      if (!exportResult?.success) {
        throw new Error(exportResult?.error || "Failed to export database")
      }

      toast({
        title: t("space.settings.exportDatabaseSuccess"),
        description: exportResult.path || result.filePath,
      })
    } catch (error) {
      console.error("Error exporting database:", error)
      toast({
        title: t("space.settings.exportDatabaseFailed"),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
    } finally {
      setIsExportingDatabase(false)
    }
  }

  const handleDisableRemoteSync = async () => {
    if (
      isFileSpace ||
      !isDesktopMode ||
      !space ||
      typeof window === "undefined"
    )
      return

    setIsDisablingRemoteSync(true)
    try {
      const result = await window.eidos.spaceMgmt.toggleSpaceSync(space, false)
      if (!result?.success) {
        throw new Error(result?.error || "Failed to disable remote sync")
      }

      await updateSpaceList()
      await reloadCurrentSpaceInfo()
      toast({
        title: t("space.settings.remoteSyncDisabled", "Remote sync disabled"),
        description: t(
          "space.settings.reloadingWorkspace",
          "Reloading workspace..."
        ),
      })
      reloadWorkspace()
    } catch (error) {
      console.error("Error disabling remote sync:", error)
      toast({
        title: t(
          "space.settings.disableRemoteSyncFailed",
          "Failed to disable remote sync"
        ),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
    } finally {
      setIsDisablingRemoteSync(false)
    }
  }

  const handleTurnOffLocalHistory = async () => {
    if (
      isFileSpace ||
      !isDesktopMode ||
      !space ||
      typeof window === "undefined"
    )
      return
    if (turnOffHistoryConfirmText !== space) return

    setIsTurningOffHistory(true)
    try {
      const result = await window.eidos.spaceMgmt.toggleLocalVersioning(
        space,
        false
      )
      if (!result?.success) {
        throw new Error(result?.error || "Failed to turn off local history")
      }

      await updateSpaceList()
      await reloadCurrentSpaceInfo()
      toast({
        title: t(
          "space.settings.localHistoryTurnedOff",
          "Local history turned off"
        ),
        description: t(
          "space.settings.reloadingWorkspace",
          "Reloading workspace..."
        ),
      })
      reloadWorkspace()
      setTurnOffHistoryConfirmText("")
    } catch (error) {
      console.error("Error turning off local history:", error)
      toast({
        title: t(
          "space.settings.turnOffLocalHistoryFailed",
          "Failed to turn off local history"
        ),
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      })
    } finally {
      setIsTurningOffHistory(false)
    }
  }

  const handleToggleNameUniqueness = async () => {
    if (isFileSpace || !sqlite) return
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
    <div className="space-y-8">
      <SettingsSection
        title={t("space.settings.spaceInfo")}
        description={t("space.settings.spaceDescription")}
      >
        <div className="py-5 space-y-4">
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
            <Label htmlFor="spaceName">{t("space.settings.spaceName")}</Label>
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
      </SettingsSection>

      <SettingsSection
        title={t("space.settings.dataManagement")}
        description={
          isFileSpace
            ? "Files remain the source of truth. Open the Space folder to inspect or edit them with other tools."
            : t("space.settings.dataDescription")
        }
      >
        <SettingsRows>
          {!isFileSpace && (
            <SettingsRow
              title={t("space.settings.rebuildSearchIndex")}
              description={t("space.settings.rebuildSearchIndexDescription")}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleRebuildIndex}
                disabled={isRebuilding}
                className="shrink-0"
              >
                {isRebuilding
                  ? t("space.settings.rebuilding")
                  : t("common.rebuild", "Rebuild")}
              </Button>
            </SettingsRow>
          )}

          {isDesktopMode && (
            <SettingsRow
              title={t("space.settings.openDataFolder")}
              description={t("space.settings.openDataFolderDescription")}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenFolder}
                className="shrink-0"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                {t("space.settings.openFolder", "Open Folder")}
              </Button>
            </SettingsRow>
          )}

          {isDesktopMode && !isFileSpace && isVersioningEnabled && (
            <SettingsRow
              title={t("space.settings.exportSqliteSnapshot")}
              description={t("space.settings.exportSqliteSnapshotDescription")}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportDatabase}
                disabled={isExportingDatabase}
                className="shrink-0"
              >
                <HardDrive className="h-4 w-4 mr-2" />
                {isExportingDatabase
                  ? t("space.settings.exportingDatabase")
                  : t("common.export")}
              </Button>
            </SettingsRow>
          )}

          {isDesktopMode && !isFileSpace && isRemoteSyncEnabled && (
            <SettingsRow
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {t("space.settings.remoteSync", "Remote Sync")}
                  <Badge variant="outline">
                    {spaceInfo?.sync?.provider || "sync"}
                  </Badge>
                </span>
              }
              description={t(
                "space.settings.disableRemoteSyncDescription",
                "Stop pulling and pushing remote changes while keeping local version history."
              )}
            >
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isDisablingRemoteSync}
                    className="shrink-0"
                  >
                    <GitBranch className="h-4 w-4 mr-2" />
                    {isDisablingRemoteSync
                      ? t("common.disabling", "Disabling...")
                      : t("space.settings.disableRemoteSync", "Disable Sync")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t(
                        "space.settings.disableRemoteSync",
                        "Disable Remote Sync"
                      )}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t(
                        "space.settings.disableRemoteSyncConfirm",
                        "This space will stop syncing with the remote provider. Local version history stays enabled, so commits and local diffs remain available."
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDisableRemoteSync}>
                      {t("common.continue")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </SettingsRow>
          )}
        </SettingsRows>
      </SettingsSection>

      {/* Node Name Uniqueness Setting */}
      {!isFileSpace && (
        <SettingsSection
          title={t("node.settings.nameUniqueness")}
          description={t("node.settings.nameUniquenessDescription")}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="min-w-0 flex-1">
              {!isLoadingUniqueness &&
                !nameUniquenessEnabled &&
                duplicateCount > 0 && (
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
                        <p>{t("node.settings.nameUniquenessEnableConfirm")}</p>
                        {duplicateCount > 0 && (
                          <p className="text-amber-600 dark:text-amber-400">
                            {t("node.settings.duplicateNodesFound", {
                              count: duplicateCount,
                            })}{" "}
                            -{t("node.settings.duplicateNodesWillBeRenamed")}
                          </p>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t("common.cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={handleToggleNameUniqueness}>
                        {t("common.continue")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        title={
          <span className="text-destructive">
            {t("space.settings.dangerZone")}
          </span>
        }
        description={t("space.settings.dangerDescription")}
      >
        <SettingsRows>
          {isDesktopMode && !isFileSpace && isVersioningEnabled && (
            <SettingsRow
              title={
                <span className="text-destructive">
                  {t(
                    "space.settings.turnOffLocalHistory",
                    "Turn Off Local History"
                  )}
                </span>
              }
              description={
                isRemoteSyncEnabled
                  ? t(
                      "space.settings.turnOffLocalHistoryRequiresSyncOff",
                      "Disable remote sync before turning off local version history."
                    )
                  : t(
                      "space.settings.turnOffLocalHistoryDescription",
                      "Convert this space back to a regular SQLite database. Current data is kept, but local commits and branches are removed from this folder."
                    )
              }
            >
              <AlertDialog
                onOpenChange={(open) => {
                  if (!open) {
                    setTurnOffHistoryConfirmText("")
                  }
                }}
              >
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    disabled={isRemoteSyncEnabled || isTurningOffHistory}
                    className="w-fit shrink-0"
                  >
                    <History className="h-4 w-4 mr-2" />
                    {isTurningOffHistory
                      ? t("common.disabling", "Disabling...")
                      : t(
                          "space.settings.turnOffLocalHistory",
                          "Turn Off History"
                        )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      {t(
                        "space.settings.turnOffLocalHistory",
                        "Turn Off Local History"
                      )}
                    </AlertDialogTitle>
                    <AlertDialogDescription className="space-y-2">
                      <p>
                        {t(
                          "space.settings.turnOffLocalHistoryWarning",
                          "Eidos will export the current worktree to .eidos/db.sqlite3 and remove the local Graft repository from this folder."
                        )}
                      </p>
                      <p>
                        {t(
                          "space.settings.turnOffLocalHistoryBackupHint",
                          "Use Export SQLite Snapshot first if you want a separate backup file."
                        )}
                      </p>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="space-y-2">
                    <Label htmlFor="turnOffHistoryConfirm">
                      {t(
                        "space.settings.typeSpaceIdToConfirm",
                        "Type the space ID to confirm"
                      )}
                    </Label>
                    <Input
                      id="turnOffHistoryConfirm"
                      value={turnOffHistoryConfirmText}
                      onChange={(e) =>
                        setTurnOffHistoryConfirmText(e.target.value)
                      }
                      placeholder={turnOffHistoryConfirmTarget}
                      disabled={isTurningOffHistory}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("space.settings.confirmPhraseHint", "Enter")}{" "}
                      <span className="font-medium text-foreground">
                        {turnOffHistoryConfirmTarget}
                      </span>{" "}
                      {t(
                        "space.settings.confirmPhraseHintSuffix",
                        "to confirm."
                      )}
                    </p>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleTurnOffLocalHistory}
                      disabled={
                        isTurningOffHistory ||
                        turnOffHistoryConfirmText !==
                          turnOffHistoryConfirmTarget
                      }
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t("common.continue")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </SettingsRow>
          )}

          <SettingsRow
            title={
              <span className="text-destructive">
                {t("space.settings.unregisterSpace")}
              </span>
            }
            description={t("space.settings.unregisterSpaceDescription")}
          >
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
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
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
          </SettingsRow>
        </SettingsRows>
      </SettingsSection>
    </div>
  )
}
