"use client"

import * as React from "react"
import {
  Check,
  ChevronsUpDown,
  Cloud,
  FolderOpen,
  HardDrive,
  Loader2,
  PlusCircle,
  RefreshCw,
  Server,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import type { SpaceInfo } from "@/apps/web-app/hooks/use-current-space"
import { useGoto } from "@/apps/web-app/hooks/use-goto"
import { useSpace } from "@/apps/web-app/hooks/use-space"
import { useLastOpened } from "@/apps/web-app/pages/[database]/hook"

import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { RadioGroup, RadioGroupItem } from "./ui/radio-group"
import { Separator } from "./ui/separator"
import { Progress } from "@/components/ui/progress"

interface ISpaceSelectProps {
  spaces: SpaceInfo[]
}

const getRemotePathname = (remotePath?: string) => {
  // Remote path format: <providerid>/<bucketname>/<spaceid>
  // Return the full path for display
  return remotePath || ""
}

type WizardStep =
  | "choose-action"
  | "create-local-path"
  | "create-sync-options"
  | "clone-choose-provider"
  | "clone-select-space"
  | "clone-local-path"

type SpaceAction = "create" | "clone" | null

interface SyncProvider {
  id: string
  name: string
  endpoint?: string
  bucketName?: string
  hasCredentials: boolean
  isBuiltIn: boolean
}

export function SpaceSelect({ spaces }: ISpaceSelectProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const { spaceList, updateSpaceList } = useSpace()

  const { lastOpenedDatabase, setLastOpenedDatabase } = useLastOpened()
  const { space } = useCurrentPathInfo()

  const [searchValue, setSearchValue] = React.useState("")
  const [showNewSpaceDialog, setShowNewSpaceDialog] = React.useState(false)

  // Wizard state
  const [currentStep, setCurrentStep] = React.useState<WizardStep>("choose-action")
  const [selectedAction, setSelectedAction] = React.useState<SpaceAction>(null)
  const [providers, setProviders] = React.useState<SyncProvider[]>([])
  const [selectedProvider, setSelectedProvider] = React.useState<string | null>(null)
  const [remoteSpaces, setRemoteSpaces] = React.useState<string[]>([])
  const [selectedRemoteSpace, setSelectedRemoteSpace] = React.useState<string | null>(null)
  const [localPath, setLocalPath] = React.useState("")
  const [spaceName, setSpaceName] = React.useState("")
  const [enableSync, setEnableSync] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [loadingProviders, setLoadingProviders] = React.useState(false)
  const [loadingRemoteSpaces, setLoadingRemoteSpaces] = React.useState(false)

  // Clone progress dialog state
  const [showCloneProgressDialog, setShowCloneProgressDialog] = React.useState(false)
  const [cloneProgress, setCloneProgress] = React.useState(0)
  const [cloneStep, setCloneStep] = React.useState<string>("")
  const [cloneError, setCloneError] = React.useState<string | null>(null)
  const [clonedSpace, setClonedSpace] = React.useState<SpaceInfo | null>(null)
  const [cloneComplete, setCloneComplete] = React.useState(false)

  const resetWizard = () => {
    setCurrentStep("choose-action")
    setSelectedAction(null)
    setSelectedProvider(null)
    setRemoteSpaces([])
    setSelectedRemoteSpace(null)
    setLocalPath("")
    setSpaceName("")
    setEnableSync(false)
    setLoading(false)
    // Reset clone progress state
    setShowCloneProgressDialog(false)
    setCloneProgress(0)
    setCloneStep("")
    setCloneError(null)
    setClonedSpace(null)
    setCloneComplete(false)
  }

  // Load providers when needed
  const loadProviders = async () => {
    if (!isDesktopMode || typeof window === "undefined" || !window.eidos) return
    
    setLoadingProviders(true)
    try {
      const result = await window.eidos.invoke("get-sync-providers")
      if (result.success) {
        setProviders(result.providers || [])
      }
    } catch (error) {
      console.error("Failed to load providers:", error)
    } finally {
      setLoadingProviders(false)
    }
  }

  // Load remote spaces for selected provider
  const loadRemoteSpaces = async (providerId: string) => {
    if (!isDesktopMode || typeof window === "undefined" || !window.eidos) return
    
    setLoadingRemoteSpaces(true)
    try {
      const result = await window.eidos.invoke("list-remote-spaces", providerId)
      if (result.success && result.spaces) {
        setRemoteSpaces(result.spaces)
      } else {
        setRemoteSpaces([])
      }
    } catch (error) {
      console.error("Failed to load remote spaces:", error)
      setRemoteSpaces([])
    } finally {
      setLoadingRemoteSpaces(false)
    }
  }

  const goto = useGoto()

  const handleSelect = async (currentValue: string) => {
    setLastOpenedDatabase(currentValue)
    setOpen(false)

    if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
      try {
        const result = await window.eidos.invoke("switch-space", currentValue)
        if (!result.success) {
          console.error("Failed to switch space:", result.error)
        }
      } catch (error) {
        console.error("Error switching space:", error)
      }
    } else {
      window.location.href = `/${currentValue}`
    }
  }

  const handleSelectFolder = async () => {
    if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
      try {
        const folderPath = await window.eidos.selectFolder()
        if (folderPath) {
          setLocalPath(folderPath)
          // Extract folder name as default space name
          const folderName = folderPath.split(/[/\\]/).pop() || ""
          if (!spaceName && folderName) {
            setSpaceName(folderName)
          }
        }
      } catch (error) {
        console.error("Error selecting folder:", error)
      }
    }
  }

  const handleCreateSpace = async () => {
    if (!localPath) return

    setLoading(true)
    try {
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        let remoteUrl: string | undefined

        // Build remote URL only if sync is enabled and provider is selected
        if (enableSync && selectedProvider && selectedProvider !== "local") {
          const provider = providers.find((p) => p.id === selectedProvider)
          if (provider) {
            // Remote format: <provider-id>/<bucket-name>/<space-name>
            // For both eidos.space and custom providers, bucketName comes from credentials/config
            const bucketName = provider.bucketName || provider.id  // fallback to provider id
            remoteUrl = `${provider.id}/${bucketName}/${spaceName}`
          }
        }

        const result = await window.eidos.invoke("register-space", localPath, {
          customName: spaceName || undefined,
          remoteUrl,
        })

        if (result.success && result.space) {
          await updateSpaceList()
          await handleSelect(result.space.id as string)
        } else {
          throw new Error(result.error || "Failed to create space")
        }
      }
    } catch (error) {
      console.error("Error creating space:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      alert(`Failed to create space: ${errorMessage}`)
    } finally {
      setLoading(false)
      setShowNewSpaceDialog(false)
      resetWizard()
    }
  }

  const handleCloneSpace = async () => {
    if (!localPath || !selectedProvider || !selectedRemoteSpace) return

    setLoading(true)
    setShowNewSpaceDialog(false)
    setShowCloneProgressDialog(true)
    setCloneProgress(0)
    setCloneStep(t("space.clone.step.init", "Initializing..."))
    setCloneError(null)
    setCloneComplete(false)

    try {
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        // Build remote URL
        const provider = providers.find((p) => p.id === selectedProvider)
        
        // Remote format: <provider-id>/<bucket-name>/<space-name>
        const bucketName = provider?.bucketName || provider?.id || "default"
        const remoteSpaceName = selectedRemoteSpace.replace(/\/$/, "").split("/").pop() || selectedRemoteSpace
        const remoteUrl = `${provider?.id}/${bucketName}/${remoteSpaceName}`

        setCloneProgress(15)
        setCloneStep(t("space.clone.step.register", "Registering local space..."))

        // Use clone-space IPC to properly clone with sync
        const result = await window.eidos.invoke("clone-space", {
          localPath,
          remoteUrl,
          providerId: selectedProvider,
          spaceName: spaceName || undefined,
        })

        if (result.success && result.space) {
          setCloneProgress(60)
          setCloneStep(t("space.clone.step.initDatabase", "Initializing database..."))
          
          // Simulate the internal steps for better UX
          await new Promise(resolve => setTimeout(resolve, 300))
          
          setCloneProgress(75)
          setCloneStep(t("space.clone.step.setupSync", "Setting up sync configuration..."))
          
          await new Promise(resolve => setTimeout(resolve, 200))
          
          setCloneProgress(85)
          setCloneStep(t("space.clone.step.pullData", "Pulling data from remote..."))
          
          await new Promise(resolve => setTimeout(resolve, 300))
          
          setCloneProgress(95)
          setCloneStep(t("space.clone.step.finalize", "Finalizing setup..."))
          
          await new Promise(resolve => setTimeout(resolve, 200))

          setCloneProgress(100)
          setCloneStep(t("space.clone.completed", "Space cloned successfully!"))
          setCloneComplete(true)
          setClonedSpace(result.space as SpaceInfo)
          await updateSpaceList()
        } else {
          throw new Error(result.error || "Failed to clone space")
        }
      }
    } catch (error) {
      console.error("Error cloning space:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      setCloneError(errorMessage)
      setCloneStep(t("space.clone.failed", "Clone failed"))
    } finally {
      setLoading(false)
    }
  }

  const handleCloneComplete = async () => {
    if (clonedSpace) {
      await handleSelect(clonedSpace.id as string)
    }
    resetWizard()
  }

  const handleCloneErrorClose = () => {
    resetWizard()
  }

  // Navigation handlers
  const handleActionSelect = (action: SpaceAction) => {
    setSelectedAction(action)
    if (action === "create") {
      setCurrentStep("create-local-path")
    } else if (action === "clone") {
      setCurrentStep("clone-choose-provider")
      loadProviders()
    }
  }

  const handleCreateLocalPathNext = () => {
    if (!localPath) return
    setCurrentStep("create-sync-options")
    loadProviders()
  }

  const handleProviderSelectForCreate = (providerId: string) => {
    setSelectedProvider(providerId)
  }

  const handleProviderSelectForClone = (providerId: string) => {
    setSelectedProvider(providerId)
    setCurrentStep("clone-select-space")
    loadRemoteSpaces(providerId)
  }

  const handleRemoteSpaceSelect = (spacePath: string) => {
    setSelectedRemoteSpace(spacePath)
    // Don't set spaceName here - let the local folder name be used
    // The spaceName will be extracted from localPath in handleSelectFolder
    setCurrentStep("clone-local-path")
  }

  const handleBack = () => {
    switch (currentStep) {
      case "create-local-path":
        setCurrentStep("choose-action")
        setSelectedAction(null)
        break
      case "create-sync-options":
        setCurrentStep("create-local-path")
        setEnableSync(false)
        setSelectedProvider(null)
        break
      case "clone-choose-provider":
        setCurrentStep("choose-action")
        setSelectedAction(null)
        break
      case "clone-select-space":
        setCurrentStep("clone-choose-provider")
        setSelectedProvider(null)
        setSelectedRemoteSpace(null)
        break
      case "clone-local-path":
        setCurrentStep("clone-select-space")
        setSelectedRemoteSpace(null)
        break
    }
  }

  // Render wizard steps
  const renderWizardContent = () => {
    switch (currentStep) {
      case "choose-action":
        return (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Choose how you want to set up your space.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => handleActionSelect("create")}
                className="flex items-start gap-4 rounded-lg border p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="rounded-full bg-primary/10 p-2">
                  <HardDrive className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Create New Space</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create a new local space. Sync to remote is optional.
                  </p>
                </div>
              </button>
              <button
                onClick={() => handleActionSelect("clone")}
                className="flex items-start gap-4 rounded-lg border p-4 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="rounded-full bg-primary/10 p-2">
                  <RefreshCw className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">Clone Space</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Clone an existing space from a remote provider.
                  </p>
                </div>
              </button>
            </div>
          </div>
        )

      case "create-local-path":
        return (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Choose a local folder for your new space. Data will be stored locally by default.
            </p>
            <div className="space-y-2">
              <Label htmlFor="folder-path">Local Folder</Label>
              <div className="flex gap-2">
                <Input
                  id="folder-path"
                  placeholder="Select a folder..."
                  value={localPath}
                  readOnly
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={handleSelectFolder}>
                  Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your data will be stored in this folder. You can optionally enable sync in the next step.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleCreateLocalPathNext}
                disabled={!localPath}
                className="flex-1"
              >
                Continue
              </Button>
            </div>
          </div>
        )

      case "create-sync-options":
        // Separate built-in and custom providers
        const builtInProviders = providers.filter((p) => p.isBuiltIn)
        const customProviders = providers.filter((p) => !p.isBuiltIn)
        const hasAnySyncProvider = builtInProviders.length > 0 || customProviders.length > 0
        
        return (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Sync is optional. Enable it if you want to backup or sync this space across devices.
            </p>
            
            {/* Enable Sync Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <Cloud className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Enable Sync</p>
                  <p className="text-xs text-muted-foreground">
                    Sync this space to a remote provider
                  </p>
                </div>
              </div>
              <Switch
                checked={enableSync}
                onCheckedChange={setEnableSync}
              />
            </div>

            {/* Provider Selection - only show if sync is enabled */}
            {enableSync && (
              <div className="space-y-3">
                <Label>Select Sync Provider</Label>
                {loadingProviders ? (
                  <div className="text-sm text-muted-foreground">{t("space.createSync.loadingProviders", "Loading providers...")}</div>
                ) : providers.filter(p => p.hasCredentials).length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4 bg-muted/30 rounded-lg">
                    <p className="font-medium mb-1">{t("space.createSync.noProvidersAvailable", "No sync providers available")}</p>
                    <p className="text-xs">
                      {t("space.createSync.goToSettings", "Go to Settings → Sync to add S3-compatible storage")}
                    </p>
                  </div>
                ) : (
                  <RadioGroup
                    value={selectedProvider || ""}
                    onValueChange={handleProviderSelectForCreate}
                    className="space-y-2"
                  >
                    {/* Built-in providers (eidos.space) - only show if has credentials */}
                    {builtInProviders.filter(p => p.hasCredentials).map((provider) => (
                      <div key={provider.id}>
                        <div
                          className={cn(
                            "flex items-center space-x-2 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer"
                          )}
                        >
                          <RadioGroupItem
                            value={provider.id}
                            id={provider.id}
                          />
                          <label
                            htmlFor={provider.id}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Cloud className="h-4 w-4 text-primary" />
                              <span className="font-medium">{provider.id}</span>
                              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                {t("settings.sync.builtIn", "Built-in")}
                              </span>
                            </div>
                          </label>
                        </div>
                      </div>
                    ))}

                    {/* Custom S3 providers - only show if has credentials */}
                    {customProviders.filter(p => p.hasCredentials).length > 0 && builtInProviders.filter(p => p.hasCredentials).length > 0 && (
                      <Separator className="my-2" />
                    )}
                    
                    {customProviders.filter(p => p.hasCredentials).map((provider) => (
                      <div key={provider.id}>
                        <div
                          className={cn(
                            "flex items-center space-x-2 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer"
                          )}
                        >
                          <RadioGroupItem
                            value={provider.id}
                            id={provider.id}
                          />
                          <label
                            htmlFor={provider.id}
                            className="flex-1 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{provider.id}</span>
                            </div>
                          </label>
                        </div>
                      </div>
                    ))}
                  </RadioGroup>
                )}


              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                {t("common.back", "Back")}
              </Button>
              <Button
                onClick={handleCreateSpace}
                disabled={loading || (enableSync && !selectedProvider)}
                className="flex-1"
              >
                {loading ? t("common.creating", "Creating...") : enableSync ? t("space.createSync.createAndEnable", "Create & Enable Sync") : t("space.createSpace", "Create Space")}
              </Button>
            </div>
          </div>
        )

      case "clone-choose-provider":
        const cloneBuiltInProviders = providers.filter((p) => p.isBuiltIn)
        const cloneCustomProviders = providers.filter((p) => !p.isBuiltIn)
        
        return (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {t("space.clone.selectProviderDescription", "Select the provider where your remote space is stored.")}
            </p>
            {loadingProviders ? (
              <div className="text-sm text-muted-foreground">{t("space.clone.loadingProviders", "Loading providers...")}</div>
            ) : providers.filter(p => p.hasCredentials).length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                {t("space.clone.noProvidersConfigured", "No sync providers with credentials configured.")}
                <br />
                {t("space.clone.goToSettings", "Go to Settings → Sync to add providers.")}
              </div>
            ) : (
              <RadioGroup
                value={selectedProvider || ""}
                onValueChange={handleProviderSelectForClone}
                className="space-y-2"
              >
                {/* All providers - mixed with built-in tag */}
                {providers.filter(p => p.hasCredentials).map((provider) => (
                  <div key={provider.id}>
                    <div
                      className={cn(
                        "flex items-center space-x-2 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer"
                      )}
                    >
                      <RadioGroupItem
                        value={provider.id}
                        id={provider.id}
                      />
                      <label
                        htmlFor={provider.id}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          {provider.isBuiltIn ? (
                            <Cloud className="h-4 w-4 text-primary" />
                          ) : (
                            <Server className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="font-medium">{provider.name}</span>
                          {provider.isBuiltIn && (
                            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                              {t("settings.sync.builtIn", "Built-in")}
                            </span>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                ))}
              </RadioGroup>
            )}
            <Button variant="outline" onClick={handleBack} className="w-full">
              {t("common.back", "Back")}
            </Button>
          </div>
        )

      case "clone-select-space":
        return (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Select a space to clone from {providers.find(p => p.id === selectedProvider)?.name}.
            </p>
            {loadingRemoteSpaces ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <span className="text-sm">Loading remote spaces...</span>
              </div>
            ) : remoteSpaces.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">
                No remote spaces found.
                <br />
                Make sure you have spaces synced to this provider.
              </div>
            ) : (
              <RadioGroup
                value={selectedRemoteSpace || ""}
                onValueChange={handleRemoteSpaceSelect}
                className="space-y-2 max-h-48 overflow-y-auto"
              >
                {remoteSpaces.map((remoteSpace) => {
                  const spaceName = remoteSpace.replace(/\/$/, "").split("/").pop() || remoteSpace
                  return (
                    <div key={remoteSpace}>
                      <div className="flex items-center space-x-2 rounded-lg border p-3 hover:bg-muted/50 cursor-pointer">
                        <RadioGroupItem value={remoteSpace} id={remoteSpace} />
                        <label htmlFor={remoteSpace} className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{spaceName}</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )
                })}
              </RadioGroup>
            )}
            <Button variant="outline" onClick={handleBack} className="w-full">
              Back
            </Button>
          </div>
        )

      case "clone-local-path":
        return (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Choose a local folder to clone <strong>{selectedRemoteSpace?.replace(/\/$/, "").split("/").pop()}</strong> into.
            </p>
            <div className="space-y-2">
              <Label htmlFor="clone-folder-path">Local Folder</Label>
              <div className="flex gap-2">
                <Input
                  id="clone-folder-path"
                  placeholder="Select a folder..."
                  value={localPath}
                  readOnly
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={handleSelectFolder}>
                  Browse
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleBack} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleCloneSpace}
                disabled={!localPath || loading}
                className="flex-1"
              >
                {loading ? "Cloning..." : "Clone Space"}
              </Button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const getDialogTitle = () => {
    switch (currentStep) {
      case "choose-action":
        return "Add Space"
      case "create-local-path":
        return "Create Space - Local Folder"
      case "create-sync-options":
        return "Create Space - Sync Options"
      case "clone-choose-provider":
        return "Clone Space - Select Provider"
      case "clone-select-space":
        return "Clone Space - Select Remote"
      case "clone-local-path":
        return "Clone Space - Local Folder"
      default:
        return "Add Space"
    }
  }

  return (
    <Dialog
      open={showNewSpaceDialog}
      onOpenChange={(open) => {
        setShowNewSpaceDialog(open)
        if (!open) resetWizard()
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            role="combobox"
            size="sm"
            aria-expanded={open}
            className="w-full min-w-[180px] justify-start h-auto py-2 gap-2"
          >
            {space ? (
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-80" />
                <span className="truncate font-medium">
                  {spaces.find((s) => s.id === space)?.name || space}
                </span>
              </div>
            ) : (
              t("space.select.selectDatabase")
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full min-w-[180px] p-0">
          <Command>
            <CommandInput
              placeholder={t("space.select.searchDatabase")}
              value={searchValue}
              onValueChange={setSearchValue}
              autoFocus
            />
            <CommandList>
              <CommandEmpty>
                <div>{t("common.noResultsFound")}</div>
              </CommandEmpty>
              <CommandGroup>
                {spaces.map((space) => (
                  <CommandItem
                    key={space.id}
                    value={space.id}
                    onSelect={(currentValue) => {
                      handleSelect(currentValue)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        lastOpenedDatabase === space.id
                          ? "opacity-100"
                          : "opacity-0"
                      )}
                    />
                    <div className="flex items-center justify-between w-full overflow-hidden">
                      <span className="truncate shrink-0 mr-2">
                        {space.name}
                      </span>
                      {space.sync?.enabled && space.sync.remote && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {getRemotePathname(space.sync.remote)}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <DialogTrigger asChild>
                  <CommandItem
                    value="create-new"
                    onSelect={() => {
                      setOpen(false)
                      setShowNewSpaceDialog(true)
                      resetWizard()
                    }}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    <span>{t("space.select.createNew")}</span>
                  </CommandItem>
                </DialogTrigger>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>
            {isDesktopMode
              ? "Set up a new space for your data."
              : "Space management is only available in the desktop app."}
          </DialogDescription>
        </DialogHeader>

        {isDesktopMode ? (
          renderWizardContent()
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>Please use the desktop app to create or clone spaces.</p>
          </div>
        )}
      </DialogContent>

      {/* Clone Progress Dialog */}
      <Dialog
        open={showCloneProgressDialog}
        onOpenChange={(open) => {
          if (!open && cloneComplete) {
            handleCloneComplete()
          } else if (!open && cloneError) {
            handleCloneErrorClose()
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px]" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {cloneError
                ? t("space.clone.failed", "Clone Failed")
                : cloneComplete
                ? t("space.clone.success", "Clone Complete")
                : t("space.clone.inProgress", "Cloning Space...")}
            </DialogTitle>
            <DialogDescription>
              {cloneError
                ? t("space.clone.errorDescription", "An error occurred while cloning the space.")
                : cloneComplete
                ? t("space.clone.successDescription", "The space has been cloned successfully.")
                : t("space.clone.progressDescription", "Please wait while we clone the space to your local machine.")}
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-4">
            {cloneError ? (
              <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg">
                <div className="text-destructive text-sm">
                  <p className="font-medium">{t("space.clone.error", "Error:")}</p>
                  <p className="mt-1">{cloneError}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{cloneStep}</span>
                  <span className="font-medium">{cloneProgress}%</span>
                </div>
                <Progress value={cloneProgress} className="h-2" />
              </>
            )}
          </div>

          <DialogFooter>
            {cloneError ? (
              <Button onClick={handleCloneErrorClose} className="w-full">
                {t("common.close", "Close")}
              </Button>
            ) : cloneComplete ? (
              <Button onClick={handleCloneComplete} className="w-full">
                <Check className="mr-2 h-4 w-4" />
                {t("space.clone.goToSpace", "Go to Space")}
              </Button>
            ) : (
              <Button disabled className="w-full">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("space.clone.cloning", "Cloning...")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
