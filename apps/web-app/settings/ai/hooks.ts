import { toast } from "@/components/ui/use-toast"
import { useAiConfig } from "@/hooks/use-ai-config"
import { createOpenAI } from "@ai-sdk/openai"
import { embedMany, generateText } from "ai"

export enum TaskType {
    Embedding = "Embedding",
    Translation = "Translation",
    Coding = "Coding",
}

export const useModelTest = () => {

    const { getConfigByModel } = useAiConfig()

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
        try {
            const config = getConfigByModel(model)
            switch (modelType) {
                case TaskType.Embedding:
                    const embeddingTexts = async (text: string[]) => {
                        if (!model) return []
                        const openai = createOpenAI({
                            apiKey: config.apiKey,
                            baseURL: config.baseUrl,
                        })
                        const { embeddings } = await embedMany({
                            model: openai.embedding(config.modelId),
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
                        const openai = createOpenAI({
                            apiKey: config.apiKey,
                            baseURL: config.baseUrl,
                        })
                        const res = await generateText({
                            model: openai.chat(config.modelId),
                            prompt: `Translate the following text to ${targetLanguage}: ${text}`,
                        });
                        return res.text
                    }
                    try {
                        const text = "Bonjour 世界"
                        const targetLanguage = "English"
                        const translations = await translationText(text, targetLanguage)
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
                    const openai = createOpenAI({
                        apiKey: config.apiKey,
                        baseURL: config.baseUrl,
                    })
                    try {
                        const code = await generateText({
                            model: openai.chat(config.modelId),
                            prompt: `Write a function that takes a list of numbers and returns the sum of the numbers.`,
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
            }
        } catch (error) {
            toast({
                title: "Test Failed",
                description: `Failed to test ${modelType} model "${model}".`,
                variant: "destructive",
            })
        }
    }

    return { testModel }
}