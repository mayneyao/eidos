import { useCallback, useEffect, useRef, useState } from "react"
import type { LegacySpaceMigrationResult } from "@eidos.space/legacy-space-migration"
import type { SpaceMigrationPlanHandle } from "@/apps/desktop/electron/modules/space-migration/space-migration.service"

import { isDesktopMode } from "@/lib/env"

type MigrationOperation = "planning" | "exporting" | null

export function useSpaceMigration(spaceId?: string) {
  const [result, setResult] = useState<LegacySpaceMigrationResult | null>(null)
  const [operation, setOperation] = useState<MigrationOperation>(null)
  const [error, setError] = useState<Error | null>(null)
  const planRef = useRef<SpaceMigrationPlanHandle | null>(null)

  const available =
    isDesktopMode && typeof window !== "undefined" && Boolean(window.eidos)

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
      const previousPlan = planRef.current
      try {
        const handle = await window.eidos.spaceMigration.createPlan(
          spaceId,
          targetRoot
        )
        planRef.current = handle
        return handle
      } catch (cause) {
        const nextError =
          cause instanceof Error ? cause : new Error(String(cause))
        setError(nextError)
        planRef.current = null
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
    try {
      const nextResult = await window.eidos.spaceMigration.executePlan(
        currentPlan.id
      )
      setResult(nextResult)
      planRef.current = null
      return nextResult
    } catch (cause) {
      const nextError =
        cause instanceof Error ? cause : new Error(String(cause))
      setError(nextError)
      planRef.current = null
      throw nextError
    } finally {
      setOperation(null)
    }
  }, [available])

  return {
    available,
    result,
    operation,
    error,
    createPlan,
    executePlan,
  }
}
