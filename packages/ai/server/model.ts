import type { AIFormValues, LLMProvider } from "../config"
import { getProvider } from "../helper"

export type ThinkingLevel = "off" | "low" | "medium" | "high"

export interface ProviderFallbackConfig {
  modelId?: string
  apiKey?: string
  baseUrl?: string
  type?: LLMProvider["type"]
  apiVersion?: LLMProvider["apiVersion"]
  name?: string
}

/**
 * Resolve a LanguageModel provider from the shared AI config. The preferred
 * shape is "modelId@providerName"; fallback config keeps lightweight callers
 * such as /api/chat compatible with explicit request credentials.
 */
export function resolveProviderForModel(
  modelAndProvider: string | undefined,
  aiConfig: AIFormValues | undefined,
  fallback: ProviderFallbackConfig = {}
) {
  const [modelFromCombined, providerName] = (modelAndProvider ?? "").split("@")
  const modelId = fallback.modelId || modelFromCombined

  if (providerName && aiConfig) {
    const llmProvider = aiConfig.llmProviders.find(
      (provider) => provider.name === providerName && provider.enabled !== false
    )

    if (llmProvider) {
      return {
        modelId,
        provider: getProvider({
          apiKey: llmProvider.apiKey,
          baseUrl: llmProvider.baseUrl,
          type: llmProvider.type,
          apiVersion: llmProvider.apiVersion,
          name: llmProvider.name,
        }),
        providerType: llmProvider.type,
      }
    }
  }

  return {
    modelId,
    provider: getProvider({
      apiKey: fallback.apiKey,
      baseUrl: fallback.baseUrl,
      type: fallback.type,
      apiVersion: fallback.apiVersion,
      name: fallback.name,
    }),
    providerType: fallback.type,
  }
}

export function buildProviderOptions(
  providerType: LLMProvider["type"] | undefined,
  thinking: ThinkingLevel
): Record<string, any> | undefined {
  if (thinking === "off") return undefined
  switch (providerType) {
    case "anthropic":
      return { anthropic: { thinking: { type: "enabled" }, effort: thinking } }
    case "openai":
      return { openai: { reasoningEffort: thinking } }
    default:
      return undefined
  }
}
