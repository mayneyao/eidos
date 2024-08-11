import { useCallback, useMemo } from "react"

import { useAIConfigStore } from "@/apps/web-app/settings/ai/store"

export const useAiConfig = () => {
  const { aiConfig } = useAIConfigStore()

  const findFirstAvailableModel = useCallback(() => {
    const provider = aiConfig.llmProviders[0]
    const model = provider?.models.split(",")[0]
    return `${model}@${provider.name}`
  }, [aiConfig])

  const getConfigByModel = useCallback(
    (model: string) => {
      const [modelId, provider] = model.split("@")
      const llmProvider = aiConfig.llmProviders.find(
        (item) => item.name.toLowerCase() === provider?.toLowerCase()
      )
      if (llmProvider) {
        return {
          baseUrl: llmProvider.baseUrl,
          apiKey: llmProvider.apiKey,
          modelId,
          type: llmProvider.type,
        }
      }
      return {
        baseUrl: "/",
        apiKey: "",
        modelId,
      }
    },
    [aiConfig]
  )

  const hasAvailableModels = useMemo(() => {
    return aiConfig.llmProviders.length > 0
  }, [aiConfig])

  return {
    getConfigByModel,
    hasAvailableModels,
    findFirstAvailableModel,
  }
}
