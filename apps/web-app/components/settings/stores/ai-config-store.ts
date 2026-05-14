import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import type { AIFormValues, LLMProvider } from "@/packages/ai/config"

import { createDesktopStorage } from "@/lib/storage/desktop"

interface ConfigState {
  aiConfig: AIFormValues
  setAiConfig: (aiConfig: AIFormValues) => void
  addLLMProvider: (provider: LLMProvider) => void
  updateLLMProvider: (provider: LLMProvider) => void
  removeLLMProvider: (name: string) => void
}

const defaultAIConfig: AIFormValues = {
  localModels: [],
  llmProviders: [],
  autoLoadEmbeddingModel: false,
  embeddingModel: undefined,
  translationModel: undefined,
  codingModel: undefined,
  applyCodeModel: undefined,
}

const getDefaultConfigState = (): ConfigState =>
  ({
    aiConfig: defaultAIConfig,
  }) as ConfigState

const aiStorage = createDesktopStorage<ConfigState>({
  backendConfigKey: "ai",
  getBackendState: (state: ConfigState) => state.aiConfig,
  defaultBackendState: defaultAIConfig,
  getDefaultState: getDefaultConfigState,
  buildStateFromBackend: (
    backendState: AIFormValues,
    currentState: ConfigState
  ) => ({
    ...currentState,
    aiConfig: backendState,
  }),
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
