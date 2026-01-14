/**
 * Graft (sync) hook for extension use
 * Uses eidos.currentSpace for all graft operations
 */
import { useCallback, useState } from "react"
import { useEidos } from "@eidos.space/react"
import { useDebounceFn } from "ahooks"

export const useGraft = () => {
  const eidos = useEidos()
  const space = eidos.currentSpace

  const [isPulling, setIsPulling] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [isActiveFetching, setIsActiveFetching] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const [isStatusLoading, setIsStatusLoading] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tags, setTags] = useState<any>(null)
  const [graftInfo, setGraftInfo] = useState<any>(null)
  const [auditResult, setAuditResult] = useState<any>(null)

  const runOp = useCallback(
    async <T>(
      op: () => Promise<T>,
      setLoading: (v: boolean) => void,
      options: { refresh?: boolean; onSuccess?: (res: T) => void } = {
        refresh: true,
      }
    ) => {
      setLoading(true)
      try {
        const res = await op()
        if (options.onSuccess) options.onSuccess(res)
        if (options.refresh) await fetchStatus()
        return res
      } catch (e) {
        console.error(e)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [space]
  )

  const fetchStatus = useCallback(async () => {
    setIsStatusLoading(true)
    try {
      const result = await space.graft.status()
      setStatus(result)
      setLastUpdated(new Date())
    } catch (e) {
      console.error("Failed to fetch graft status", e)
    } finally {
      setIsStatusLoading(false)
    }
  }, [space])

  const pull = useCallback(
    () =>
      runOp(() => space.graft.pull(), setIsPulling, {
        refresh: true,
        onSuccess: () => {
          space.notify({
            title: "Pull completed",
            description: "Reloading app to ensure consistency...",
            actions: [
              { label: "Reload", action: "reload", variant: "primary" },
            ],
          })
        },
      }),
    [runOp, space]
  )

  const push = useCallback(
    () => runOp(() => space.graft.push(), setIsPushing),
    [runOp, space]
  )

  const fetch = useCallback(
    () => runOp(() => space.graft.fetch(), setIsActiveFetching),
    [runOp, space]
  )

  const fetchTags = useCallback(
    () =>
      runOp(
        () => space.graft.tags(),
        () => {},
        {
          refresh: false,
          onSuccess: (res) => setTags(res),
        }
      ),
    [runOp, space]
  )

  const info = useCallback(
    () =>
      runOp(
        () => space.graft.info(),
        () => {},
        {
          refresh: false,
          onSuccess: (res) => setGraftInfo(res),
        }
      ),
    [runOp, space]
  )

  const audit = useCallback(
    () =>
      runOp(
        () => space.graft.audit(),
        () => {},
        {
          refresh: false,
          onSuccess: (res) => setAuditResult(res),
        }
      ),
    [runOp, space]
  )

  const refreshStatus = useCallback(
    () =>
      runOp(
        async () => Promise.all([fetchStatus(), fetchTags(), info(), audit()]),
        setIsFetching,
        {
          refresh: false,
        }
      ),
    [runOp, fetchStatus, fetchTags, info, audit]
  )

  const clone = useCallback(
    async (remoteLogId?: string) => {
      return runOp(
        async () => {
          await space.graft.clone(remoteLogId)
          await space.graft.pull()
          await space.graft.hydrate()
        },
        setIsCloning,
        {
          refresh: true,
          onSuccess: () => {
            space.notify({
              title: "Reset completed",
              description: "Reloading app to ensure consistency...",
              actions: [
                { label: "Reload", action: "reload", variant: "primary" },
              ],
            })
          },
        }
      )
    },
    [runOp, space]
  )

  const { run: debouncedRefreshStatus } = useDebounceFn(refreshStatus, {
    wait: 300,
  })

  return {
    status,
    lastUpdated,
    isStatusLoading,
    isPulling,
    isPushing,
    isFetching,
    isActiveFetching,
    isCloning,
    tags,
    graftInfo,
    auditResult,
    pull,
    push,
    fetch,
    fetchTags,
    refreshStatus,
    debouncedRefreshStatus,
    audit,
    clone,
  }
}
