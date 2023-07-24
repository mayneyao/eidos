import { useEffect, useState } from "react"
import { OpenAIApi } from "openai"

import { askAI, getOpenAI } from "@/lib/ai/openai"
import { useConfigStore } from "@/app/settings/store"

export const useAI = (baseSysPrompt: string) => {
  const { aiConfig } = useConfigStore()
  const { token } = aiConfig
  const [openai, setOpenai] = useState<OpenAIApi>()

  useEffect(() => {
    if (token) {
      const openai = getOpenAI(token)
      setOpenai(openai)
    }
  }, [token])

  const _askAI = askAI(baseSysPrompt, openai)

  return { askAI: _askAI }
}
