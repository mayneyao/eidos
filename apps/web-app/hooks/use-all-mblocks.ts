import { useCallback } from "react"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import type { IExtension } from "@/packages/core/meta-table/extension"

import {
  createSimpleExtensionStore,
  createUseSyncSimpleExtension,
  createUseAllSimpleExtensions,
} from "./use-extension-store-factory"

// Create simple store
const useMblockStore = createSimpleExtensionStore<IExtension>()

// Create sync hook
export const useSyncMblocks = createUseSyncSimpleExtension(useMblockStore, {
  fetchFn: async (sqlite) => {
    return sqlite.extension.findMany({
      where: {
        type: "block",
        enabled: true,
      },
      select: {
        id: true,
        name: true,
        icon: true,
        type: true,
        enabled: true,
        created_at: true,
        updated_at: true,
      },
    })
  },
  shouldReload: (_new, _old) => {
    return _old?.type === "block" || _new?.type === "block"
  },
})

// Create all items hook
const useAll = createUseAllSimpleExtensions(useMblockStore)

export const useAllMblocks = () => {
  const { sqlite } = useSqlite()
  const { items: mblocks, loading } = useAll()

  const reload = useCallback(async () => {
    if (!sqlite) return
    useMblockStore.getState().setLoading(true)
    const items = await sqlite.extension.findMany({
      where: {
        type: "block",
        enabled: true,
      },
      select: {
        id: true,
        name: true,
        icon: true,
        type: true,
        enabled: true,
        created_at: true,
        updated_at: true,
      } as any,
    })
    useMblockStore.getState().setItems(items)
    useMblockStore.getState().setLoading(false)
  }, [sqlite])

  return {
    mblocks,
    loading,
    reload,
  }
}
