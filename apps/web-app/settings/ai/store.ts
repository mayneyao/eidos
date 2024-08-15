import { z } from "zod"
import { create } from "zustand"
// can use anything: IndexedDB, Ionic Storage, etc.
import { createJSONStorage, persist } from "zustand/middleware"

import { indexedDBStorage } from "@/lib/storage/indexeddb"

export const llmProviderSchema = z.object({
  type: z.enum(["openai", "google"]).default("openai"),
  name: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  models: z.string().default(""),
})

export type LLMProvider = z.infer<typeof llmProviderSchema>

export const aiFormSchema = z.object({
  localModels: z.array(z.string()).default([]),
  llmProviders: z.array(llmProviderSchema).default([]),
  // runtime
  autoLoadEmbeddingModel: z.boolean().default(false),
  // task model
  embeddingModel: z.string().optional(),
  translationModel: z.string().optional(),
  codingModel: z.string().optional(),
})

export type AIFormValues = z.infer<typeof aiFormSchema>

interface ConfigState {
  aiConfig: AIFormValues
  setAiConfig: (aiConfig: AIFormValues) => void
}

export const useAIConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      aiConfig: {
        localModels: [],
        llmProviders: [],
        autoLoadEmbeddingModel: false,
      },
      setAiConfig: (aiConfig) => set({ aiConfig }),
    }),
    {
      name: "config-ai",
      storage: createJSONStorage(() => indexedDBStorage),
    }
  )
)
