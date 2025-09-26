import { create } from "zustand"
// can use anything: IndexedDB, Ionic Storage, etc.
import { createJSONStorage, persist } from "zustand/middleware"

import type { AIFormValues, LLMProvider } from "@/packages/ai/config"

// New import for the backend sync storage
import { createBackendSyncStorage } from "@/lib/storage/backend-sync"

interface ConfigState {
  aiConfig: AIFormValues
  setAiConfig: (aiConfig: AIFormValues) => void
  addLLMProvider: (provider: LLMProvider) => void
  updateLLMProvider: (provider: LLMProvider) => void
  removeLLMProvider: (name: string) => void
}

// Define the default state for the AI configuration
const defaultAIConfig: AIFormValues = {
  localModels: [],
  llmProviders: [],
  autoLoadEmbeddingModel: false,
  embeddingModel: undefined,
  translationModel: undefined,
  codingModel: undefined,
  applyCodeModel: undefined,
}

// Create a storage instance with backend synchronization
const aiStorage = createBackendSyncStorage<ConfigState>({
  backendConfigKey: "ai",
  getBackendState: (state: ConfigState) => state.aiConfig,
  defaultBackendState: defaultAIConfig,
})

export const useAIConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      aiConfig: {
        localModels: [],
        llmProviders: [],
        autoLoadEmbeddingModel: false,
      },
      setAiConfig: (aiConfig) => set({ aiConfig }),
      addLLMProvider: (provider: LLMProvider) =>
        set((state) => ({
          aiConfig: {
            ...state.aiConfig,
            llmProviders: [...state.aiConfig.llmProviders, provider],
          },
        })),
      updateLLMProvider: (provider: LLMProvider) =>
        set((state) => ({
          aiConfig: {
            ...state.aiConfig,
            llmProviders: state.aiConfig.llmProviders.map((p) =>
              p.name === provider.name ? provider : p
            ),
          },
        })),
      removeLLMProvider: (name: string) =>
        set((state) => ({
          aiConfig: {
            ...state.aiConfig,
            llmProviders: state.aiConfig.llmProviders.filter(
              (p) => p.name !== name
            ),
          },
        })),
    }),
    {
      name: "config-ai",
      // Use the custom storage wrapper
      storage: createJSONStorage(() => aiStorage),
    }
  )
)
