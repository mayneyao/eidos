import { z } from "zod"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { indexedDBStorage } from "@/lib/storage/indexeddb"

export const apiAgentFormSchema = z.object({
    url: z.string({
        description: "The URL of your api agent",
    }),
    enabled: z.boolean({
        description: "Whether to enable api agent",
    }),
})

export type APIAgentFormValues = z.infer<typeof apiAgentFormSchema>

interface ConfigState {
    apiAgentConfig: APIAgentFormValues
    setAPIAgentConfig: (apiAgentConfig: APIAgentFormValues) => void
}

export const useAPIConfigStore = create<ConfigState>()(
    persist(
        (set) => ({
            apiAgentConfig: {
                url: "ws://localhost:3333",
                enabled: false,
            },
            setAPIAgentConfig: (apiAgentConfig) => set({ apiAgentConfig }),
        }),
        {
            name: "config-api",
            storage: createJSONStorage(() => indexedDBStorage),
        }
    )
) 