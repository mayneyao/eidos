/**
 * Graft (sync) hook for extension use
 * Uses eidos.currentSpace for all graft operations
 */
import { useCallback, useState } from "react"
import { useEidos } from "@eidos.space/react"
import { useDebounceFn } from "ahooks"
import type {
  GraftCheckoutResult,
  GraftConflictListResult,
  GraftConflictResolveTarget,
  GraftConflictResolution,
  GraftDiffResult,
  GraftLogResult,
  GraftResolveConflictResult,
  GraftShowResult,
  GraftTableLogResult,
} from "@eidos.space/sync"

type GraftResetMode = "soft" | "mixed" | "hard"

export const useGraft = () => {
  const eidos = useEidos()
  const space = eidos.currentSpace

  const [isPulling, setIsPulling] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [isActiveFetching, setIsActiveFetching] = useState(false)
  const [isCommitLoading, setIsCommitLoading] = useState(false)
  const [isCompletingMerge, setIsCompletingMerge] = useState(false)
  const [isAbortingMerge, setIsAbortingMerge] = useState(false)
  const [isConflictsLoading, setIsConflictsLoading] = useState(false)
  const [isResolvingConflict, setIsResolvingConflict] = useState(false)
  const [isStatusLoading, setIsStatusLoading] = useState(false)
  const [status, setStatus] = useState<any>(null)
  const [conflicts, setConflicts] = useState<GraftConflictListResult | null>(
    null
  )
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [branches, setBranches] = useState<any>(null)
  const [graftInfo, setGraftInfo] = useState<any>(null)
  const [auditResult, setAuditResult] = useState<any>(null)

  // Version control state
  const [log, setLog] = useState<GraftLogResult | null>(null)
  const [isLogLoading, setIsLogLoading] = useState(false)
  const [show, setShow] = useState<GraftShowResult | null>(null)
  const [isShowLoading, setIsShowLoading] = useState(false)
  const [diff, setDiff] = useState<GraftDiffResult | null>(null)
  const [isDiffLoading, setIsDiffLoading] = useState(false)
  const [checkout, setCheckout] = useState<GraftCheckoutResult | null>(null)
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false)
  const [isResetLoading, setIsResetLoading] = useState(false)
  const [tableLog, setTableLog] = useState<GraftTableLogResult | null>(null)
  const [isTableLogLoading, setIsTableLogLoading] = useState(false)

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
        onSuccess: (res: any) => {
          const rawMessage = String(res?.rawMessage ?? res?.message ?? "")
          const isMerge =
            /merge/i.test(rawMessage) ||
            Boolean(res?.merge || res?.mergeHead || res?.merge_head)
          space.notify({
            title: isMerge ? "Merge prepared" : "Pull completed",
            description: isMerge
              ? "Review the merge changes and complete the merge."
              : "Remote changes were pulled into this space.",
            ...(isMerge
              ? {}
              : {
                  actions: [
                    { label: "Reload", action: "reload", variant: "primary" },
                  ],
                }),
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

  const commit = useCallback(
    (message?: string) =>
      runOp(() => space.graft.commit(message), setIsCommitLoading, {
        refresh: true,
      }),
    [runOp, space]
  )

  const completeMerge = useCallback(
    (message?: string) =>
      runOp(() => space.graft.completeMerge(message), setIsCompletingMerge, {
        refresh: true,
      }),
    [runOp, space]
  )

  const abortMerge = useCallback(
    () =>
      runOp(() => space.graft.abortMerge(), setIsAbortingMerge, {
        refresh: true,
      }),
    [runOp, space]
  )

  const fetchConflicts = useCallback(
    () =>
      runOp(
        () => space.graft.conflicts() as Promise<GraftConflictListResult>,
        setIsConflictsLoading,
        {
          refresh: false,
          onSuccess: (res) => setConflicts(res),
        }
      ),
    [runOp, space]
  )

  const resolveConflict = useCallback(
    async (
      resolution: GraftConflictResolution,
      path?: string,
      target?: GraftConflictResolveTarget
    ) => {
      setIsResolvingConflict(true)
      try {
        const res = (await space.graft.resolveConflict(
          resolution,
          path,
          target
        )) as GraftResolveConflictResult
        await fetchStatus()
        await fetchConflicts()
        return res
      } catch (e) {
        console.error(e)
        throw e
      } finally {
        setIsResolvingConflict(false)
      }
    },
    [space, fetchStatus, fetchConflicts]
  )

  const snapshot = useCallback(
    () =>
      runOp(() => space.graft.snapshot(), setIsCommitLoading, {
        refresh: true,
      }),
    [runOp, space]
  )

  const fetchBranches = useCallback(
    () =>
      runOp(
        () => space.graft.branches(),
        () => {},
        {
          refresh: false,
          onSuccess: (res) => setBranches(res),
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

  // -------------------------------------------------------------------
  // Version control
  // -------------------------------------------------------------------

  const fetchLog = useCallback(
    () =>
      runOp(
        () => space.graft.log() as Promise<GraftLogResult>,
        setIsLogLoading,
        {
          refresh: false,
          onSuccess: (res) => setLog(res),
        }
      ),
    [runOp, space]
  )

  const fetchShow = useCallback(
    (lsn: string | number) =>
      runOp(
        () => space.graft.show(lsn) as Promise<GraftShowResult>,
        setIsShowLoading,
        {
          refresh: false,
          onSuccess: (res) => setShow(res),
        }
      ),
    [runOp, space]
  )

  const fetchDiff = useCallback(
    (
      from: string | number,
      to?: string | number,
      mode: "summary" | "rows" = "summary"
    ) =>
      runOp(
        () => space.graft.diff(from, to, mode) as Promise<GraftDiffResult>,
        setIsDiffLoading,
        {
          refresh: false,
          onSuccess: (res) => setDiff(res),
        }
      ),
    [runOp, space]
  )

  const checkoutLsn = useCallback(
    (lsn: string | number) =>
      runOp(
        () => space.graft.checkoutLsn(lsn) as Promise<GraftCheckoutResult>,
        setIsCheckoutLoading,
        {
          refresh: false,
          onSuccess: (res) => {
            setCheckout(res)
            window.location.reload()
          },
        }
      ),
    [runOp, space]
  )

  const fetchTableLog = useCallback(
    (tableName: string) =>
      runOp(
        () => space.graft.tableLog(tableName) as Promise<GraftTableLogResult>,
        setIsTableLogLoading,
        {
          refresh: false,
          onSuccess: (res) => setTableLog(res),
        }
      ),
    [runOp, space]
  )

  const resetTo = useCallback(
    (lsn: string | number, mode: GraftResetMode = "hard") =>
      runOp(() => space.graft.resetTo(lsn, mode), setIsResetLoading, {
        refresh: true,
        onSuccess: () => {
          window.location.reload()
        },
      }),
    [runOp, space]
  )

  const refreshStatus = useCallback(
    () =>
      runOp(
        async () =>
          Promise.all([fetchStatus(), fetchBranches(), info(), audit()]),
        setIsFetching,
        {
          refresh: false,
        }
      ),
    [runOp, fetchStatus, fetchBranches, info, audit]
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
    isCommitLoading,
    isCompletingMerge,
    isAbortingMerge,
    isConflictsLoading,
    isResolvingConflict,
    branches,
    graftInfo,
    auditResult,
    conflicts,
    fetchStatus,
    pull,
    push,
    fetch,
    commit,
    completeMerge,
    abortMerge,
    fetchConflicts,
    resolveConflict,
    snapshot,
    fetchBranches,
    refreshStatus,
    debouncedRefreshStatus,
    audit,
    // version control
    log,
    isLogLoading,
    fetchLog,
    show,
    isShowLoading,
    fetchShow,
    diff,
    isDiffLoading,
    fetchDiff,
    checkout,
    isCheckoutLoading,
    checkoutLsn,
    isResetLoading,
    resetTo,
    tableLog,
    isTableLogLoading,
    fetchTableLog,
  }
}
