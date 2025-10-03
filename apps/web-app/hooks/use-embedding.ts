import { useAIConfigStore } from "@/components/settings/stores";
import { getProvider } from "@/packages/ai/helper";
import { embed, embedMany } from 'ai';
import { useAiConfig } from "./use-ai-config";
import { useCallback } from "react";

export const useEmbedding = (): {
    embedding: (text: string) => Promise<number[] | undefined>;
    hasEmbeddingModel: () => boolean;
    embeddingTexts: (text: string[]) => Promise<number[][] | undefined>;
} => {
    const { getConfigByModel } = useAiConfig()

    const { aiConfig: { embeddingModel } } = useAIConfigStore()

    const hasEmbeddingModel = useCallback(() => {
        const model = embeddingModel && getConfigByModel(embeddingModel)
        return !!model
    }, [embeddingModel, getConfigByModel])

    const embedding = async (text: string) => {
        if (!embeddingModel) return
        const config = getConfigByModel(embeddingModel)
        const modelProvider = getProvider({
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            type: config.type,
        })
        const { embedding } = await embed({
            model: (modelProvider as any).textEmbedding(config.modelId),
            value: text,
        });
        return embedding
    }

    const embeddingTexts = async (text: string[]) => {
        if (!embeddingModel) return []

        const config = getConfigByModel(embeddingModel)
        const modelProvider = getProvider({
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            type: config.type,
        })
        const { embeddings } = await embedMany({
            model: (modelProvider as any).textEmbedding(config.modelId),
            values: text,
        });
        return embeddings as number[][]
    }
    return { embedding, hasEmbeddingModel, embeddingTexts }
};