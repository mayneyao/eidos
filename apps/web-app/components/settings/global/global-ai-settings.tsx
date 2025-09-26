import { Suspense, lazy, useState } from "react"
import type { LLMProvider } from "@/packages/ai/config"
import { ALL_PROVIDERS, type LLMProviderType } from "@/packages/ai/helper"
import { Edit, Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/components/ui/use-toast"
import { useAIConfigStore } from "@/apps/web-app/pages/settings/ai/store"

import { AIProviderModal } from "./ai/ai-provider-modal"
import { AITaskConfigForm } from "./ai/ai-task-form"

// lazy import ProviderIcon
const ProviderIcon = lazy(
  () => import("@/apps/web-app/pages/settings/ai/provider/provider-icon")
)

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

  const handleDeleteProvider = async (providerName: string) => {
    try {
      removeLLMProvider(providerName)
      toast({
        title: t("common.success"),
        description: t("settings.ai.providerDeletedSuccess", {
          name: providerName,
        }),
      })
    } catch (error) {
      toast({
        title: t("common.error"),
        description: t("settings.ai.providerDeleteError"),
        variant: "destructive",
      })
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
        <h3 className="text-lg font-medium">{t("settings.ai.provider")}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
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

      <div className="py-4 lg:py-6">
        <div className="space-y-4">
          <div className="space-y-0.5">
            <p className="text-sm text-muted-foreground">
              {t("settings.ai.providerDescription")}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {aiConfig.llmProviders.map((provider) => {
              return (
                <div
                  key={provider.name}
                  className="group flex flex-col sm:flex-row sm:items-center p-3 rounded-lg border hover:bg-accent/50 transition-colors gap-3"
                >
                  {/* Header row with icon, name and actions */}
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <Suspense fallback={<div className="w-5 h-5" />}>
                        <ProviderIcon type={provider.type} isActive />
                      </Suspense>
                      <h5 className="font-medium truncate">{provider.name}</h5>
                    </div>
                    
                    {/* Action buttons - always visible on mobile, hover on desktop */}
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditProvider(provider)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteProvider(provider.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Models section - full width with flex wrap */}
                  {provider.models && provider.models.length > 0 && (
                    <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground w-full">
                      {provider.models
                        .split(",")
                        .slice(0, 5)
                        .map((model) => (
                          <span
                            key={model}
                            className="whitespace-nowrap rounded bg-muted px-2 py-1 text-muted-foreground"
                          >
                            {model}
                          </span>
                        ))}
                      {(() => {
                        const totalModels = provider.models.split(",").length
                        if (totalModels > 5) {
                          const remainingCount = totalModels - 5
                          return (
                            <span className="italic shrink-0 text-muted-foreground">
                              {t("common.more", {
                                count: remainingCount,
                              })}
                            </span>
                          )
                        }
                        return null
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Model Preferences Section */}
      <div className="py-4 lg:py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-medium">
            {t("settings.ai.modelPreferences")}
          </h3>
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
      </div>

      <hr className="border-border" />

      <div className="py-4 lg:py-6">
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
    </div>
  )
}
