import { useCallback, useEffect } from "react"

import { PDFLoader } from "@/lib/ai/doc_loader/pdf"
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
