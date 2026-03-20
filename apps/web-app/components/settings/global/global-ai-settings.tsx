import { Suspense, lazy, useState } from "react"
import type { LLMProvider } from "@/packages/ai/config"
import { ALL_PROVIDERS, type LLMProviderType } from "@/packages/ai/helper"
import { Edit, Plus, Trash2, AlertTriangle, Bot, Sparkles } from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/use-toast"
import { useAIConfigStore } from "@/components/settings/stores"

import { AIProviderModal } from "./ai/ai-provider-modal"
import { AITaskConfigForm } from "./ai/ai-task-form"

// lazy import ProviderIcon
const ProviderIcon = lazy(() => import("./ai/provider-icon"))

export function GlobalAISettings() {
  const { t } = useTranslation()
  const { aiConfig, addLLMProvider, updateLLMProvider, removeLLMProvider } =
    useAIConfigStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<
    LLMProvider | undefined
  >()
  const [selectedProviderType, setSelectedProviderType] = useState<
    LLMProviderType | undefined
  >()
  const [isFormDirty, setIsFormDirty] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null)

  const configuredProviderTypes = new Set<LLMProviderType>(
    aiConfig.llmProviders.map((p) => p.type)
  )

  const handleAddProvider = (providerType: LLMProviderType) => {
    const existingProviders = aiConfig.llmProviders.filter(
      (p) => p.type === providerType
    )
    let newProviderName: string = providerType
    let count = 1
    while (
      aiConfig.llmProviders.some((p) => p.name === newProviderName) ||
      existingProviders.some((p) => p.name === newProviderName)
    ) {
      newProviderName = `${providerType}-${count}`
      count++
    }

    setSelectedProviderType(providerType)
    setEditingProvider({
      type: providerType,
      name: newProviderName,
      apiKey: "",
      baseUrl: providerType === "ollama" ? "http://localhost:11434/v1" : "",
      models: "",
      enabled: true,
    })
    setIsModalOpen(true)
  }

  const handleEditProvider = (provider: LLMProvider) => {
    setEditingProvider(provider)
    setSelectedProviderType(undefined)
    setIsModalOpen(true)
  }

  const handleSaveProvider = async (provider: LLMProvider) => {
    try {
      // Check if provider already exists in the config
      const existingProvider = aiConfig.llmProviders.find(
        (p) => p.name === provider.name
      )

      if (existingProvider) {
        // Update existing provider
        updateLLMProvider(provider)
        toast({
          title: t("common.success"),
          description: t("settings.ai.providerUpdatedSuccess", {
            name: provider.name,
          }),
        })
      } else {
        // Add new provider
        addLLMProvider(provider)
        toast({
          title: t("common.success"),
          description: t("settings.ai.providerAddedSuccess", {
            name: provider.name,
          }),
        })
      }
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("settings.ai.providerSaveError"),
        variant: "destructive",
      })
    }
  }

  const handleDeleteProvider = (providerName: string) => {
    setProviderToDelete(providerName)
    setIsDeleteDialogOpen(true)
  }

  const confirmDeleteProvider = async () => {
    if (!providerToDelete) return

    try {
      removeLLMProvider(providerToDelete)
      toast({
        title: t("common.success"),
        description: t("settings.ai.providerDeletedSuccess", {
          name: providerToDelete,
        }),
      })
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("settings.ai.providerDeleteError"),
        variant: "destructive",
      })
    } finally {
      setIsDeleteDialogOpen(false)
      setProviderToDelete(null)
    }
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingProvider(undefined)
    setSelectedProviderType(undefined)
  }

  return (
    <div className="space-y-0">
      {/* Provider Section */}
      <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">{t("settings.ai.provider")}</h3>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t("common.button.add")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            {ALL_PROVIDERS.map((type) => (
              <DropdownMenuItem
                key={type}
                onSelect={() => handleAddProvider(type)}
                className="flex items-center gap-2"
                disabled={
                  type !== "openai-compatible" &&
                  type !== "ollama" &&
                  configuredProviderTypes.has(type)
                }
              >
                <Suspense fallback={<div className="w-4 h-4" />}>
                  <ProviderIcon type={type} />
                </Suspense>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("settings.ai.providerDescription")}
          </p>

          {aiConfig.llmProviders.length === 0 ? (
            <div className="p-8 text-center border border-dashed rounded-lg">
              <Bot className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-1">
                {t("settings.ai.noProviders", "No providers configured")}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {t(
                  "settings.ai.addProviderHint",
                  "Add an LLM provider to start using AI features"
                )}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {t("settings.ai.addProvider", "Add Provider")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" side="bottom">
                  {ALL_PROVIDERS.map((type) => (
                    <DropdownMenuItem
                      key={type}
                      onSelect={() => handleAddProvider(type)}
                      className="flex items-center gap-2"
                      disabled={
                        type !== "openai-compatible" &&
                        type !== "ollama" &&
                        configuredProviderTypes.has(type)
                      }
                    >
                      <Suspense fallback={<div className="w-4 h-4" />}>
                        <ProviderIcon type={type} />
                      </Suspense>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <div className="space-y-3">
              {aiConfig.llmProviders.map((provider) => {
                const models = provider.models
                  ? provider.models.split(",").map((m) => m.trim())
                  : []
                const displayModels = models.slice(0, 3)
                const remainingCount = models.length - 3

                return (
                  <div
                    key={provider.name}
                    className="p-4 rounded-lg border hover:border-primary/50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {/* Icon & Name */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-md bg-muted shrink-0">
                          <Suspense fallback={<div className="w-4 h-4" />}>
                            <ProviderIcon type={provider.type} isActive />
                          </Suspense>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {provider.name}
                          </p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {provider.type}
                          </p>
                        </div>
                      </div>

                      {/* Models */}
                      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                        {models.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {displayModels.map((model) => (
                              <Badge
                                key={model}
                                variant="secondary"
                                className="text-xs font-normal"
                              >
                                {model}
                              </Badge>
                            ))}
                            {remainingCount > 0 && (
                              <span className="text-xs text-muted-foreground">
                                +{remainingCount}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            {t("settings.ai.noModelsConfigured")}
                          </span>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEditProvider(provider)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleDeleteProvider(provider.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Model Preferences Section */}
      <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">
            {t("settings.ai.modelPreferences")}
          </h3>
        </div>
        <Button
          size="sm"
          disabled={!isFormDirty}
          className="transition-opacity duration-200"
          style={{
            opacity: isFormDirty ? 1 : 0,
            pointerEvents: isFormDirty ? "auto" : "none",
          }}
          onClick={() => {
            // Trigger form submission
            const form = document.querySelector("form")
            if (form) {
              form.requestSubmit()
            }
          }}
        >
          {t("common.update")}
        </Button>
      </div>

      <hr className="border-border" />

      <div className="py-6">
        <AITaskConfigForm onDirtyChange={setIsFormDirty} />
      </div>

      {/* Provider Configuration Modal */}
      <AIProviderModal
        open={isModalOpen}
        onOpenChange={handleCloseModal}
        provider={editingProvider}
        onSave={handleSaveProvider}
        onDelete={editingProvider ? handleDeleteProvider : undefined}
        existingNames={aiConfig.llmProviders.map((p) => p.name)}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("settings.ai.deleteProviderTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.ai.deleteProviderDescription", {
                name: providerToDelete,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProvider}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
