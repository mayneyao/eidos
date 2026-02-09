import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Check,
  Cloud,
  ExternalLink,
  Lock,
  Loader2,
  Plus,
  Save,
  Server,
  Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { useActivation } from "@/hooks/use-activation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { useAuthOptional } from "@/components/auth-provider"

// Provider config for custom S3 providers (eidos.space is built-in, not stored here)
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

// Sync initialization response types
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
  const auth = useAuthOptional()
  const { license, isLoading: isLicenseLoading } = useActivation()
  const hasValidLicense = license !== null

  // Sync config state (only contains custom providers, eidos.space is built-in)
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    providers: {},
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isInitializing, setIsInitializing] = useState(false)
  // Track credentials for all providers including built-in eidos.space
  const [eidosSpaceCredentials, setEidosSpaceCredentials] = useState(false)
  const [customProviderCredentials, setCustomProviderCredentials] = useState<
    Record<string, boolean>
  >({})
  // Track test status for providers: 'untested' | 'testing' | 'success' | 'error'
  const [providerTestStatus, setProviderTestStatus] = useState<
    Record<string, 'untested' | 'testing' | 'success' | 'error'>
  >({})

  // New provider form state (name is auto-generated from id)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newProviderForm, setNewProviderForm] = useState({
    id: "",
    endpoint: "",
    bucketName: "",
    region: "",
    accessKeyId: "",
    secretAccessKey: "",
  })

  // Delete confirmation dialog state
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

  // Load sync config on mount
  useEffect(() => {
    async function loadSyncConfig() {
      if (!isDesktopMode || !window.eidos?.config) {
        setIsLoading(false)
        return
      }

      try {
        // Load sync config (only custom providers)
        const config = await window.eidos.config.get("sync")
        if (config) {
          setSyncConfig(config)
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

    loadSyncConfig()
  }, [])

  // Get auth headers
  const getAuthHeaders = (): Record<string, string> => {
    if (auth?.accessToken) {
      return { Authorization: `Bearer ${auth.accessToken}` }
    }
    return {}
  }

  // Initialize eidos.space sync
  const initializeEidosSync = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please login to eidos.space in Account settings first.",
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
        // Store credentials for eidos.space
        await window.eidos.credentials.setSyncCredentials(
          data.data,
          "eidos.space"
        )
        setEidosSpaceCredentials(true)

        // If no default provider, set eidos.space as default
        if (!syncConfig.defaultProvider) {
          const newConfig: SyncConfig = {
            ...syncConfig,
            defaultProvider: "eidos.space",
          }
          await window.eidos.config.set("sync", newConfig)
          setSyncConfig(newConfig)
        }

        toast({
          title: "Sync Initialized",
          description: `Your bucket "${data.data.bucketName}" is ready.`,
        })
      }
    } catch (error) {
      console.error("Failed to initialize sync:", error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      toast({
        title: "Sync Initialization Failed",
        description: errorMessage || "Unknown error occurred",
        variant: "destructive",
      })
    } finally {
      setIsInitializing(false)
    }
  }

  // Add new S3 provider
  const handleAddProvider = async () => {
    // Check license for custom provider feature
    if (!hasValidLicense) {
      toast({
        title: "License Required",
        description:
          "Adding custom sync providers requires an active license. Please activate your license in Account settings.",
        variant: "destructive",
      })
      return
    }

    if (!newProviderForm.id) {
      toast({
        title: "Error",
        description: "Provider ID is required.",
        variant: "destructive",
      })
      return
    }

    if (!newProviderForm.endpoint || !newProviderForm.bucketName) {
      toast({
        title: "Error",
        description: "Endpoint and bucket name are required.",
        variant: "destructive",
      })
      return
    }

    if (!newProviderForm.accessKeyId || !newProviderForm.secretAccessKey) {
      toast({
        title: "Error",
        description: "Access key and secret key are required.",
        variant: "destructive",
      })
      return
    }

    try {
      // Save credentials
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

      // Add provider to config (use id as name)
      const providerConfig: ProviderConfig = {
        id: newProviderForm.id,
        name: newProviderForm.id, // Use id as display name
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

      // Reset form
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
        title: "Provider Added",
        description: `"${newProviderForm.id}" has been added.`,
      })
    } catch (error) {
      console.error("Failed to add provider:", error)
      toast({
        title: "Error",
        description: "Failed to add provider.",
        variant: "destructive",
      })
    }
  }

  // Open delete confirmation dialog
  const openDeleteDialog = (id: string, name: string) => {
    setDeleteDialog({
      isOpen: true,
      providerId: id,
      providerName: name,
      confirmInput: "",
    })
  }

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    setDeleteDialog({
      isOpen: false,
      providerId: "",
      providerName: "",
      confirmInput: "",
    })
  }

  // Confirm and remove provider
  const confirmRemoveProvider = async () => {
    const id = deleteDialog.providerId
    if (deleteDialog.confirmInput !== id) {
      toast({
        title: "Confirmation Failed",
        description: "Provider ID does not match.",
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
        title: "Provider Removed",
        description: `Provider "${id}" has been removed.`,
      })
    } catch (error) {
      console.error("Failed to remove provider:", error)
      toast({
        title: "Error",
        description: "Failed to remove provider.",
        variant: "destructive",
      })
    }
  }

  // Test S3 connection
  const handleTestConnection = async (providerId: string) => {
    const provider = syncConfig.providers[providerId]
    if (!provider) return

    setProviderTestStatus(prev => ({ ...prev, [providerId]: 'testing' }))

    try {
      const credentials =
        await window.eidos.credentials.getSyncCredentials(providerId)
      if (!credentials) {
        setProviderTestStatus(prev => ({ ...prev, [providerId]: 'error' }))
        toast({
          title: "No Credentials",
          description: "Credentials not found for this provider.",
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
        setProviderTestStatus(prev => ({ ...prev, [providerId]: 'success' }))
        toast({
          title: "Success",
          description: "Connection successful!",
        })
      } else {
        setProviderTestStatus(prev => ({ ...prev, [providerId]: 'error' }))
        toast({
          title: "Connection Failed",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      setProviderTestStatus(prev => ({ ...prev, [providerId]: 'error' }))
      toast({
        title: "Error",
        description: "Failed to test connection.",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <div className="py-6 text-sm text-muted-foreground">
        Loading sync settings...
      </div>
    )
  }

  const customProviders = Object.values(syncConfig.providers)
  const isEidosSpaceDefault = syncConfig.defaultProvider === "eidos.space"

  return (
    <div className="space-y-0">
      {/* Providers Section */}
      <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h3 className="text-lg font-medium">{t("settings.sync.provider", "Provider")}</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
          disabled={showAddForm || !hasValidLicense}
          title={
            !hasValidLicense
              ? "License required to add custom providers"
              : undefined
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("common.button.add", "Add")}
        </Button>
      </div>

      <hr className="border-border" />

      <div className="py-4 lg:py-6">
        <div className="space-y-4">
          {/* License Required Banner */}
          {!hasValidLicense && !isLicenseLoading && isDesktopMode && (
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    {t("settings.sync.licenseRequired", "License Required")}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    {t("settings.sync.licenseRequiredDescription", "Custom sync providers require an active license.")}
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-amber-700 dark:text-amber-300 mt-2"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("settings-navigate", { detail: "account" })
                      )
                    }
                  >
                    {t("settings.sync.goToAccountSettings", "Go to Account Settings →")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-0.5">
            <p className="text-sm text-muted-foreground">
              {t("settings.sync.providerDescription")}
            </p>
          </div>

        {/* Built-in: eidos.space - Temporarily Disabled */}
        <div className="p-4 rounded-lg border border-muted bg-muted/30 opacity-60">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Cloud className="h-5 w-5 text-blue-500 shrink-0" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">eidos.space</span>
                  <Badge variant="secondary">Built-in</Badge>
                  {eidosSpaceCredentials ? (
                    <Badge variant="secondary" className="text-green-600">
                      <Check className="h-3 w-3 mr-1" />
                      {t("settings.sync.ready", "Ready")}
                    </Badge>
                  ) : (
                    <>
                      <Badge variant="outline" className="text-orange-600">
                        {t("settings.sync.notConnected", "Not Connected")}
                      </Badge>
                      <Badge variant="outline" className="text-muted-foreground">
                        {t("settings.sync.temporarilyUnavailable", "Temporarily unavailable")}
                      </Badge>
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("settings.sync.managedCloudStorageBy", "Managed cloud storage by eidos.space")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="xs"
                disabled
                className="h-7 px-2 text-xs whitespace-nowrap"
              >
                {eidosSpaceCredentials ? t("settings.sync.connected", "Connected") : t("settings.sync.connect", "Connect")}
              </Button>
            </div>
          </div>
        </div>

        {/* Custom Provider Cards */}
        {customProviders.map((provider) => {
          const testStatus = providerTestStatus[provider.id] || 'untested'
          const hasCredentials = customProviderCredentials[provider.id]
          const isTesting = testStatus === 'testing'
          const isTestSuccess = testStatus === 'success'
          
          return (
            <div
              key={provider.id}
              className="p-4 rounded-lg border border-border"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Server className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{provider.name}</span>
                      {isTestSuccess ? (
                        <Badge variant="secondary" className="text-green-600 shrink-0">
                          <Check className="h-3 w-3 mr-1" />
                          Ready
                        </Badge>
                      ) : hasCredentials ? (
                        <Badge variant="outline" className="text-blue-600 shrink-0">
                          Credentials Set
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-600 shrink-0">
                          No Credentials
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
                    size="xs"
                    onClick={() => handleTestConnection(provider.id)}
                    disabled={isTesting}
                    className="h-7 w-16 px-2 text-xs whitespace-nowrap"
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </>
                    ) : (
                      'Test'
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => openDeleteDialog(provider.id, provider.name)}
                    className="h-7 w-7 p-0"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}

        {customProviders.length === 0 && !showAddForm && (
          <div className="p-8 text-center border border-dashed rounded-lg">
            <Server className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">{t("settings.sync.noProviders", "No providers")}</p>
            <p className="text-sm text-muted-foreground">
              {t("settings.sync.addProviderIfNeeded", "Add a provider if needed")}
            </p>
          </div>
        )}
        </div>
      </div>

      {/* Add Provider Form */}
      {showAddForm && (
        <div className="p-4 rounded-lg border space-y-4">
          <h4 className="font-medium">{t("settings.sync.addProvider", "Add Provider")}</h4>

          <div className="space-y-2">
            <Label htmlFor="provider-id">
              Provider ID <span className="text-red-500">*</span>
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
              Unique identifier for this provider (lowercase, no spaces). This
              will be used as the display name.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider-endpoint">
              Endpoint URL <span className="text-red-500">*</span>
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
              Bucket Name <span className="text-red-500">*</span>
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
            <Label htmlFor="provider-region">Region (Optional)</Label>
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
              Access Key ID <span className="text-red-500">*</span>
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
              Secret Access Key <span className="text-red-500">*</span>
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
            Your credentials are encrypted and stored locally. They are never
            sent to any third party.
          </p>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddProvider}>
              <Save className="h-4 w-4 mr-2" />
              {t("common.button.add", "Add")}
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <h3 className="text-lg font-semibold">Delete Provider</h3>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete provider{" "}
              <strong>"{deleteDialog.providerName}"</strong>? This action cannot
              be undone. All sync data will remain in the bucket, but the
              provider configuration will be removed.
            </p>

            <div className="space-y-2 mb-4">
              <Label htmlFor="confirm-provider-id">
                Type{" "}
                <code className="bg-muted px-1 rounded">
                  {deleteDialog.providerId}
                </code>{" "}
                to confirm
              </Label>
              <Input
                id="confirm-provider-id"
                placeholder={`Enter "${deleteDialog.providerId}" to confirm`}
                value={deleteDialog.confirmInput}
                onChange={(e) =>
                  setDeleteDialog((prev) => ({
                    ...prev,
                    confirmInput: e.target.value,
                  }))
                }
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={closeDeleteDialog}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmRemoveProvider}
                disabled={deleteDialog.confirmInput !== deleteDialog.providerId}
              >
                Delete Provider
              </Button>
            </div>
          </div>
        </div>
      )}

      {!isDesktopMode && (
        <p className="text-sm text-orange-600">
          Sync configuration is only available in the desktop application.
        </p>
      )}
    </div>
  )
}
