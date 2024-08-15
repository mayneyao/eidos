import { toast } from "@/components/ui/use-toast"
import { useAiConfig } from "@/hooks/use-ai-config"
import { createOpenAI } from "@ai-sdk/openai"
import { embedMany, generateText } from "ai"

export enum TestModelType {
    Embedding = "Embedding",
    Translation = "Translation",
}
export const useModelTest = () => {

    const { getConfigByModel } = useAiConfig()

    async function testModel(
        modelType: TestModelType,
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
                case TestModelType.Embedding:
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
                case TestModelType.Translation:
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