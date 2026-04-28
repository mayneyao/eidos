import { toast } from "@/components/ui/use-toast"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { getProvider } from "@/packages/ai/helper"
import { isDesktopMode } from "@/lib/env"
import type { LanguageModel } from "ai"
import { embedMany, generateText } from "ai"
import { useState } from "react"

export enum TaskType {
  Embedding = "Embedding",
  Translation = "Translation",
  Coding = "Coding",
  ApplyCode = "ApplyCode",
}

export const useModelTest = () => {
  const { getConfigByModel } = useAiConfig()
  const [loadingStates, setLoadingStates] = useState<Record<TaskType, boolean>>(
    {
      [TaskType.Embedding]: false,
      [TaskType.Translation]: false,
      [TaskType.Coding]: false,
      [TaskType.ApplyCode]: false,
    }
  )

  async function testModel(modelType: TaskType, model: string | undefined) {
    if (!model) {
      toast({
        title: "Test Failed",
        description: "Model is not selected",
        variant: "destructive",
      })
      return
    }

    setLoadingStates({ ...loadingStates, [modelType]: true })
    try {
      const config = getConfigByModel(model)
      const modelProvider = getProvider({
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        type: config.type,
      })
      switch (modelType) {
        case TaskType.Embedding:
          const embeddingTexts = async (text: string[]) => {
            if (!model) return []
            const { embeddings } = await embedMany({
              model: (modelProvider as any).textEmbedding(config.modelId),
              values: text,
            })
            return embeddings as number[][]
          }
          try {
            const embeddings = await embeddingTexts(["Hello", "World"])
            console.log(embeddings)
            toast({
              title: "Test Succeeded",
              description: `Tested ${modelType} model "${model}" successfully.`,
            })
          } catch (error) {
            console.error(error)
            toast({
              title: "Test Failed",
              description: `Failed to test ${modelType} model "${model}".`,
              variant: "destructive",
            })
          }
          break
        case TaskType.Translation:
          try {
            const text = "Bonjour World"
            const targetLanguage = "English"
            if (isDesktopMode) {
              await window.eidos.AI.generateText({
                model,
                prompt: `Translate the following text to ${targetLanguage}: ${text}`,
              })
            } else {
              const res = await generateText({
                model: modelProvider(config.modelId) as LanguageModel,
                prompt: `Translate the following text to ${targetLanguage}: ${text}`,
              })
            }
            toast({
              title: "Test Succeeded",
              description: `Tested ${modelType} model "${model}" successfully.`,
            })
          } catch (error) {
            console.error(error)
            toast({
              title: "Test Failed",
              description: `Failed to test ${modelType} model "${model}".`,
              variant: "destructive",
            })
          }
          break
        case TaskType.Coding:
          if (!model) return []

          try {
            if (isDesktopMode) {
              await window.eidos.AI.generateText({
                model,
                prompt: `just write a function that takes a list of numbers and returns the sum of the numbers. don't include any other text.`,
              })
            } else {
              await generateText({
                model: modelProvider(config.modelId) as LanguageModel,
                prompt: `just write a function that takes a list of numbers and returns the sum of the numbers. don't include any other text.`,
              })
            }
            toast({
              title: "Test Succeeded",
              description: `Tested ${modelType} model "${model}" successfully.`,
            })
          } catch (error) {
            console.error(error)
            toast({
              title: "Test Failed",
              description: `Failed to test ${modelType} model "${model}".`,
              variant: "destructive",
            })
          }
          break
        case TaskType.ApplyCode:
          if (!model) return []

          try {
            const prompt = `You are a code patching assistant. Apply the following edit to the given code:

<code>
import { useState } from "react"
import { Button } from "@/components/ui/button"

export function Counter() {
  const [count, setCount] = useState(0)
  
  return (
    <div>
      <p>Count: {count}</p>
      <Button onClick={() => setCount(count + 1)}>
        Click me
      </Button>
    </div>
  )
}
</code>

<update>
Add a reset button that sets count back to 0, and add a disabled state when count is 0.
</update>

Return the complete modified code with the changes applied.`
            let patchCodeText: string
            if (isDesktopMode) {
              const { text } = await window.eidos.AI.generateText({
                model,
                prompt,
              })
              patchCodeText = text
            } else {
              const patchCode = await generateText({
                model: modelProvider(config.modelId) as LanguageModel,
                prompt,
              })
              patchCodeText = patchCode.text
            }
            console.log(patchCodeText)

            // Simple validation to check if the response contains expected modifications
            if (
              patchCodeText.includes("export function Counter") &&
              patchCodeText.includes("Reset") &&
              (patchCodeText.includes("disabled") ||
                patchCodeText.includes("count === 0"))
            ) {
              toast({
                title: "Test Succeeded",
                description: `Tested ${modelType} model "${model}" successfully. Model can apply code modifications correctly.`,
              })
            } else {
              toast({
                title: "Test Warning",
                description: `${modelType} model "${model}" responded but may not have applied the expected modifications.`,
                variant: "destructive",
              })
            }
          } catch (error) {
            console.error(error)
            toast({
              title: "Test Failed",
              description: `Failed to test ${modelType} model "${model}".`,
              variant: "destructive",
            })
          }
          break
      }
    } catch (error) {
      toast({
        title: "Test Failed",
        description: `Failed to test ${modelType} model "${model}".`,
        variant: "destructive",
      })
    } finally {
      setLoadingStates({ ...loadingStates, [modelType]: false })
    }
  }

  return {
    testModel,
    isEmbeddingLoading: loadingStates[TaskType.Embedding],
    isTranslationLoading: loadingStates[TaskType.Translation],
    isCodingLoading: loadingStates[TaskType.Coding],
    isApplyCodeLoading: loadingStates[TaskType.ApplyCode],
  }
}
