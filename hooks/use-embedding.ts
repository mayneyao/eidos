import { useAIConfigStore } from "@/apps/web-app/settings/ai/store";
import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from 'ai';
import { useAiConfig } from "./use-ai-config";


export const useEmbedding = () => {
    const { getConfigByModel } = useAiConfig()

    const { aiConfig: { embeddingModel } } = useAIConfigStore()
    const model = embeddingModel && getConfigByModel(embeddingModel)

    const hasEmbeddingModel = !!model

    const embedding = async (text: string) => {
        if (!model) return
        const openai = createOpenAI({
            apiKey: model.apiKey,
            baseURL: model.baseUrl,
        })
        const { embedding } = await embed({
            model: openai.embedding(model.modelId),
            value: text,
        });
        return embedding
    }

    const embeddingTexts = async (text: string[]) => {
        if (!model) return []
        const openai = createOpenAI({
            apiKey: model.apiKey,
            baseURL: model.baseUrl,
        })
        const { embeddings } = await embedMany({
            model: openai.embedding(model.modelId),
            values: text,
        });
        return embeddings as number[][]
    }
    return { embedding, hasEmbeddingModel, embeddingTexts }
};