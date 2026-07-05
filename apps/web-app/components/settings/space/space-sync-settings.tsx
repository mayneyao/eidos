import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ExternalLink,
  Plus,
  Server,
  Cloud,
  Check,
  Lock,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/use-toast"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useActivation } from "@/hooks/use-activation"
import { useCurrentSpace, useSpaceStore } from "@/hooks/use-current-space"
import { isDesktopMode } from "@/lib/env"

interface ProviderConfig {
  id: string
  name: string
  endpoint: string
  bucketName: string
  region?: string
}

interface GlobalSyncConfig {
  providers: Record<string, ProviderConfig>
  defaultProvider?: string
}

export function SpaceSyncSettings() {
  const { t } = useTranslation()
  const { navigate } = useRouterAdapter()
  const { currentSpace: spaceInfo } = useCurrentSpace()
  const { license, isLoading: isLicenseLoading } = useActivation()
  const hasValidLicense = license !== null

  // Global sync config (only custom providers)
  const [globalConfig, setGlobalConfig] = useState<GlobalSyncConfig>({
    providers: {},
  })

  const [isLoading, setIsLoading] = useState(true)
  const [isToggling, setIsToggling] = useState(false)
  // Track credentials for built-in eidos.space + custom providers
  const [eidosSpaceCredentials, setEidosSpaceCredentials] = useState(false)
  const [customProviderCredentials, setCustomProviderCredentials] = useState<
    Record<string, boolean>
  >({})
  const [isDisableSyncDialogOpen, setIsDisableSyncDialogOpen] = useState(false)
  const [disableSyncConfirmText, setDisableSyncConfirmText] = useState("")

  const isSyncEnabled = spaceInfo?.sync?.enabled || false
  const disableSyncConfirmTarget = spaceInfo?.id || ""
  const canConfirmDisableSync =
    disableSyncConfirmTarget.length > 0 &&
    disableSyncConfirmText === disableSyncConfirmTarget

  // Current effective provider for this space
  const currentProviderId =
    spaceInfo?.sync?.provider || globalConfig.defaultProvider || "eidos.space"
  const isEidosSpace = currentProviderId === "eidos.space"
  const currentProvider = isEidosSpace
    ? null
    : globalConfig.providers[currentProviderId]

  // Build the actual remote URL based on provider
  const remoteAddress = (() => {
    if (!spaceInfo?.id) return ""

    if (isEidosSpace) {
      // For eidos.space: use the remote URL directly
      return spaceInfo.sync?.remote || `https://eidos.space/${spaceInfo.id}`
    } else {
      // For custom: use local bucket browser with space id as path
      const port = window.location.port || "13127"
      return `http://storage.eidos.localhost:${port}/?path=${encodeURIComponent(spaceInfo.id + "/")}`
    }
  })()

  // Load global sync config
  useEffect(() => {
    async function loadConfig() {
      if (!isDesktopMode || !window.eidos?.config) {
        setIsLoading(false)
        return
      }

      try {
        // Load global config (only custom providers)
        const config = await window.eidos.config.get("sync")
        if (config) {
          setGlobalConfig(config)
        }

        // Check eidos.space credentials (built-in)
        const eidosCreds =
          await window.eidos.credentials.hasSyncCredentials("eidos.space")
        setEidosSpaceCredentials(eidosCreds)

        // Check credentials for custom providers
        const creds: Record<string, boolean> = {}
        for (const id of Object.keys(config?.providers || {})) {
          creds[id] = await window.eidos.credentials.hasSyncCredentials(id)
        }
        setCustomProviderCredentials(creds)
      } catch (error) {
        console.error("Failed to load sync config:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadConfig()
  }, [])

  // Check if selected provider has credentials
  const hasCredentialsForProvider = (providerId: string): boolean => {
    if (providerId === "eidos.space") {
      return eidosSpaceCredentials
    }
    return customProviderCredentials[providerId] || false
  }

  // Handle provider selection change
  const handleProviderChange = async (providerId: string) => {
    // If sync is already enabled, warn user about provider change
    if (isSyncEnabled && providerId !== spaceInfo?.sync?.provider) {
      toast({
        title: t("space.settings.sync.providerChanged"),
        description: t("space.settings.sync.providerChangeHint"),
      })
    }
  }

  const handleDisableSyncDialogOpenChange = (open: boolean) => {
    setIsDisableSyncDialogOpen(open)
    if (!open) {
      setDisableSyncConfirmText("")
    }
  }

  // Handle sync toggle for this space
  const handleToggleSync = async (enabled: boolean) => {
    if (!isDesktopMode) {
      toast({
        title: t("space.settings.sync.syncNotAvailable"),
        description: t("space.settings.sync.desktopOnly"),
        variant: "destructive",
      })
      return
    }

    if (!spaceInfo?.id) {
      toast({
        title: t("common.error"),
        description: t("space.settings.sync.spaceNotFound"),
        variant: "destructive",
      })
      return
    }

    const providerId =
      spaceInfo.sync?.provider || globalConfig.defaultProvider || "eidos.space"
    const isCustomProvider = providerId !== "eidos.space"

    // Check license for custom provider
    if (enabled && isCustomProvider && !hasValidLicense) {
      toast({
        title: t("space.settings.sync.licenseRequired"),
        description: t("space.settings.sync.licenseRequiredFullDescription"),
        variant: "destructive",
      })
      return
    }

    // Check if selected provider has credentials
    if (enabled && !hasCredentialsForProvider(providerId)) {
      const providerName =
        providerId === "eidos.space"
          ? "eidos.space"
          : globalConfig.providers[providerId]?.name || providerId
      toast({
        title: t("space.settings.sync.credentialsRequired"),
        description: t("space.settings.sync.credentialsRequiredDescription", {
          provider: providerName,
        }),
        variant: "destructive",
      })
      return
    }

    setIsToggling(true)
    try {
      // Generate remote address if enabling and no remote exists
      let remote = spaceInfo.sync?.remote
      if (enabled && !remote) {
        if (providerId === "eidos.space") {
          remote = `https://eidos.space/${spaceInfo.id}`
        } else {
          remote = `s3://custom/${spaceInfo.id}`
        }
      }

      const result = await window.eidos.spaceMgmt.toggleSpaceSync(
        spaceInfo.id,
        enabled,
        remote,
        providerId as "eidos.space" | "custom"
      )

      if (result.success) {
        if (!enabled) {
          setIsDisableSyncDialogOpen(false)
          setDisableSyncConfirmText("")
        }

        const providerDisplayName =
          providerId === "eidos.space"
            ? "eidos.space"
            : globalConfig.providers[providerId]?.name || providerId
        toast({
          title: enabled
            ? t("space.settings.sync.enabledStatus")
            : t("space.settings.sync.disabledStatus"),
          description: enabled
            ? t("space.settings.sync.nowSyncingWith", {
                provider: providerDisplayName,
              })
            : t("space.settings.sync.disabledDescription"),
        })

        // Refresh space info to get updated sync status
        const updatedSpace = await window.eidos.spaceMgmt.getCurrentSpace()
        useSpaceStore.getState().setSpaceInfo(updatedSpace)

        if (!enabled) {
          window.setTimeout(() => {
            window.location.reload()
          }, 250)
        }
      } else {
        toast({
          title: t("common.error"),
          description: result.error || t("space.settings.sync.toggleFailed"),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to toggle sync:", error)
      toast({
        title: t("common.error"),
        description: t("space.settings.sync.toggleFailed"),
        variant: "destructive",
      })
    } finally {
      setIsToggling(false)
    }
  }

  const handleSyncSwitchChange = (enabled: boolean) => {
    if (!enabled && isSyncEnabled) {
      setIsDisableSyncDialogOpen(true)
      return
    }

    void handleToggleSync(enabled)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          {t("space.settings.sync.loading")}
        </div>
      </div>
    )
  }

  const customProviders = Object.values(globalConfig.providers)
  const effectiveProviderId =
    spaceInfo?.sync?.provider || globalConfig.defaultProvider || "eidos.space"

  return (
    <div className="space-y-6">
      {/* License Required Banner for Custom Providers */}
      {!hasValidLicense &&
        !isLicenseLoading &&
        isDesktopMode &&
        customProviders.length > 0 && (
          <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {t("space.settings.sync.licenseRequiredForCustomProviders")}
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  {t("space.settings.sync.customProvidersLicenseRequired")}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-amber-700 dark:text-amber-300 mt-2"
                  onClick={() =>
                    navigate("/settings/account", { replace: true })
                  }
                >
                  {t("space.settings.sync.goToAccountSettings")} →
                </Button>
              </div>
            </div>
          </div>
        )}

      {/* Provider Selection */}
      <div className="p-4 rounded-lg bg-muted/50 border border-border space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {t("space.settings.sync.provider")}
          </span>
          {spaceInfo?.sync?.provider ? (
            <Badge variant="default">{t("space.settings.sync.custom")}</Badge>
          ) : (
            <Badge variant="secondary">
              {t("space.settings.sync.default")}
            </Badge>
          )}
        </div>

        {customProviders.length === 0 && !eidosSpaceCredentials ? (
          <div className="p-4 text-center border border-dashed rounded-lg">
            <p className="text-sm text-muted-foreground">
              {t("space.settings.sync.noProviders")}
            </p>
            <Button
              variant="link"
              size="sm"
              onClick={() => navigate("/settings/sync", { replace: true })}
            >
              {t("space.settings.sync.goToGlobalSettings")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Default Provider Option */}
            <div
              className={`flex items-start space-x-3 rounded-md border p-3 cursor-pointer transition-colors ${
                !spaceInfo?.sync?.provider
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/80"
              }`}
              onClick={() =>
                handleProviderChange(
                  globalConfig.defaultProvider || "eidos.space"
                )
              }
            >
              <div className="mt-0.5">
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    !spaceInfo?.sync?.provider
                      ? "border-primary"
                      : "border-muted-foreground"
                  }`}
                >
                  {!spaceInfo?.sync?.provider && (
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  )}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {(globalConfig.defaultProvider || "eidos.space") ===
                  "eidos.space" ? (
                    <Cloud className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Server className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="font-medium">
                    {t("space.settings.sync.useDefault")}
                  </span>
                  {(globalConfig.defaultProvider || "eidos.space") ===
                  "eidos.space" ? (
                    <span className="text-sm text-muted-foreground">
                      (eidos.space)
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      (
                      {
                        globalConfig.providers[
                          globalConfig.defaultProvider || ""
                        ]?.name
                      }
                      )
                    </span>
                  )}
                </div>
                {!hasCredentialsForProvider(
                  globalConfig.defaultProvider || "eidos.space"
                ) && (
                  <p className="text-sm text-orange-600 mt-1">
                    {t("space.settings.sync.credentialsNotConfigured")}
                  </p>
                )}
              </div>
            </div>

            {/* Custom Providers */}
            {customProviders.map((provider) => {
              const isDisabled = !hasValidLicense
              return (
                <div
                  key={provider.id}
                  className={`flex items-start space-x-3 rounded-md border p-3 transition-colors ${
                    isDisabled
                      ? "opacity-50 cursor-not-allowed bg-muted/50"
                      : "cursor-pointer hover:border-border/80"
                  } ${
                    spaceInfo?.sync?.provider === provider.id && !isDisabled
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                  onClick={() =>
                    !isDisabled && handleProviderChange(provider.id)
                  }
                >
                  <div className="mt-0.5">
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        spaceInfo?.sync?.provider === provider.id && !isDisabled
                          ? "border-primary"
                          : "border-muted-foreground"
                      }`}
                    >
                      {spaceInfo?.sync?.provider === provider.id &&
                        !isDisabled && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{provider.name}</span>
                      {customProviderCredentials[provider.id] && (
                        <Check className="h-3 w-3 text-green-600" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {provider.endpoint}/{provider.bucketName}
                    </p>
                    {!customProviderCredentials[provider.id] && !isDisabled && (
                      <p className="text-sm text-orange-600 mt-1">
                        {t("space.settings.sync.credentialsNotConfigured")}
                      </p>
                    )}
                    {isDisabled && (
                      <p className="text-sm text-amber-600 mt-1 flex items-center gap-1">
                        <Lock className="h-3 w-3" />
                        {t("space.settings.sync.licenseRequired")}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Sync Toggle */}
      <div className="p-4 rounded-lg bg-muted/50 border border-border">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">
              {t("space.settings.sync.spaceSync")}
            </span>
            <p className="text-sm text-muted-foreground">
              {isSyncEnabled
                ? t("space.settings.sync.syncingWith", {
                    provider:
                      effectiveProviderId === "eidos.space"
                        ? "eidos.space"
                        : globalConfig.providers[effectiveProviderId]?.name ||
                          effectiveProviderId,
                  })
                : effectiveProviderId &&
                    hasCredentialsForProvider(effectiveProviderId)
                  ? t("space.settings.sync.willSyncWith", {
                      provider:
                        effectiveProviderId === "eidos.space"
                          ? "eidos.space"
                          : globalConfig.providers[effectiveProviderId]?.name ||
                            effectiveProviderId,
                    })
                  : t("space.settings.sync.configureProviderFirst")}
            </p>
          </div>
          <Switch
            checked={isSyncEnabled}
            disabled={
              isToggling ||
              !effectiveProviderId ||
              (!isSyncEnabled &&
                !hasCredentialsForProvider(effectiveProviderId))
            }
            onCheckedChange={handleSyncSwitchChange}
          />
        </div>
      </div>

      <AlertDialog
        open={isDisableSyncDialogOpen}
        onOpenChange={handleDisableSyncDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("space.settings.sync.disableWarningTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {t("space.settings.sync.disableWarningDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="disable-sync-space-id">
              {t("space.settings.sync.disableConfirmSpaceId", {
                spaceId: disableSyncConfirmTarget,
              })}
            </Label>
            <Input
              id="disable-sync-space-id"
              value={disableSyncConfirmText}
              onChange={(event) =>
                setDisableSyncConfirmText(event.target.value)
              }
              placeholder={disableSyncConfirmTarget}
              disabled={isToggling}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isToggling}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!canConfirmDisableSync || isToggling}
              onClick={(event) => {
                event.preventDefault()
                void handleToggleSync(false)
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isToggling
                ? t("common.loading")
                : t("space.settings.sync.disableSync")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remote Address */}
      {isSyncEnabled && remoteAddress ? (
        <div className="space-y-2">
          <Label htmlFor="remote-address">
            {t("space.settings.sync.remoteAddress")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="remote-address"
              value={remoteAddress}
              readOnly
              placeholder="https://eidos.space/<username>/<space>"
              className="bg-muted flex-1"
            />
            <Button
              variant="outline"
              size="xs"
              onClick={() => window.open(remoteAddress, "_blank")}
              className="shrink-0"
              title={t("space.settings.sync.openInWeb")}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : !isSyncEnabled && hasCredentialsForProvider(effectiveProviderId) ? (
        <div className="flex items-center justify-center p-6 border border-border border-dashed rounded-lg">
          <Button
            variant="outline"
            onClick={() => window.open("https://eidos.space/new", "_blank")}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("space.settings.sync.createSpace")}
          </Button>
        </div>
      ) : null}

      {/* Info */}
      <div className="p-3 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground">
        <p>
          <strong>{t("space.settings.sync.noteLabel")}:</strong>{" "}
          {t("space.settings.sync.globalSettingsNote")}{" "}
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => navigate("/settings/sync", { replace: true })}
          >
            {t("space.settings.sync.globalSyncSettings")}
          </Button>
          .
        </p>
      </div>
    </div>
  )
}
