import { useEffect, useState } from "react"
import { AlertTriangle, FolderOpen, Save, Search } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

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
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useEngine } from "@/apps/web-app/hooks/use-engine"
import { useSpace } from "@/apps/web-app/hooks/use-space"

export function GeneralSettings() {
  const { t } = useTranslation()
  const { space } = useCurrentPathInfo()
  const { deleteSpace, rebuildIndex } = useSpace()
  const navigate = useNavigate()
  const { close } = useEngine()

  const [confirmName, setConfirmName] = useState("")
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [dataFolder, setDataFolder] = useState<string>("")

  useEffect(() => {
    const loadDataFolder = async () => {
      if (isDesktopMode) {
        const folder = await window.eidos.config.get("dataFolder")
        setDataFolder(folder || "")
      }
    }
    loadDataFolder()
  }, [])

  const handleDelete = async () => {
    if (confirmName === space) {
      await deleteSpace(space)
      close()
      navigate("/")
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
          window.eidos.openFolder(spaceInfo.path)
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
                <Input
                  id="spaceName"
                  value={space}
                  disabled
                  className="bg-muted"
                />
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
                    {t("space.settings.deleteSpace")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.deleteSpaceDescription")}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-fit">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      {t("space.settings.deleteSpace")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("common.areYouAbsolutelySure")}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("space.settings.deleteSpaceWarning", {
                          spaceName: space,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                      id="confirmName"
                      type="text"
                      placeholder={t("space.settings.typeSpaceName")}
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                    />
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t("common.cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
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
