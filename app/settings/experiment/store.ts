import { z } from "zod"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

import { indexedDBStorage } from "@/lib/storage/indexeddb"

export const experimentFormSchema = z.object({
  undoRedo: z.boolean().default(false),
  enableFileManager: z.boolean().default(false),
})

export type ExperimentFormValues = z.infer<typeof experimentFormSchema>

interface ConfigState {
  experiment: ExperimentFormValues
  setExperiment: (experiment: ExperimentFormValues) => void
}

export const useExperimentConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      experiment: {
        undoRedo: false,
        enableFileManager: false,
      },
      setExperiment: (experiment) => set({ experiment }),
    }),
    {
      name: "config-experiment",
      storage: createJSONStorage(() => indexedDBStorage),
    }
  )
)
