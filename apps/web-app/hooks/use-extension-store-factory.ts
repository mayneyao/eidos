import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import type { EidosDataEventChannelMsg } from "@/lib/const"
import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { ExtensionTableName } from "@/packages/core/sqlite/const"
import type { IExtension } from "@/packages/core/types/IExtension"
import { useCallback, useEffect } from "react"
import { create, type StoreApi, type UseBoundStore } from "zustand"

// ============================================
// Types
// ============================================

export interface ExtensionStoreState<T> {
  items: T[]
  loading: boolean
  setItems: (items: T[]) => void
  addItem: (item: T) => void
  updateItem: (item: T) => void
  removeItem: (id: string) => void
  setLoading: (loading: boolean) => void
  reload?: () => Promise<void>
  setReload: (reload: () => Promise<void>) => void
}

export interface UseSyncExtensionOptions<T> {
  /** Filter function to determine if an extension matches this type */
  filterFn: (ext: IExtension) => boolean
  /** The meta type value to check (e.g., BlockExtensionType.FileHandler) */
  metaTypeValue: string
  /** Whether to enable fine-grained updates (add/update/remove) or just reload */
  fineGrainedUpdates?: boolean
}

export interface UseAllExtensionsOptions<T> {
  /** Optional transform function to merge items with other sources (e.g., built-in handlers) */
  transform?: (dbItems: T[]) => T[]
}

// ============================================
// Store Factory
// ============================================

export function createExtensionStore<T extends IExtension>(): UseBoundStore<
  StoreApi<ExtensionStoreState<T>>
> {
  return create<ExtensionStoreState<T>>((set) => ({
    items: [],
    loading: false,
    setItems: (items) => set({ items }),
    addItem: (item) =>
      set((state) => {
        const existingIndex = state.items.findIndex((i) => i.id === item.id)
        if (existingIndex !== -1) {
          return {
            items: state.items.map((i) => (i.id === item.id ? item : i)),
          }
        }
        return { items: [...state.items, item] }
      }),
    updateItem: (item) =>
      set((state) => ({
        items: state.items.map((i) => (i.id === item.id ? item : i)),
      })),
    removeItem: (id) =>
      set((state) => ({
        items: state.items.filter((i) => i.id !== id),
      })),
    setLoading: (loading) => set({ loading }),
    setReload: (reload) => set({ reload }),
  }))
}

// ============================================
// Sync Hook Factory
// ============================================

export function createUseSyncExtension<T extends IExtension>(
  useStore: UseBoundStore<StoreApi<ExtensionStoreState<T>>>,
  options: UseSyncExtensionOptions<T>
) {
  const { filterFn, metaTypeValue, fineGrainedUpdates = true } = options

  return function useSyncExtension() {
    const { sqlite } = useSqlite()
    const setItems = useStore((state) => state.setItems)
    const addItem = useStore((state) => state.addItem)
    const updateItem = useStore((state) => state.updateItem)
    const removeItem = useStore((state) => state.removeItem)
    const setLoading = useStore((state) => state.setLoading)
    const setReload = useStore((state) => state.setReload)

    const reload = useCallback(async () => {
      if (!sqlite) return

      setLoading(true)
      try {
        const allExtensions = await sqlite.extension.list()
        const items = allExtensions.filter(filterFn) as T[]
        setItems(items)
      } catch (error) {
        console.error(`Failed to fetch ${metaTypeValue} items:`, error)
        setItems([])
      } finally {
        setLoading(false)
      }
    }, [sqlite, setItems, setLoading])

    useEffect(() => {
      setReload(reload)
    }, [reload, setReload])

    useEffect(() => {
      reload()
    }, [reload])

    useEffect(() => {
      const bc = new BroadcastChannel(EidosDataEventChannelName)

      const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
        const { type, payload } = ev.data
        if (type !== EidosDataEventChannelMsgType.MetaTableUpdateSignalType)
          return

        const { table, _new, _old, type: updateType } = payload
        if (table !== ExtensionTableName) return

        try {
          if (fineGrainedUpdates) {
            // Fine-grained updates: add/update/remove individual items
            switch (updateType) {
              case DataUpdateSignalType.Insert:
              case DataUpdateSignalType.Update:
                if (_new) {
                  const meta =
                    typeof _new.meta === "string"
                      ? JSON.parse(_new.meta)
                      : _new.meta

                  if (meta?.type === metaTypeValue) {
                    const extension = {
                      ..._new,
                      meta,
                    } as unknown as T

                    if (updateType === DataUpdateSignalType.Insert) {
                      addItem(extension)
                    } else {
                      updateItem(extension)
                    }
                  } else if (_old) {
                    // If it was this type before but now isn't, remove it
                    const oldMeta =
                      typeof _old.meta === "string"
                        ? JSON.parse(_old.meta)
                        : _old.meta
                    if (oldMeta?.type === metaTypeValue) {
                      removeItem(_old.id)
                    }
                  }
                }
                break

              case DataUpdateSignalType.Delete:
                if (_old?.id) {
                  const meta =
                    typeof _old.meta === "string"
                      ? JSON.parse(_old.meta)
                      : _old.meta

                  if (meta?.type === metaTypeValue) {
                    removeItem(_old.id)
                  }
                }
                break
            }
          } else {
            // Simple reload mode: just reload all items
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

            const isTargetExtension =
              (_old?.type === "block" && _oldMeta?.type === metaTypeValue) ||
              (_new?.type === "block" && _newMeta?.type === metaTypeValue) ||
              (_old?.type === "script" && _oldMeta?.type === metaTypeValue) ||
              (_new?.type === "script" && _newMeta?.type === metaTypeValue)

            if (isTargetExtension) {
              reload()
            }
          }
        } catch (error) {
          console.warn("Failed to parse extension meta:", error)
        }
      }

      bc.addEventListener("message", handler)
      return () => {
        bc.removeEventListener("message", handler)
        bc.close()
      }
    }, [reload, addItem, updateItem, removeItem])
  }
}

// ============================================
// All Items Hook Factory
// ============================================

export function createUseAllExtensions<T extends IExtension>(
  useStore: UseBoundStore<StoreApi<ExtensionStoreState<T>>>,
  options?: UseAllExtensionsOptions<T>
) {
  const { transform } = options || {}

  return function useAllExtensions() {
    const items = useStore((state) => state.items)
    const loading = useStore((state) => state.loading)
    const reload = useStore((state) => state.reload)

    const finalItems = transform ? transform(items) : items

    return {
      items: finalItems,
      loading,
      reload,
    }
  }
}

// ============================================
// Legacy Simple Store Factory (for ext-nodes, mblocks)
// ============================================

export interface SimpleExtensionStoreState<T> {
  items: T[]
  loading: boolean
  setItems: (items: T[]) => void
  setLoading: (loading: boolean) => void
}

export function createSimpleExtensionStore<
  T extends IExtension,
>(): UseBoundStore<StoreApi<SimpleExtensionStoreState<T>>> {
  return create<SimpleExtensionStoreState<T>>((set) => ({
    items: [],
    loading: false,
    setItems: (items) => set({ items }),
    setLoading: (loading) => set({ loading }),
  }))
}

export interface UseSyncSimpleExtensionOptions<T> {
  /** Function to fetch items from database */
  fetchFn: (sqlite: any) => Promise<T[]>
  /** Optional filter to check if broadcast event is relevant */
  shouldReload?: (_new: any, _old: any) => boolean
}

export function createUseSyncSimpleExtension<T extends IExtension>(
  useStore: UseBoundStore<StoreApi<SimpleExtensionStoreState<T>>>,
  options: UseSyncSimpleExtensionOptions<T>
) {
  const { fetchFn, shouldReload } = options

  return function useSyncSimpleExtension() {
    const { sqlite } = useSqlite()
    const setItems = useStore((state) => state.setItems)
    const setLoading = useStore((state) => state.setLoading)

    const reload = useCallback(async () => {
      if (!sqlite) return
      setLoading(true)
      try {
        const items = await fetchFn(sqlite)
        setItems(items)
      } catch (error) {
        console.error("Failed to fetch items:", error)
        setItems([])
      } finally {
        setLoading(false)
      }
    }, [sqlite, setItems, setLoading])

    useEffect(() => {
      reload()
    }, [reload])

    useEffect(() => {
      const bc = new BroadcastChannel(EidosDataEventChannelName)

      const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
        const { type, payload } = ev.data
        if (type !== EidosDataEventChannelMsgType.MetaTableUpdateSignalType)
          return

        const { table, _new, _old } = payload
        if (table !== ExtensionTableName) return

        if (!shouldReload || shouldReload(_new, _old)) {
          reload()
        }
      }

      bc.addEventListener("message", handler)
      return () => {
        bc.removeEventListener("message", handler)
        bc.close()
      }
    }, [reload])
  }
}

export function createUseAllSimpleExtensions<T extends IExtension>(
  useStore: UseBoundStore<StoreApi<SimpleExtensionStoreState<T>>>
) {
  return function useAllSimpleExtensions() {
    const items = useStore((state) => state.items)
    const loading = useStore((state) => state.loading)

    return {
      items,
      loading,
    }
  }
}
