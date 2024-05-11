import { useCallback, useMemo } from "react"

import { useConfigStore } from "@/app/settings/store"

export const useAiConfig = () => {
  const { aiConfig } = useConfigStore()
  const getConfigByModel = useCallback(
    (model: string) => {
      const { baseUrl, token, GROQ_BASE_URL, GROQ_API_KEY } = aiConfig
      if (model.endsWith("groq")) {
        return {
          baseUrl: GROQ_BASE_URL,
          token: GROQ_API_KEY,
        }
      }
      return {
        baseUrl,
        token,
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
