import { useCallback } from "react"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import type { IExtension, ExtNodeMeta } from "@/packages/core/types/IExtension"

import {
  createSimpleExtensionStore,
  createUseSyncSimpleExtension,
  createUseAllSimpleExtensions,
} from "./use-extension-store-factory"

// Create simple store
const useExtNodeStore = createSimpleExtensionStore<IExtension<ExtNodeMeta>>()

// Create sync hook
export const useSyncExtNodes = createUseSyncSimpleExtension(useExtNodeStore, {
  fetchFn: async (sqlite) => {
    const nodes = await sqlite.extension.getExtNodeExtensions("enabled")
    return nodes as IExtension<ExtNodeMeta>[]
  },
  shouldReload: (_new, _old) => {
    const _oldMeta = _old?.meta
      ? typeof _old.meta === "string"
        ? JSON.parse(_old.meta)
        : _old.meta
      : null
    const _newMeta = _new?.meta
      ? typeof _new.meta === "string"
        ? JSON.parse(_new.meta)
        : _new.meta
      : null
    return (
      (_old?.type === "block" && _oldMeta?.type === "extNode") ||
      (_new?.type === "block" && _newMeta?.type === "extNode")
    )
  },
})

// Create all items hook
const useAll = createUseAllSimpleExtensions(useExtNodeStore)

export const useAllExtNodes = () => {
  const { sqlite } = useSqlite()
  const { items: extNodes, loading } = useAll()

  const reload = useCallback(async () => {
    if (!sqlite) return
    const nodes = await sqlite.extension.getExtNodeExtensions("enabled")
    useExtNodeStore.getState().setItems(nodes as IExtension<ExtNodeMeta>[])
    useExtNodeStore.getState().setLoading(false)
  }, [sqlite])

  return {
    extNodes,
    reload,
    loading,
  }
}
