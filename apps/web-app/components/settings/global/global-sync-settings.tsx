import { useEffect, useState } from "react"
import { Check, ExternalLink, Save, Server, Trash2, Plus, Cloud, AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"

import { useAuthOptional } from "@/components/auth-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { isDesktopMode } from "@/lib/env"

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

  // Sync config state (only contains custom providers, eidos.space is built-in)
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({
    providers: {},
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isInitializing, setIsInitializing] = useState(false)
  // Track credentials for all providers including built-in eidos.space
  const [eidosSpaceCredentials, setEidosSpaceCredentials] = useState(false)
  const [customProviderCredentials, setCustomProviderCredentials] = useState<Record<string, boolean>>({})

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
        const eidosCreds = await window.eidos.credentials.hasSyncCredentials("eidos.space")
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

  // Set default provider
  const handleSetDefault = async (id: string) => {
    try {
      const newConfig: SyncConfig = {
        ...syncConfig,
        defaultProvider: id,
      }
      await window.eidos.config.set("sync", newConfig)
      setSyncConfig(newConfig)

      const providerName = id === "eidos.space" ? "eidos.space" : syncConfig.providers[id]?.name || id
      toast({
        title: "Default Provider Updated",
        description: `"${providerName}" is now the default.`,
      })
    } catch (error) {
      console.error("Failed to set default provider:", error)
      toast({
        title: "Error",
        description: "Failed to update default provider.",
        variant: "destructive",
      })
    }
  }

  // Test S3 connection
  const handleTestConnection = async (providerId: string) => {
    const provider = syncConfig.providers[providerId]
    if (!provider) return

    try {
      const credentials = await window.eidos.credentials.getSyncCredentials(providerId)
      if (!credentials) {
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
        toast({
          title: "Success",
          description: "Connection successful!",
        })
      } else {
        toast({
          title: "Connection Failed",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
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
    <div className="space-y-6">
      {/* Providers List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Sync Providers</h3>
          <Button
            size="sm"
            onClick={() => setShowAddForm(true)}
            disabled={showAddForm}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Custom Provider
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Configure sync providers. eidos.space is available by default. Add custom S3-compatible providers as needed.
        </p>

        {/* Built-in: eidos.space */}
        <div
          className={`p-4 rounded-lg border ${
            isEidosSpaceDefault
              ? "border-primary bg-primary/5"
              : "border-border"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Cloud className="h-5 w-5 text-blue-500 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">eidos.space</span>
                  <Badge variant="secondary">Built-in</Badge>
                  {isEidosSpaceDefault && (
                    <Badge variant="default">Default</Badge>
                  )}
                  {eidosSpaceCredentials ? (
                    <Badge variant="secondary" className="text-green-600">
                      <Check className="h-3 w-3 mr-1" />
                      Ready
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-orange-600">
                      Not Connected
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Managed cloud storage by eidos.space
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {!isEidosSpaceDefault && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleSetDefault("eidos.space")}
                  className="h-7 px-2 text-xs whitespace-nowrap"
                >
                  Set Default
                </Button>
              )}
              {!eidosSpaceCredentials && (
                <Button
                  size="xs"
                  onClick={initializeEidosSync}
                  disabled={isInitializing || !isAuthenticated}
                  className="h-7 px-2 text-xs whitespace-nowrap"
                >
                  {isInitializing ? "Connecting..." : "Connect"}
                </Button>
              )}
            </div>
          </div>
          {!isAuthenticated && !eidosSpaceCredentials && (
            <p className="text-sm text-orange-600 mt-2">
              Please login to eidos.space in Account settings first.
            </p>
          )}
        </div>

        {/* Custom Provider Cards */}
        {customProviders.map((provider) => (
          <div
            key={provider.id}
            className={`p-4 rounded-lg border ${
              syncConfig.defaultProvider === provider.id
                ? "border-primary bg-primary/5"
                : "border-border"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Server className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{provider.name}</span>
                    {syncConfig.defaultProvider === provider.id && (
                      <Badge variant="default">Default</Badge>
                    )}
                    {customProviderCredentials[provider.id] ? (
                      <Badge variant="secondary" className="text-green-600">
                        <Check className="h-3 w-3 mr-1" />
                        Ready
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600">
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
                  className="h-7 px-2 text-xs whitespace-nowrap"
                >
                  Test
                </Button>
                {syncConfig.defaultProvider !== provider.id && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleSetDefault(provider.id)}
                    className="h-7 px-2 text-xs"
                  >
                    Set Default
                  </Button>
                )}
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
        ))}

        {customProviders.length === 0 && !showAddForm && (
          <div className="p-8 text-center border border-dashed rounded-lg">
            <Server className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">No custom providers</p>
            <p className="text-sm text-muted-foreground">
              Add a custom S3-compatible provider if needed
            </p>
          </div>
        )}
      </div>

      {/* Add Provider Form */}
      {showAddForm && (
        <div className="p-4 rounded-lg border space-y-4">
          <h4 className="font-medium">Add S3-Compatible Provider</h4>

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
              Unique identifier for this provider (lowercase, no spaces). This will be used as the display name.
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
              Add Provider
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
              <strong>"{deleteDialog.providerName}"</strong>? This action cannot be
              undone. All sync data will remain in the bucket, but the provider
              configuration will be removed.
            </p>

            <div className="space-y-2 mb-4">
              <Label htmlFor="confirm-provider-id">
                Type <code className="bg-muted px-1 rounded">{deleteDialog.providerId}</code> to confirm
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
