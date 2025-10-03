import { toast } from "@/components/ui/use-toast"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { getProvider } from "@/packages/ai/helper"
import type { LanguageModelV1 } from "ai";
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
    const [loadingStates, setLoadingStates] = useState<Record<TaskType, boolean>>({
        [TaskType.Embedding]: false,
        [TaskType.Translation]: false,
        [TaskType.Coding]: false,
        [TaskType.ApplyCode]: false,
    })

    async function testModel(
        modelType: TaskType,
        model: string | undefined
    ) {
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
                            description: `Tested ${modelType} model "${model}" successfully.`
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
                    const translationText = async (text: string, targetLanguage: string) => {
                        if (!model) return []
                        const res = await generateText({
                            model: modelProvider(config.modelId) as LanguageModelV1,
                            prompt: `Translate the following text to ${targetLanguage}: ${text}`,
                        });
                        return res.text
                    }
                    try {
                        const text = "Bonjour World"
                        const targetLanguage = "English"
                        await translationText(text, targetLanguage)
                        toast({
                            title: "Test Succeeded",
                            description: `Tested ${modelType} model "${model}" successfully.`
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
                        const code = await generateText({
                            model: modelProvider(config.modelId) as LanguageModelV1,
                            prompt: `just write a function that takes a list of numbers and returns the sum of the numbers. don't include any other text.`,
                        })
                        console.log(code)
                        toast({
                            title: "Test Succeeded",
                            description: `Tested ${modelType} model "${model}" successfully.`
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
                        const patchCode = await generateText({
                            model: modelProvider(config.modelId) as LanguageModelV1,
                            prompt: `You are a code patching assistant. Apply the following edit to the given code:

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

Return the complete modified code with the changes applied.`,
                        })
                        console.log(patchCode)

                        // Simple validation to check if the response contains expected modifications
                        if (patchCode.text.includes("export function Counter") &&
                            patchCode.text.includes("Reset") &&
                            (patchCode.text.includes("disabled") || patchCode.text.includes("count === 0"))) {
                            toast({
                                title: "Test Succeeded",
                                description: `Tested ${modelType} model "${model}" successfully. Model can apply code modifications correctly.`
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
        isApplyCodeLoading: loadingStates[TaskType.ApplyCode]
    }
}