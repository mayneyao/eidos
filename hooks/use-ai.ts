import { OpenAIApi } from "openai"
import { useEffect, useState } from "react"

import { useConfigStore } from "@/app/settings/store"
import { askAI, getOpenAI } from "@/lib/ai/openai"

export const useAI = () => {
  const { aiConfig } = useConfigStore()
  const { token } = aiConfig
  const [openai, setOpenai] = useState<OpenAIApi>()

  useEffect(() => {
    if (token) {
      const openai = getOpenAI(token)
      setOpenai(openai)
    }
  }, [token])

  const _askAI = askAI(openai)

  return { askAI: _askAI }
}
