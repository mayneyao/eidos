import { useCallback } from "react"

import { getWorker } from "@/lib/sqlite/worker"

import { useSqliteStore } from "./use-sqlite"

export const useWorker = () => {
  const { setInitialized, isInitialized } = useSqliteStore()

  const initWorker = useCallback(() => {
    const worker = getWorker()
    worker.onmessage = async (e) => {
      if (e.data === "init") {
        console.log("sqlite is loaded")
        setInitialized(true)
      }
    }
  }, [setInitialized])

  return {
    initWorker,
    isInitialized,
  }
}
