import { useCallback, useMemo } from "react"

import { useAIConfigStore } from "@/apps/web-app/settings/ai/store"
import { TaskType } from "@/apps/web-app/settings/ai/hooks"

export const useAiConfig = () => {
  const { aiConfig } = useAIConfigStore()

  const findFirstAvailableModel = useCallback(() => {
    if (!aiConfig.llmProviders?.length) {
      return ''
    }
    const provider = aiConfig.llmProviders[0]
    const models = provider?.models?.split(',')
    const model = models?.[0]?.trim()
    if (!model) {
      return ''
    }
    return `${model}@${provider.name}`
  }, [aiConfig])

  const getConfigByModel = useCallback(
    (model: string) => {
      if (!model?.includes('@')) {
        return {
          baseUrl: '/',
          apiKey: '',
          modelId: model || '',
        }
      }
      const [modelId, provider] = model.split('@')
      const llmProvider = aiConfig.llmProviders.find(
        (item) => item?.name?.toLowerCase() === provider?.toLowerCase()
      )
      if (llmProvider) {
        return {
          baseUrl: llmProvider.baseUrl || '/',
          apiKey: llmProvider.apiKey || '',
          modelId: modelId || '',
          type: llmProvider.type,
        }
      }
      return {
        baseUrl: '/',
        apiKey: '',
        modelId: modelId || '',
      }
    },
    [aiConfig]
  )

  const hasAvailableModels = useMemo(() => {
    return aiConfig.llmProviders.length > 0
  }, [aiConfig])

  const findAvailableModel = useCallback((task: TaskType) => {
    switch (task) {
      case TaskType.Translation:
        return aiConfig.translationModel || findFirstAvailableModel()
      case TaskType.Coding:
        return aiConfig.codingModel || findFirstAvailableModel()
      default:
        return findFirstAvailableModel()
    }
  }, [aiConfig])

  const codingModel = useMemo(() => {
    return aiConfig.codingModel
  }, [aiConfig])

  return {
    getConfigByModel,
    hasAvailableModels,
    findFirstAvailableModel,
    findAvailableModel,
    codingModel,
  }
}
