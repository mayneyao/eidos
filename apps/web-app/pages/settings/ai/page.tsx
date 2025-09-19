import { lazy, Suspense } from "react"
import { ALL_PROVIDERS, type LLMProviderType } from "@/packages/ai/helper"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { AITaskConfigForm } from "./ai-task-form"
// import { ProviderIcon } from "./provider/provider-icon"
import { useAIConfigStore } from "./store"

// lazy import ProviderIcon
const ProviderIcon = lazy(() => import("./provider/provider-icon"))

export default function SettingsAIPage() {
  const { t } = useTranslation()
  const { aiConfig } = useAIConfigStore()
  const navigate = useNavigate()

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
      existingProviders.some((p) => p.name === newProviderName) // Ensure new name doesn't clash immediately
    ) {
      newProviderName = `${providerType}-${count}`
      count++
    }
    navigate(
      `/settings/ai/provider/new?type=${providerType}&name=${newProviderName}`
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">{t("settings.ai.provider")}</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                {t("common.button.add")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="right"
              // className="h-96 overflow-y-auto"
            >
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
        <p className="text-sm text-muted-foreground">
          {t("settings.ai.providerDescription")}
        </p>
        <div className="flex flex-col gap-2">
          {aiConfig.llmProviders.map((provider) => {
            return (
              <Link
                key={provider.name}
                to={`/settings/ai/provider/${provider.name}`}
                className="group flex items-center  p-1 rounded hover:bg-accent"
              >
                <div className="flex flex-grow items-center space-x-3">
                  <Suspense fallback={<div className="w-4 h-4" />}>
                    <ProviderIcon type={provider.type} isActive />
                  </Suspense>
                  <div className="flex flex-grow gap-2 items-center justify-between w-full">
                    <h5 className="font-medium shrink-0">{provider.name}</h5>
                    {/* Display enabled models */}
                    <div className="flex gap-2 items-center text-xs text-muted-foreground">
                      {provider.models && provider.models.length > 0 && (
                        <>
                          {provider.models
                            .split(",")
                            .slice(0, 2)
                            .map((model) => (
                              <span
                                key={model}
                                className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
                              >
                                {model}
                              </span>
                            ))}
                          {(() => {
                            const totalModels =
                              provider.models.split(",").length
                            if (totalModels > 2) {
                              const remainingCount = totalModels - 2
                              return (
                                <span className="italic shrink-0">
                                  {t("common.more", { count: remainingCount })}
                                </span>
                              )
                            }
                            return null
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      <AITaskConfigForm />
    </div>
  )
}
