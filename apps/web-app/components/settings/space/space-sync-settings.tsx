import { useEffect, useState } from "react"
import { Cloud } from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { useCurrentSpaceId } from "@/hooks/use-current-space"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"

export function SpaceSyncSettings() {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [isSyncEnabled, setIsSyncEnabled] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const currentSpaceId = useCurrentSpaceId()

  useEffect(() => {
    const loadSyncStatus = async () => {
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        try {
          // Get current sync status from the database
          const result = await window.eidos.invoke("get-sync-status")
          setIsSyncEnabled(result?.enabled || false)
        } catch (error) {
          console.error("Error loading sync status:", error)
          setIsSyncEnabled(false)
        }
      }
    }
    loadSyncStatus()
  }, [])

  const handleToggleSync = async () => {
    if (!isDesktopMode || !window.eidos) {
      toast({
        title: t("space.settings.sync.notAvailable"),
        description: t("space.settings.sync.desktopOnly"),
        variant: "destructive",
      })
      return
    }

    setIsInitializing(true)
    try {
      const result = await window.eidos.invoke(
        "init-graft-database",
        currentSpaceId
      )
      if (
        result &&
        typeof result === "string" &&
        result !== "sync is not enabled"
      ) {
        setIsSyncEnabled(true)
        toast({
          title: t("space.settings.sync.enabled"),
          description: t("space.settings.sync.initialized"),
        })
      } else {
        toast({
          title: t("space.settings.sync.failed"),
          description: result || t("space.settings.sync.unknownError"),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error initializing graft database:", error)
      toast({
        title: t("space.settings.sync.failed"),
        description:
          error instanceof Error
            ? error.message
            : t("space.settings.sync.unknownError"),
        variant: "destructive",
      })
    } finally {
      setIsInitializing(false)
    }
  }

  return (
    <div className="space-y-0">
      <div className="py-4">
        <h3 className="text-lg font-medium">
          {t("space.settings.sync.title")}
        </h3>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-4">
              {t("space.settings.sync.description")}
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("space.settings.sync.enableSync")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.sync.enableSyncDescription")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={isSyncEnabled}
                    onCheckedChange={() => {}} // Read-only display
                    disabled={true}
                  />
                  <Button
                    onClick={handleToggleSync}
                    disabled={isInitializing || isSyncEnabled}
                    variant={isSyncEnabled ? "secondary" : "default"}
                  >
                    <Cloud className="h-4 w-4 mr-2" />
                    {isInitializing
                      ? t("space.settings.sync.initializing")
                      : isSyncEnabled
                        ? t("space.settings.sync.enabled")
                        : t("space.settings.sync.enable")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
