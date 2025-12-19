import { useCallback, useState } from "react"

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
    () => runOp(() => sqlite!.pull(), setIsPulling),
    [runOp, sqlite]
  )
  const push = useCallback(
    () => runOp(() => sqlite!.push(), setIsPushing),
    [runOp, sqlite]
  )
  const fetchActive = useCallback(
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

  const refreshStatus = useCallback(
    () =>
      runOp(
        async () => Promise.all([fetchStatus(), fetchTags()]),
        setIsFetching,
        {
          refresh: false,
        }
      ),
    [runOp, fetchStatus, fetchTags]
  )

  const clone = useCallback(
    async (remoteLogId: string) => {
      return runOp(async () => {
        await sqlite!.clone(remoteLogId)
        await sqlite!.pull()
        await sqlite!.hydrate()
      }, setIsCloning)
    },
    [runOp, sqlite]
  )

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
    pull,
    push,
    fetchActive,
    hydrate,
    volumes,
    fetchTags,
    refreshStatus,
    clone,
    sqlite,
  }
}
