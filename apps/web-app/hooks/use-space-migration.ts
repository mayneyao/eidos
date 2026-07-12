import { useCallback, useEffect, useRef, useState } from "react"
import type {
  LegacySpaceMigrationResult,
  MigrationExportProgress,
} from "@eidos.space/legacy-space-migration"
import type { SpaceMigrationPlanHandle } from "@/apps/desktop/electron/modules/space-migration/space-migration.service"

import { isDesktopMode } from "@/lib/env"

type MigrationOperation = "planning" | "exporting" | null

interface MigrationProgressPayload extends MigrationExportProgress {
  planId: string
}

export function useSpaceMigration(spaceId?: string) {
  const [planHandle, setPlanHandle] = useState<SpaceMigrationPlanHandle | null>(
    null
  )
  const [result, setResult] = useState<LegacySpaceMigrationResult | null>(null)
  const [operation, setOperation] = useState<MigrationOperation>(null)
  const [progress, setProgress] = useState<MigrationExportProgress | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const planRef = useRef<SpaceMigrationPlanHandle | null>(null)
  planRef.current = planHandle

  const available =
    isDesktopMode && typeof window !== "undefined" && Boolean(window.eidos)

  useEffect(() => {
    if (!available) return
    const listenerId = window.eidos.on(
      "space-migration:progress",
      (_event: unknown, payload: MigrationProgressPayload) => {
        if (payload.planId !== planRef.current?.id) return
        setProgress({
          phase: payload.phase,
          completed: payload.completed,
          total: payload.total,
          currentPath: payload.currentPath,
        })
      }
    )
    return () => {
      if (listenerId) window.eidos.off("space-migration:progress", listenerId)
    }
  }, [available])

  useEffect(() => {
    return () => {
      const currentPlan = planRef.current
      if (available && currentPlan) {
        void window.eidos.spaceMigration.discardPlan(currentPlan.id)
      }
    }
  }, [available])

  const createPlan = useCallback(
    async (targetRoot: string) => {
      if (!available || !spaceId) {
        throw new Error("Legacy Space migration is only available on Desktop")
      }
      setOperation("planning")
      setError(null)
      setResult(null)
      setProgress(null)
      const previousPlan = planRef.current
      try {
        const handle = await window.eidos.spaceMigration.createPlan(
          spaceId,
          targetRoot
        )
        setPlanHandle(handle)
        return handle
      } catch (cause) {
        const nextError =
          cause instanceof Error ? cause : new Error(String(cause))
        setError(nextError)
        setPlanHandle(null)
        throw nextError
      } finally {
        if (previousPlan) {
          void window.eidos.spaceMigration.discardPlan(previousPlan.id)
        }
        setOperation(null)
      }
    },
    [available, spaceId]
  )

  const executePlan = useCallback(async () => {
    const currentPlan = planRef.current
    if (!available || !currentPlan) {
      throw new Error("Create a migration preview before exporting")
    }
    setOperation("exporting")
    setError(null)
    setProgress({ phase: "preparing", completed: 0, total: 1 })
    try {
      const nextResult = await window.eidos.spaceMigration.executePlan(
        currentPlan.id
      )
      setResult(nextResult)
      setPlanHandle(null)
      return nextResult
    } catch (cause) {
      const nextError =
        cause instanceof Error ? cause : new Error(String(cause))
      setError(nextError)
      setPlanHandle(null)
      throw nextError
    } finally {
      setOperation(null)
    }
  }, [available])

  const reset = useCallback(() => {
    const currentPlan = planRef.current
    if (available && currentPlan && operation !== "exporting") {
      void window.eidos.spaceMigration.discardPlan(currentPlan.id)
    }
    setPlanHandle(null)
    setResult(null)
    setProgress(null)
    setError(null)
  }, [available, operation])

  return {
    available,
    planHandle,
    result,
    operation,
    progress,
    error,
    createPlan,
    executePlan,
    reset,
  }
}
