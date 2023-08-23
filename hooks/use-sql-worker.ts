import { useCallback, useMemo } from "react"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"

import { useSqliteStore } from "./use-sqlite"

export const useSqlWorker = () => {
  const { sqliteProxy: sqlWorker } = useSqliteStore()
  const { isShareMode } = useAppRuntimeStore()
  const checkSqlWorkerIsOk2Call = useCallback(() => {
    if (!sqlWorker) return false
    if (isShareMode) {
      if ((sqlWorker as any)._config) {
        return true
      } else {
        return false
      }
    }
    return true
  }, [isShareMode, sqlWorker])

  const isOk2call = useMemo(
    () => checkSqlWorkerIsOk2Call(),
    [checkSqlWorkerIsOk2Call]
  )

  return isOk2call ? sqlWorker : undefined
}
