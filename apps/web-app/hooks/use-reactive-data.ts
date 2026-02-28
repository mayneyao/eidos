import type { EidosDataEventChannelMsg } from "@/lib/const"
import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import type { DataSpace } from "@eidos.space/core/data-space"
import type { BaseTableImpl } from "@/packages/core/meta-table/base"
import { useEffect, useState, useSyncExternalStore } from "react"
import { z } from "zod"

// Base type that all reactive data must extend
type BaseReactiveData = {
  id: string
} & Record<string, any>

type CommonData = BaseReactiveData
interface ReactiveDataConfig<T extends BaseReactiveData> {
  modeName: string
  // schema: z.ZodType<T>
  get?: (sqlite: DataSpace, id: string) => Promise<T>
  set?: (sqlite: DataSpace, data: T) => Promise<void>
  del?: (sqlite: DataSpace, data: T) => Promise<void>
  add?: (sqlite: DataSpace, data: T) => Promise<void>
  list?: (sqlite: DataSpace) => Promise<T[]>
}

interface ReactiveDataState<T extends BaseReactiveData> {
  items: Record<string, T>
  itemsList: T[]
}

export function createReactiveData<T extends BaseReactiveData>(
  config: ReactiveDataConfig<T>
) {
  // Create a store instance
  let state: ReactiveDataState<T> = {
    items: {},
    itemsList: [],
  }

  const tableName = config.modeName
  const defaultSet = async (sqlite: DataSpace, data: CommonData) => {
    ;(sqlite[tableName as keyof DataSpace] as BaseTableImpl).set(data.id, data)
  }
  const defaultDel = async (sqlite: DataSpace, data: CommonData) => {
    ;(sqlite[tableName as keyof DataSpace] as BaseTableImpl).del(data.id)
  }
  const defaultAdd = async (sqlite: DataSpace, data: CommonData) => {
    ;(sqlite[tableName as keyof DataSpace] as BaseTableImpl).add(data)
  }

  const defaultGet = async (sqlite: DataSpace, id: string) => {
    return (sqlite[tableName as keyof DataSpace] as BaseTableImpl).get(id)
  }

  const defaultList = async (
    sqlite: DataSpace,
    params?: Record<string, any>,
    options?: Record<string, any>
  ) => {
    return (sqlite[tableName as keyof DataSpace] as BaseTableImpl).list(
      params,
      options
    )
  }

  let listeners: Set<() => void> = new Set()

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const getSnapshot = () => state

  const setState = (newState: ReactiveDataState<T>) => {
    state = newState
    listeners.forEach((listener) => listener())
  }

  const addItem = (item: T) => {
    const newItems = { ...state.items, [item.id]: item }
    const newItemsList = state.itemsList.some((i) => i.id === item.id)
      ? state.itemsList.map((i) => (i.id === item.id ? item : i))
      : [...state.itemsList, item]

    setState({
      items: newItems,
      itemsList: newItemsList,
    })
  }
  const setItem = (item: T) => {
    const newItems = { ...state.items, [item.id]: item }
    const newItemsList = state.itemsList.map((i) =>
      i.id === item.id ? item : i
    )
    setState({
      items: newItems,
      itemsList: newItemsList,
    })
  }

  const removeItem = (id: string) => {
    setState({
      items: Object.fromEntries(
        Object.entries(state.items).filter(([key]) => key !== id)
      ),
      itemsList: state.itemsList.filter((item) => item.id !== id),
    })
  }

  const useStore = () => {
    return useSyncExternalStore(subscribe, getSnapshot)
  }

  const {
    set = defaultSet,
    del = defaultDel,
    add = defaultAdd,
    list = defaultList,
    get = defaultGet,
  } = config

  const useReactiveOperations = (sqlite: DataSpace | null) => {
    const store = useStore()

    const insert = async (data: Omit<T, "created_at" | "updated_at">) => {
      if (!sqlite) {
        throw new Error("Sqlite is not initialized")
      }
      try {
        const newItem = data as T
        addItem(newItem)
        add(sqlite, newItem)
        return newItem
      } catch (error) {
        console.error("Failed to insert:", error)
        throw error
      }
    }

    const update = async (
      id: string,
      data: Partial<Omit<T, "id" | "created_at" | "updated_at">>
    ) => {
      if (!sqlite) {
        throw new Error("Sqlite is not initialized")
      }
      try {
        const existing = store.items[id]
        if (!existing) throw new Error("Item not found")

        const updatedItem = {
          ...existing,
          ...data,
          updated_at: new Date().toISOString(),
        } as T

        addItem(updatedItem)
        set(sqlite, updatedItem)
        return updatedItem
      } catch (error) {
        console.error("Failed to update:", error)
        throw error
      }
    }

    const remove = async (id: string) => {
      if (!sqlite) {
        throw new Error("Sqlite is not initialized")
      }
      try {
        const item = store.items[id]
        if (!item) throw new Error("Item not found")

        removeItem(id)
        del(sqlite, item)
        return true
      } catch (error) {
        console.error("Failed to delete:", error)
        throw error
      }
    }

    return {
      insert,
      update,
      delete: remove,
    }
  }

  const useItemById = (sqlite: DataSpace | null, id: string) => {
    const [loading, setLoading] = useState(false)
    const store = useStore()
    const cachedItem = store.items[id]

    useEffect(() => {
      if (cachedItem) {
        return
      }

      if (sqlite && id) {
        setLoading(true)
        get(sqlite, id)
          .then((fetchedItem) => {
            if (fetchedItem) {
              const typedItem = fetchedItem as T
              addItem(typedItem)
            }
          })
          .finally(() => {
            setLoading(false)
          })
      }
    }, [id, sqlite, cachedItem])

    return {
      data: cachedItem || null,
      loading,
    }
  }

  const useItemsList = (
    sqlite: DataSpace | null,
    params?: Record<string, any>,
    options?: Record<string, any>
  ) => {
    const store = useStore()
    const [loading, setLoading] = useState(true)

    const paramsKey = JSON.stringify(params)
    const optionsKey = JSON.stringify(options)

    useEffect(() => {
      if (!sqlite) {
        setLoading(false)
        setState({ items: {}, itemsList: [] })
        return
      }

      setLoading(true)
      list(sqlite, params, options)
        .then((items) => {
          const newItems = items.reduce(
            (acc, item) => {
              acc[item.id] = item
              return acc
            },
            {} as Record<string, T>
          )
          setState({ items: newItems, itemsList: items })
          setLoading(false)
        })
        .catch((error) => {
          console.error("Failed to list items:", error)
          setLoading(false)
          setState({ items: {}, itemsList: [] })
        })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sqlite, paramsKey, optionsKey])

    return {
      data: store.itemsList,
      loading,
    }
  }

  const useReload = (sqlite: DataSpace | null) => {
    const reload = async (
      params?: Record<string, any>,
      options?: Record<string, any>
    ) => {
      if (!sqlite) return
      const items = await list(sqlite, params, options)
      const newItems = items.reduce(
        (acc, item) => {
          acc[item.id] = item
          return acc
        },
        {} as Record<string, T>
      )
      setState({ items: newItems, itemsList: items })
    }
    return reload
  }

  const useSyncWithBroadcast = (sqlite: DataSpace | null) => {
    const reload = async () => {
      if (!sqlite) return
      const items = await list(sqlite)
      const newItems = items.reduce(
        (acc, item) => {
          acc[item.id] = item
          return acc
        },
        {} as Record<string, T>
      )
      setState({ items: newItems, itemsList: items })
    }

    useEffect(() => {
      const bc = new BroadcastChannel(EidosDataEventChannelName)

      const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
        const { type, payload } = ev.data
        if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
          const { table, _new, _old, type: updateType } = payload
          if (table !== config.modeName) return

          // when data is updated, we need to reload the data from the database. it's simple but not efficient.
          // we should use a more efficient way to update the data.
          switch (updateType) {
            case DataUpdateSignalType.Insert:
              // const validatedNew = config.schema.parse(_new)
              // addItem(validatedNew as T)
              reload()
              break

            case DataUpdateSignalType.Update:
              // const validatedUpdate = config.schema.parse(_new)
              // setItem(validatedUpdate as T)
              reload()
              break

            case DataUpdateSignalType.Delete:
              if (_old?.id) {
                removeItem(_old.id)
              }
              reload()
              break

            default:
              break
          }
        }
      }

      bc.addEventListener("message", handler)
      return () => {
        bc.removeEventListener("message", handler)
        bc.close()
      }
    }, [])
  }

  return {
    useReactiveOperations,
    useItemById,
    useItemsList,
    useSyncWithBroadcast,
    useStore,
    useReload,
  }
}
