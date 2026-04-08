import { embed } from "@/packages/ai"
import { getProvider } from "@/packages/ai/helper"

import { getConfigManager } from "../../services/config-manager"

/**
 * dataspace may run in a runtime with limited environment, so some capabilities are injected through service context.
 * Here we provide the implementation of the context in the current runtime.
 */

// Simple LRU Cache implementation using Map
const MAX_CACHE_SIZE = 1000 // Define a reasonable cache size
const embeddingCache = new Map<string, Array<number>>()

function setCache(key: string, value: Array<number>) {
  if (embeddingCache.size >= MAX_CACHE_SIZE) {
    // Evict the least recently used item (first key in Map's insertion order)
    const oldestKey = embeddingCache.keys().next().value
    if (oldestKey) {
      embeddingCache.delete(oldestKey)
    }
  }
  embeddingCache.set(key, value)
}

function getCache(key: string): Array<number> | undefined {
  const value = embeddingCache.get(key)
  if (value) {
    // Move the accessed item to the end to mark it as recently used
    embeddingCache.delete(key)
    embeddingCache.set(key, value)
  }
  return value
}

//

export async function embedding(text: string): Promise<Array<number>> {
  // Check cache first
  const cachedEmbedding = getCache(text)
  if (cachedEmbedding) {
    // console.log("Cache hit for:", text.substring(0, 50) + "..."); // Optional: for debugging
    return cachedEmbedding
  }

  // console.log("Cache miss for:", text.substring(0, 50) + "..."); // Optional: for debugging
  const configManager = getConfigManager()
  const aiConfig = configManager.get("ai")
  const embeddingModel = aiConfig.embeddingModel
  const getConfigByModel = (model: string) => {
    if (!model?.includes("@")) {
      throw new Error(`Model ${model} is not valid`)
    }
    const [modelId, provider] = model.split("@")
    const llmProvider = aiConfig.llmProviders.find(
      (item) =>
        item?.name?.toLowerCase() === provider?.toLowerCase() && item.enabled
    )
    if (llmProvider) {
      return {
        baseUrl: llmProvider.baseUrl || "",
        apiKey: llmProvider.apiKey || "",
        modelId: modelId || "",
        type: llmProvider.type,
      }
    }
    throw new Error(`Provider ${provider} not found`)
  }
  if (!embeddingModel) {
    throw new Error("Embedding model not found")
  }
  const config = getConfigByModel(embeddingModel)
  const modelProvider = getProvider({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    type: config.type,
  })
  const embeddingResult = await embed({
    model: (modelProvider as any).textEmbedding(config.modelId),
    value: text,
  })
  const computedEmbedding = embeddingResult.embedding
  // Store in cache before returning
  setCache(text, computedEmbedding)
  return computedEmbedding
}
