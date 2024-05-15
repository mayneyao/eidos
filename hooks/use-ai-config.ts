import { useCallback, useMemo } from "react"

import { useConfigStore } from "@/app/settings/store"

export const useAiConfig = () => {
  const { aiConfig } = useConfigStore()
  const getConfigByModel = useCallback(
    (model: string) => {
      const { baseUrl, token, GROQ_BASE_URL, GROQ_API_KEY } = aiConfig
      const [modelId, provider] = model.split("@")
      if (model.endsWith("groq")) {
        return {
          baseUrl: GROQ_BASE_URL,
          token: GROQ_API_KEY,
          modelId,
        }
      }
      if (provider === "openai") {
        return {
          baseUrl,
          token,
          modelId,
        }
      }
      return {
        baseUrl: "/",
        token: "",
        modelId,
      }
    },
    [aiConfig]
  )

  const hasAvailableModels = useMemo(() => {
    const { token, GROQ_API_KEY, GOOGLE_API_KEY, localModels } = aiConfig
    return [token, GROQ_API_KEY, GOOGLE_API_KEY, localModels].some(
      (item) => item?.length ?? 0 > 0
    )
  }, [aiConfig])

  return {
    getConfigByModel,
    hasAvailableModels,
  }
}
