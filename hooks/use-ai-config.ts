import { useCallback } from "react"

import { useConfigStore } from "@/app/settings/store"

export const useAiConfig = () => {
  const { aiConfig } = useConfigStore()
  const getConfigByModel = useCallback(
    (model: string) => {
      const { baseUrl, token, GROQ_BASE_URL, GROQ_API_KEY } = aiConfig
      if (model.startsWith("groq")) {
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

  return {
    getConfigByModel,
  }
}
