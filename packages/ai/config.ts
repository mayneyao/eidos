import { z } from "zod"

import type { LLMProviderType } from "./helper"


// Define the enum using all provider types directly
const providerTypes: [LLMProviderType, ...LLMProviderType[]] = [
    "openai",
    "google",
    "deepseek",
    "groq",
    "xai",
    "openrouter",
    "anthropic",
    "azure",
    "amazon-bedrock",
    // "fal",
    "deepinfra",
    "mistral",
    "togetherai",
    "cohere",
    "fireworks",
    "cerebras",
    // "replicate",
    "perplexity",
    "ollama",
    // "luma",
    "openai-compatible",
    "anthropic-compatible",
];

export const llmProviderSchema = z.object({
    type: z.enum(providerTypes).default("openai"),
    name: z.string(),
    apiKey: z.string().optional(),
    baseUrl: z.string().url().optional().or(z.literal('')),
    models: z.string().default(""),
    enabled: z.boolean().optional(),
})

export type LLMProvider = z.infer<typeof llmProviderSchema>

// Integration configuration schemas
export const telegramIntegrationSchema = z.object({
    enabled: z.boolean().default(false),
    botToken: z.string().optional(),
})

export const discordIntegrationSchema = z.object({
    enabled: z.boolean().default(false),
    botToken: z.string().optional(),
    clientId: z.string().optional(),
})

export const integrationsSchema = z.object({
    telegram: telegramIntegrationSchema.optional(),
    discord: discordIntegrationSchema.optional(),
    sessionTimeoutMinutes: z.number().default(30),
    systemPrompt: z.string().optional(),
})

export type Integrations = z.infer<typeof integrationsSchema>

export const aiFormSchema = z.object({
    localModels: z.array(z.string()).default([]),
    llmProviders: z.array(llmProviderSchema).default([]),
    // runtime
    autoLoadEmbeddingModel: z.boolean().default(false),
    // task model
    embeddingModel: z.string().optional(),
    translationModel: z.string().optional(),
    codingModel: z.string().optional(),
    applyCodeModel: z.string().optional(),
    // integrations
    integrations: integrationsSchema.optional(),
    // version
    version: z.number().default(0),
})

export type AIFormValues = z.infer<typeof aiFormSchema>