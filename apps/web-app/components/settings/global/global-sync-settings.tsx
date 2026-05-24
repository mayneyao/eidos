import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Check,
  Cloud,
  Lock,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Server,
  Trash2,
  Globe,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { useActivation } from "@/hooks/use-activation"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
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
import { toast } from "@/components/ui/use-toast"
import { useAuthOptional } from "@/components/auth-provider"

interface ProviderConfig {
  id: string
  name: string
  endpoint: string
  bucketName: string
  region?: string
}

interface SyncConfig {
  providers: Record<string, ProviderConfig>
  defaultProvider?: string
}

interface SyncBucketCredentials {
  bucketName: string
  accessKeyId: string
  secretAccessKey: string
  tokenId: string
  endpoint: string
}

interface SyncBucketError {
  success: false
  message: string
  details?: any
  statusCode: number
}

interface SyncBucketResult {
  success: true
  data: SyncBucketCredentials
}

type SyncInitResponse = SyncBucketResult | SyncBucketError

const SYNC_INTERNAL_URL = "https://eidos.space/api/sync/init"

export function GlobalSyncSettings() {
  const { t } = useTranslation()
  const { navigate } = useRouterAdapter()
  const auth = useAuthOptional()
  const { license, isLoading: isLicenseLoading } = useActivation()
  const hasValidLicense = license !== null

  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    providers: {},
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isInitializing, setIsInitializing] = useState(false)
  const [eidosSpaceCredentials, setEidosSpaceCredentials] = useState(false)
  const [customProviderCredentials, setCustomProviderCredentials] = useState<
    Record<string, boolean>
  >({})
  const [providerTestStatus, setProviderTestStatus] = useState<
    Record<string, "untested" | "testing" | "success" | "error">
  >({})

  const [showAddForm, setShowAddForm] = useState(false)
  const [newProviderForm, setNewProviderForm] = useState({
    id: "",
    endpoint: "",
    bucketName: "",
    region: "",
    accessKeyId: "",
    secretAccessKey: "",
  })

  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean
    providerId: string
    providerName: string
    confirmInput: string
  }>({
    isOpen: false,
    providerId: "",
    providerName: "",
    confirmInput: "",
  })

  const isAuthenticated = auth?.isAuthenticated ?? false

  useEffect(() => {
    async function loadSyncConfig() {
      if (!isDesktopMode || !window.eidos?.config) {
        setIsLoading(false)
        return
      }

      try {
        const config = await window.eidos.config.get("sync")
        if (config) {
          setSyncConfig(config)
        }

        const eidosCreds =
          await window.eidos.credentials.hasSyncCredentials("eidos.space")
        setEidosSpaceCredentials(eidosCreds)

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

    loadSyncConfig()
  }, [])

  const getAuthHeaders = (): Record<string, string> => {
    if (auth?.accessToken) {
      return { Authorization: `Bearer ${auth.accessToken}` }
    }
    return {}
  }

  const initializeEidosSync = async () => {
    if (!isAuthenticated) {
      toast({
        title: t("settings.sync.loginRequired", "Authentication Required"),
        description: t(
          "settings.sync.loginRequiredDescription",
          "Please login to eidos.space in Account settings first."
        ),
        variant: "destructive",
      })
      return
    }

    setIsInitializing(true)
    try {
      const response = await fetch(SYNC_INTERNAL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
      })

      let data: SyncInitResponse
      try {
        data = await response.json()
      } catch (jsonError) {
        throw new Error(
          `Invalid response format: ${response.status} ${response.statusText}`
        )
      }

      if (!response.ok) {
        throw new Error(
          data.success === false
            ? data.message
            : `HTTP error! status: ${response.status}`
        )
      }

      if (data.success) {
        await window.eidos.credentials.setSyncCredentials(
          data.data,
          "eidos.space"
        )
        setEidosSpaceCredentials(true)

        if (!syncConfig.defaultProvider) {
          const newConfig: SyncConfig = {
            ...syncConfig,
            defaultProvider: "eidos.space",
          }
          await window.eidos.config.set("sync", newConfig)
          setSyncConfig(newConfig)
        }

        toast({
          title: t("settings.sync.initialized", "Sync Initialized"),
          description: t("settings.sync.bucketReady", {
            bucket: data.data.bucketName,
          }),
        })
      }
    } catch (error) {
      console.error("Failed to initialize sync:", error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast({
        title: t("settings.sync.initFailed", "Sync Initialization Failed"),
        description: errorMessage || "Unknown error occurred",
        variant: "destructive",
      })
    } finally {
      setIsInitializing(false)
    }
  }

  const handleAddProvider = async () => {
    if (!hasValidLicense) {
      toast({
        title: t("settings.license.licenseRequired"),
        description: t("settings.sync.customProviderLicenseRequired"),
        variant: "destructive",
      })
      return
    }

    if (!newProviderForm.id) {
      toast({
        title: t("common.error"),
        description: t("settings.sync.providerIdRequired"),
        variant: "destructive",
      })
      return
    }

    if (!newProviderForm.endpoint || !newProviderForm.bucketName) {
      toast({
        title: t("common.error"),
        description: t("settings.sync.endpointAndBucketRequired"),
        variant: "destructive",
      })
      return
    }

    if (!newProviderForm.accessKeyId || !newProviderForm.secretAccessKey) {
      toast({
        title: t("common.error"),
        description: t("settings.sync.credentialsRequired"),
        variant: "destructive",
      })
      return
    }

    try {
      await window.eidos.credentials.setSyncCredentials(
        {
          endpoint: newProviderForm.endpoint,
          bucketName: newProviderForm.bucketName,
          accessKeyId: newProviderForm.accessKeyId,
          secretAccessKey: newProviderForm.secretAccessKey,
          tokenId: newProviderForm.id,
        },
        newProviderForm.id
      )

      const providerConfig: ProviderConfig = {
        id: newProviderForm.id,
        name: newProviderForm.id,
        endpoint: newProviderForm.endpoint,
        bucketName: newProviderForm.bucketName,
        region: newProviderForm.region || undefined,
      }

      const newConfig: SyncConfig = {
        providers: {
          ...syncConfig.providers,
          [newProviderForm.id]: providerConfig,
        },
        defaultProvider: syncConfig.defaultProvider || newProviderForm.id,
      }

      await window.eidos.config.set("sync", newConfig)
      setSyncConfig(newConfig)
      setCustomProviderCredentials({
        ...customProviderCredentials,
        [newProviderForm.id]: true,
      })

      setNewProviderForm({
        id: "",
        endpoint: "",
        bucketName: "",
        region: "",
        accessKeyId: "",
        secretAccessKey: "",
      })
      setShowAddForm(false)

      toast({
        title: t("settings.sync.providerAdded"),
        description: t("settings.sync.providerAddedDescription", {
          name: newProviderForm.id,
        }),
      })
    } catch (error) {
      console.error("Failed to add provider:", error)
      toast({
        title: t("common.error"),
        description: t("settings.sync.providerAddFailed"),
        variant: "destructive",
      })
    }
  }

  const openDeleteDialog = (id: string, name: string) => {
    setDeleteDialog({
      isOpen: true,
      providerId: id,
      providerName: name,
      confirmInput: "",
    })
  }

  const closeDeleteDialog = () => {
    setDeleteDialog({
      isOpen: false,
      providerId: "",
      providerName: "",
      confirmInput: "",
    })
  }

  const confirmRemoveProvider = async () => {
    const id = deleteDialog.providerId
    if (deleteDialog.confirmInput !== id) {
      toast({
        title: t("settings.sync.confirmationFailed"),
        description: t("settings.sync.providerIdMismatch"),
        variant: "destructive",
      })
      return
    }

    try {
      const newProviders = { ...syncConfig.providers }
      delete newProviders[id]

      const newConfig: SyncConfig = {
        providers: newProviders,
        defaultProvider:
          syncConfig.defaultProvider === id
            ? Object.keys(newProviders)[0] || "eidos.space"
            : syncConfig.defaultProvider,
      }

      await window.eidos.config.set("sync", newConfig)
      await window.eidos.credentials.clearSyncCredentials(id)

      setSyncConfig(newConfig)
      const newCreds = { ...customProviderCredentials }
      delete newCreds[id]
      setCustomProviderCredentials(newCreds)

      closeDeleteDialog()

      toast({
        title: t("settings.sync.providerRemoved"),
        description: t("settings.sync.providerRemovedDescription", {
          name: id,
        }),
      })
    } catch (error) {
      console.error("Failed to remove provider:", error)
      toast({
        title: t("common.error"),
        description: t("settings.sync.providerRemoveFailed"),
        variant: "destructive",
      })
    }
  }

  const handleTestConnection = async (providerId: string) => {
    const provider = syncConfig.providers[providerId]
    if (!provider) return

    setProviderTestStatus((prev) => ({ ...prev, [providerId]: "testing" }))

    try {
      const credentials =
        await window.eidos.credentials.getSyncCredentials(providerId)
      if (!credentials) {
        setProviderTestStatus((prev) => ({ ...prev, [providerId]: "error" }))
        toast({
          title: t("settings.sync.noCredentials"),
          description: t("settings.sync.credentialsNotFound"),
          variant: "destructive",
        })
        return
      }

      const result = await window.eidos.credentials.testSyncConnection({
        endpoint: credentials.endpoint,
        bucketName: credentials.bucketName,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        region: provider.region || "auto",
      })

      if (result.success) {
        setProviderTestStatus((prev) => ({ ...prev, [providerId]: "success" }))
        toast({
          title: t("common.success"),
          description: t("settings.sync.connectionSuccess"),
        })
      } else {
        setProviderTestStatus((prev) => ({ ...prev, [providerId]: "error" }))
        toast({
          title: t("settings.sync.connectionFailed"),
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      setProviderTestStatus((prev) => ({ ...prev, [providerId]: "error" }))
      toast({
        title: t("common.error"),
        description: t("settings.sync.testConnectionFailed"),
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        {t("settings.sync.loading")}
      </div>
    )
  }

  const customProviders = Object.values(syncConfig.providers)

  return (
    <div className="space-y-0">
      {/* Providers Section */}
      <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">
            {t("settings.sync.provider", "Provider")}
          </h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm || !hasValidLicense}
          title={
            !hasValidLicense
              ? t("settings.sync.licenseRequiredForCustom")
              : undefined
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("common.button.add")}
        </Button>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-4">
          {/* License Required Banner */}
          {!hasValidLicense && !isLicenseLoading && isDesktopMode && (
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    {t("settings.sync.licenseRequired")}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    {t("settings.sync.licenseRequiredDescription")}
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-amber-700 dark:text-amber-300 mt-2"
                    onClick={() =>
                      navigate("/settings/account", { replace: true })
                    }
                  >
                    {t("settings.account.title")} →
                  </Button>
                </div>
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            {t("settings.sync.providerDescription")}
          </p>

          {/* Built-in: eidos.space */}
          <div className="p-4 rounded-lg border border-muted bg-muted/30 opacity-60">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3 flex-[5] min-w-[240px]">
                <div className="p-2 rounded-md bg-muted shrink-0">
                  <Cloud className="h-5 w-5 text-blue-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">eidos.space</span>
                    <Badge variant="secondary">
                      {t("settings.sync.builtIn", "Built-in")}
                    </Badge>
                    {eidosSpaceCredentials ? (
                      <Badge
                        variant="secondary"
                        className="text-green-600 bg-green-50 dark:bg-green-950/30"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        {t("settings.sync.ready")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600">
                        {t("settings.sync.notConnected")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.sync.managedCloudStorageBy")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" disabled className="whitespace-nowrap">
                  {eidosSpaceCredentials
                    ? t("settings.sync.connected")
                    : t("settings.sync.connect")}
                </Button>
              </div>
            </div>
          </div>

          {/* Custom Provider Cards */}
          {customProviders.map((provider) => {
            const testStatus = providerTestStatus[provider.id] || "untested"
            const hasCredentials = customProviderCredentials[provider.id]
            const isTesting = testStatus === "testing"
            const isTestSuccess = testStatus === "success"

            return (
              <div
                key={provider.id}
                className="p-4 rounded-lg border hover:border-primary/50 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3 flex-[5] min-w-[240px]">
                    <div className="p-2 rounded-md bg-muted shrink-0">
                      <Server className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{provider.name}</span>
                        {isTestSuccess ? (
                          <Badge
                            variant="secondary"
                            className="text-green-600 bg-green-50 dark:bg-green-950/30 shrink-0"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            {t("common.ready")}
                          </Badge>
                        ) : hasCredentials ? (
                          <Badge
                            variant="outline"
                            className="text-blue-600 shrink-0"
                          >
                            {t("settings.sync.credentialsSet")}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-orange-600 shrink-0"
                          >
                            {t("settings.sync.noCredentials")}
                          </Badge>
                        )}
                      </div>
                      <p
                        className="text-sm text-muted-foreground truncate"
                        title={provider.endpoint}
                      >
                        {provider.endpoint}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTestConnection(provider.id)}
                      disabled={isTesting}
                      className="h-8 px-3"
                    >
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t("settings.sync.test")
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        openDeleteDialog(provider.id, provider.name)
                      }
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}

          {customProviders.length === 0 && !showAddForm && (
            <div className="p-8 text-center border border-dashed rounded-lg">
              <Server className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-1">
                {t("settings.sync.noProviders")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("settings.sync.addProviderHint")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add Provider Form */}
      {showAddForm && (
        <>
          <div className="py-4 flex items-center gap-2">
            <Plus className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-medium">
              {t("settings.sync.addProvider")}
            </h3>
          </div>

          <hr className="border-border" />

          <div className="py-6">
            <div className="p-4 rounded-lg border space-y-4">
              <div className="space-y-2">
                <Label htmlFor="provider-id">
                  {t("settings.sync.providerId")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="provider-id"
                  placeholder="my-s3, minio, r2, etc."
                  value={newProviderForm.id}
                  onChange={(e) =>
                    setNewProviderForm((prev) => ({
                      ...prev,
                      id: e.target.value.toLowerCase().replace(/\s+/g, "-"),
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("settings.sync.providerIdDescription")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-endpoint">
                  {t("settings.sync.endpointUrl")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="provider-endpoint"
                  placeholder="https://s3.amazonaws.com or https://minio.example.com"
                  value={newProviderForm.endpoint}
                  onChange={(e) =>
                    setNewProviderForm((prev) => ({
                      ...prev,
                      endpoint: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-bucket">
                  {t("settings.sync.bucketName")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="provider-bucket"
                  placeholder="my-eidos-bucket"
                  value={newProviderForm.bucketName}
                  onChange={(e) =>
                    setNewProviderForm((prev) => ({
                      ...prev,
                      bucketName: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-region">
                  {t("settings.sync.region")}
                </Label>
                <Input
                  id="provider-region"
                  placeholder="us-east-1"
                  value={newProviderForm.region}
                  onChange={(e) =>
                    setNewProviderForm((prev) => ({
                      ...prev,
                      region: e.target.value,
                    }))
                  }
                />
              </div>

              <hr className="border-border" />

              <div className="space-y-2">
                <Label htmlFor="provider-access-key">
                  {t("settings.sync.accessKeyId")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="provider-access-key"
                  type="password"
                  placeholder="AKIA..."
                  value={newProviderForm.accessKeyId}
                  onChange={(e) =>
                    setNewProviderForm((prev) => ({
                      ...prev,
                      accessKeyId: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-secret-key">
                  {t("settings.sync.secretAccessKey")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="provider-secret-key"
                  type="password"
                  placeholder="..."
                  value={newProviderForm.secretAccessKey}
                  onChange={(e) =>
                    setNewProviderForm((prev) => ({
                      ...prev,
                      secretAccessKey: e.target.value,
                    }))
                  }
                />
              </div>

              <p className="text-sm text-muted-foreground">
                {t("settings.sync.credentialsSecurityNote")}
              </p>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowAddForm(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleAddProvider}>
                  <Save className="h-4 w-4 mr-2" />
                  {t("common.button.add")}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => !open && closeDeleteDialog()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("settings.sync.deleteProvider")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.sync.deleteProviderDescription", {
                name: deleteDialog.providerName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="confirm-provider-id">
              {t("settings.sync.typeToConfirm")}{" "}
              <code className="bg-muted px-1 rounded">
                {deleteDialog.providerId}
              </code>
            </Label>
            <Input
              id="confirm-provider-id"
              placeholder={t("settings.sync.confirmPlaceholder", {
                id: deleteDialog.providerId,
              })}
              value={deleteDialog.confirmInput}
              onChange={(e) =>
                setDeleteDialog((prev) => ({
                  ...prev,
                  confirmInput: e.target.value,
                }))
              }
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeleteDialog}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemoveProvider}
              disabled={deleteDialog.confirmInput !== deleteDialog.providerId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!isDesktopMode && (
        <p className="text-sm text-amber-600">
          {t("settings.sync.desktopOnly")}
        </p>
      )}
    </div>
  )
}
