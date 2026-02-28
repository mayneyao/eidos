import { useEffect, useState } from "react"
import { AlertTriangle, FolderOpen, Save, Search } from "lucide-react"
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
import { useToast } from "@/components/ui/use-toast"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useEngine } from "@/apps/web-app/hooks/use-engine"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import type { SpaceInfo } from "@/apps/web-app/hooks/use-current-space"

export function GeneralSettings() {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const { deleteSpace, rebuildIndex, renameSpace, spaceList, updateSpaceList } =
    useSpace()
  const { navigate } = useRouterAdapter()
  const { close } = useEngine()
  const { toast } = useToast()

  const [confirmName, setConfirmName] = useState("")
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [dataFolder, setDataFolder] = useState<string>("")
  const [spaceInfo, setSpaceInfo] = useState<SpaceInfo | null>(null)
  const [spaceName, setSpaceName] = useState("")
  const [isRenaming, setIsRenaming] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      if (isDesktopMode) {
        const folder = await window.eidos.config.get("dataFolder")
        setDataFolder(folder || "")

        // Load current space info
        try {
          const info = await window.eidos.invoke("get-current-space")
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

  const handleRename = async () => {
    if (!space || !spaceName.trim()) return

    setIsRenaming(true)
    try {
      await renameSpace(space, spaceName.trim())
      // Success is silent - no toast per toast rules
      // Reload space info to get updated name
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        try {
          const info = await window.eidos.invoke("get-current-space")
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
          const updatedSpaces = await window.eidos.invoke("list-spaces")
          if (updatedSpaces && updatedSpaces.length > 0) {
            // Switch to the first available space
            const result = await window.eidos.invoke(
              "switch-space",
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
        const spaceInfo = await window.eidos.invoke("get-current-space")
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

  return (
    <div className="space-y-0">
      <div className="py-4">
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
                <Label htmlFor="spaceName">
                  {t("space.settings.spaceName")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="spaceName"
                    value={spaceName}
                    onChange={(e) => setSpaceName(e.target.value)}
                    disabled={isRenaming || !spaceInfo}
                    placeholder={t("space.settings.spaceNamePlaceholder")}
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

      <div className="py-4">
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
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("space.settings.rebuildSearchIndex")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.rebuildSearchIndexDescription")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={handleRebuildIndex}
                  disabled={isRebuilding}
                  className="w-fit"
                >
                  <Search className="h-4 w-4 mr-2" />
                  {isRebuilding
                    ? t("space.settings.rebuilding")
                    : t("space.settings.rebuildSearchIndex")}
                </Button>
              </div>

              {isDesktopMode && (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{t("space.settings.openDataFolder")}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t("space.settings.openDataFolderDescription")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleOpenFolder}
                    className="w-fit"
                  >
                    <FolderOpen className="h-4 w-4 mr-2" />
                    {t("space.settings.openDataFolder")}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="py-4">
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
                      <AlertDialogTitle>
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
                      >
                        {t("common.continue")}
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
