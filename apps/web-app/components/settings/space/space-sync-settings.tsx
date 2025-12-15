import { useEffect, useState } from "react"
import { Cloud } from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { useCurrentSpaceId } from "@/hooks/use-current-space"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"

// Helper function to render text with links
const renderTextWithLink = (text: string, onLinkClick: () => void) => {
  const parts = text.split(/\[([^\]]+)\]\(([^)]+)\)/);
  return parts.map((part, index) => {
    if (index % 3 === 1) {
      // This is a link text
      return (
        <button
          key={index}
          onClick={onLinkClick}
          className="text-primary hover:underline focus:outline-none focus:underline"
        >
          {part}
        </button>
      );
    }
    return part;
  });
};

export function SpaceSyncSettings() {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [isSyncEnabled, setIsSyncEnabled] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [remoteAddress, setRemoteAddress] = useState("")
  const [isDisablingSync, setIsDisablingSync] = useState(false)
  const currentSpaceId = useCurrentSpaceId()

  useEffect(() => {
    const loadSyncStatus = async () => {
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        try {
          // Get current sync status from the database
          const result = await window.eidos.invoke("get-sync-status")
          setIsSyncEnabled(result?.enabled || false)

          // Get current remote address
          const remoteResult = await window.eidos.invoke("get-sync-remote")
          const remote = remoteResult?.remote || ""
          setRemoteAddress(remote)
        } catch (error) {
          console.error("Error loading sync status:", error)
          setIsSyncEnabled(false)
          setRemoteAddress("")
        }
      }
    }
    loadSyncStatus()
  }, [])



  const handleDisableSync = async () => {
    if (!isDesktopMode || !window.eidos) {
      toast({
        title: t("space.settings.sync.notAvailable"),
        description: t("space.settings.sync.desktopOnly"),
        variant: "destructive",
      })
      return
    }

    setIsDisablingSync(true)
    try {
      const result = await window.eidos.invoke("space-disable-sync", currentSpaceId)
      if (result?.success) {
        setIsSyncEnabled(false)
        toast({
          title: t("space.settings.sync.disabled"),
          description: t("space.settings.sync.disableSuccessDescription"),
        })
      } else {
        toast({
          title: t("space.settings.sync.disableFailed"),
          description: result?.error || t("space.settings.sync.unknownError"),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error disabling sync:", error)
      toast({
        title: t("space.settings.sync.disableFailed"),
        description:
          error instanceof Error
            ? error.message
            : t("space.settings.sync.unknownError"),
        variant: "destructive",
      })
    } finally {
      setIsDisablingSync(false)
    }
  }

  const handleToggleSync = async () => {
    if (!isDesktopMode || !window.eidos) {
      toast({
        title: t("space.settings.sync.notAvailable"),
        description: t("space.settings.sync.desktopOnly"),
        variant: "destructive",
      })
      return
    }

    // Check if remote address is set when enabling sync
    if (!isSyncEnabled && !remoteAddress.trim()) {
      toast({
        title: t("space.settings.sync.remoteRequired"),
        variant: "destructive",
      })
      return
    }

    setIsInitializing(true)
    try {
      const result = await window.eidos.invoke(
        "space-enable-sync",
        currentSpaceId,
        remoteAddress.trim()
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
              <div className="space-y-2">
                <Label htmlFor="remote-address">{t("space.settings.sync.remoteAddress")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="remote-address"
                    value={remoteAddress}
                    onChange={(e) => setRemoteAddress(e.target.value)}
                    readOnly={isSyncEnabled}
                    placeholder="https://eidos.space/<username>/<space>"
                    className={isSyncEnabled ? "bg-muted flex-1" : "flex-1"}
                  />
                  {remoteAddress && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Extract username and volume from remote URL
                        // Format: https://eidos.space/username/volume.graft
                        const urlParts = remoteAddress.replace('https://eidos.space/', '').split('/');
                        if (urlParts.length >= 2) {
                          const username = urlParts[0];
                          const volumeWithExt = urlParts[1];
                          const volume = volumeWithExt.replace('.graft', '');
                          const webUrl = `https://eidos.space/${username}/${volume}`;
                          window.open(webUrl, '_blank');
                        }
                      }}
                      className="shrink-0"
                    >
                      {t("space.settings.sync.openInWeb")}
                    </Button>
                  )}
                </div>
                {!isSyncEnabled && (
                  <p className="text-sm text-muted-foreground">
                    {renderTextWithLink(t("space.settings.sync.createSpaceDescription"), () =>
                      window.open('https://eidos.space/new', '_blank')
                    )}
                  </p>
                )}
                {isSyncEnabled && (
                  <p className="text-sm text-muted-foreground">
                    {t("space.settings.sync.remoteAddressDescription")}
                  </p>
                )}
              </div>

              <Alert>
                <AlertDescription className="whitespace-pre-line">
                  {t("space.settings.sync.enableWarningDescription")}
                </AlertDescription>
              </Alert>

              {!isSyncEnabled ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={isInitializing || !remoteAddress.trim()}
                      className="w-full"
                    >
                      <Cloud className="h-4 w-4 mr-2" />
                      {isInitializing
                        ? t("space.settings.sync.initializing")
                        : t("space.settings.sync.enable")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("space.settings.sync.enableWarningTitle")}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="whitespace-pre-line">
                        {t("space.settings.sync.enableWarningDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t("common.cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction onClick={handleToggleSync}>
                        {t("space.settings.sync.enableWarningConfirm")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      disabled={isDisablingSync}
                      className="w-full"
                    >
                      {isDisablingSync ? t("common.updating") : t("space.settings.sync.disableSync")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t("space.settings.sync.disableWarningTitle")}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="whitespace-pre-line">
                        {t("space.settings.sync.disableWarningDescription")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>
                        {t("common.cancel")}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDisableSync}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {t("space.settings.sync.disableSync")}
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
  )
}
