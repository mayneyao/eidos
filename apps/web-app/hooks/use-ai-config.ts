import { useCallback, useMemo } from "react"

import { useAIConfigStore } from "@/components/settings/stores"
import { TaskType } from "@/components/settings/global/ai/hooks"
import { getProvider } from "@/packages/ai/helper"
import type { LanguageModel } from "ai"

export const useAiConfig = () => {
  const { aiConfig } = useAIConfigStore()

  const findFirstAvailableModel = useCallback(() => {
    if (!aiConfig.llmProviders?.length) {
      return ""
    }
    // Only consider enabled providers
    const enabledProviders = aiConfig.llmProviders.filter(
      (provider) => provider.enabled
    )
    if (!enabledProviders.length) {
      return ""
    }

    const provider = enabledProviders[0]
    const models = provider?.models?.split(",")
    const model = models?.[0]?.trim()
    if (!model) {
      return ""
    }
    return `${model}@${provider.name}`
  }, [aiConfig])

  const getConfigByModel = useCallback(
    (model: string) => {
      if (!model?.includes("@")) {
        throw new Error(`Model ${model} is not valid`)
      }
      const [modelId, provider] = model.split("@")
      const llmProvider = aiConfig.llmProviders.find(
        (item) =>
          item?.name?.toLowerCase() === provider?.toLowerCase() && item.enabled
      )
      if (llmProvider) {
        return {
          baseUrl: llmProvider.baseUrl || "",
          apiKey: llmProvider.apiKey || "",
          modelId: modelId || "",
          type: llmProvider.type,
        }
      }
      throw new Error(`Provider ${provider} not found`)
    },
    [aiConfig]
  )

  const getLLModel = useCallback(
    (model: string) => {
      const config = getConfigByModel(model)
      const provider = getProvider({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        type: config.type,
      })
      return provider(config.modelId) as LanguageModel
    },
    [getConfigByModel]
  )

  const hasAvailableModels = useMemo(() => {
    // Check if there are any enabled providers
    return aiConfig.llmProviders.some((provider) => provider.enabled)
  }, [aiConfig])

  const findAvailableModel = useCallback(
    (task: TaskType) => {
      switch (task) {
        case TaskType.Translation:
          return aiConfig.translationModel || findFirstAvailableModel()
        case TaskType.Coding:
          return aiConfig.codingModel || findFirstAvailableModel()
        default:
          return findFirstAvailableModel()
      }
    },
    [aiConfig]
  )

  const codingModel = useMemo(() => {
    return aiConfig.codingModel
  }, [aiConfig])

  const applyCodeModel = useMemo(() => {
    return aiConfig.applyCodeModel
  }, [aiConfig])

  const textModel = useMemo(() => {
    return aiConfig.translationModel || findFirstAvailableModel()
  }, [aiConfig])

  const textModelConfig = useMemo(() => {
    const textModel = findAvailableModel(TaskType.Translation)
    if (textModel) {
      try {
        return getConfigByModel(textModel)
      } catch (error) {
        return undefined
      }
    }
    return undefined
  }, [findAvailableModel, getConfigByModel])

  const embeddingModel = useMemo(() => {
    return aiConfig.embeddingModel
  }, [aiConfig])

  return {
    getConfigByModel,
    getLLModel,
    hasAvailableModels,
    findFirstAvailableModel,
    findAvailableModel,
    codingModel,
    applyCodeModel,
    textModel,
    embeddingModel,
    textModelConfig,
    exaApiKey: aiConfig.exaApiKey,
  }
}
