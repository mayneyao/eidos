import { useTranslation } from "react-i18next"
import { generateText } from "ai"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { getProvider } from "@/packages/ai/helper"
import { toast } from "@/components/ui/use-toast"
import { TaskType } from "@/components/settings/global/ai/hooks"
import { useState, useCallback } from "react"

export function useGenerateTitle() {
  const { t } = useTranslation()
  const { findAvailableModel, getConfigByModel } = useAiConfig()
  const model = findAvailableModel(TaskType.Translation)
  const [isLoading, setIsLoading] = useState(false)
  const [title, setTitle] = useState("")

  const generateTitle = useCallback(
    async (content: string): Promise<string> => {
      if (!model) {
        toast({
          title: "No model available",
          description: "Please config a model",
        })
        return ""
      }

      setIsLoading(true)
      try {
        const config = getConfigByModel(model)
        const [modelId] = model.split("@")
        const provider = getProvider(config as any)
        const llmodel = provider(modelId)

        const result = await generateText({
          model: llmodel,
          system:
            "You are a helpful assistant that generates concise and descriptive titles. Analyze the given content and generate a short, meaningful title (no more than 6 words) in the SAME LANGUAGE as the input content. Only output the title without any additional explanation or punctuation.",
          prompt: content,
        })

        const generatedTitle = result.text.trim()
        setTitle(generatedTitle)
        return generatedTitle
      } catch (error: any) {
        toast({
          title: error.message || t("common.error.tryAgainLater"),
          description: t("common.error.modelLimitation"),
        })
        return ""
      } finally {
        setIsLoading(false)
      }
    },
    [model, getConfigByModel, t]
  )

  return {
    generateTitle,
    isLoading,
    title,
  }
}
