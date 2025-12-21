import { useCallback, useEffect, useState } from "react"
import { useDebounce, useDebounceFn } from "ahooks"

import { toast } from "@/components/ui/use-toast"
import {
  EidosDataEventChannelName,
  type EidosDataEventChannelMsg,
} from "@/lib/const"

import { useSqlite } from "./use-sqlite"
import { useSpaceSyncStatus } from "./use-sync-status"

export const useGraft = () => {
  const { sqlite } = useSqlite()
  const {
    status,
    lastUpdated,
    isLoading: isStatusLoading,
    fetchStatus,
  } = useSpaceSyncStatus()

  const [isPulling, setIsPulling] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [isVolumesFetching, setIsVolumesFetching] = useState(false)
  const [isTagsLoading, setIsTagsLoading] = useState(false)
  const [isActiveFetching, setIsActiveFetching] = useState(false)
  const [isCloning, setIsCloning] = useState(false)
  const [isHydrating, setIsHydrating] = useState(false)
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
      if (!sqlite) return
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
    [sqlite, fetchStatus]
  )

  const pull = useCallback(
    () => runOp(() => sqlite!.pull(), setIsPulling, {
      refresh: true,
      onSuccess: () => {
        // Show notification and reload app to ensure state consistency after pull
        toast({
          title: "Pull completed",
          description: "Reloading app to ensure consistency...",
        })
        setTimeout(() => window.location.reload(), 1000)
      }
    }),
    [runOp, sqlite]
  )
  const push = useCallback(
    () => runOp(() => sqlite!.push(), setIsPushing),
    [runOp, sqlite]
  )
  const fetch = useCallback(
    () => runOp(() => sqlite!.fetch(), setIsActiveFetching),
    [runOp, sqlite]
  )
  const hydrate = useCallback(
    () => runOp(() => sqlite!.hydrate(), setIsHydrating),
    [runOp, sqlite]
  )
  const volumes = useCallback(
    () =>
      runOp(() => sqlite!.volumes(), setIsVolumesFetching, {
        refresh: false,
      }),
    [runOp, sqlite]
  )
  const fetchTags = useCallback(
    () =>
      runOp(() => sqlite!.tags(), setIsTagsLoading, {
        refresh: false,
        onSuccess: (res) => setTags(res),
      }),
    [runOp, sqlite]
  )

  const info = useCallback(
    () =>
      runOp(
        () => sqlite!.info(),
        () => {},
        {
          refresh: false,
          onSuccess: (res) => setGraftInfo(res),
        }
      ),
    [runOp, sqlite]
  )

  const audit = useCallback(
    () =>
      runOp(
        () => sqlite!.audit(),
        () => {},
        {
          refresh: false,
          onSuccess: (res) => setAuditResult(res),
        }
      ),
    [runOp, sqlite]
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
      return runOp(async () => {
        await sqlite!.clone(remoteLogId)
        await sqlite!.pull()
        await sqlite!.hydrate()
      }, setIsCloning, {
        refresh: true,
        onSuccess: () => {
          // Show notification and reload app to ensure state consistency after reset/clone
          toast({
            title: "Reset completed",
            description: "Reloading app to ensure consistency...",
          })
          setTimeout(() => window.location.reload(), 1000)
        }
      })
    },
    [runOp, sqlite]
  )

  const { run: debouncedRefreshStatus } = useDebounceFn(refreshStatus, {
    wait: 300,
  })
  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)

    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      debouncedRefreshStatus()
    }

    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
      bc.close()
    }
  }, [debouncedRefreshStatus])

  return {
    status,
    lastUpdated,
    isStatusLoading,
    isPulling,
    isPushing,
    isFetching,
    isVolumesFetching,
    isTagsLoading,
    isActiveFetching,
    isCloning,
    isHydrating,
    tags,
    graftInfo,
    auditResult,
    pull,
    push,
    fetch,
    hydrate,
    volumes,
    fetchTags,
    refreshStatus,
    audit,
    clone,
    sqlite,
  }
}
