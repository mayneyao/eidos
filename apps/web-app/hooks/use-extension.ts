import type { IExtension } from "@/packages/core/types/IExtension"
import { useCallback, useEffect, useState } from "react"

import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import type { EidosDataEventChannelMsg } from "@/lib/const"
import {
  DataUpdateSignalType,
  EidosDataEventChannelMsgType,
  EidosDataEventChannelName,
} from "@/lib/const"
import { ExtensionTableName } from "@/packages/core/sqlite/const"

export const useExtension = () => {
  const { sqlite } = useSqlite()
  const [installLoading, setInstallLoading] = useState(false)

  const addExtension = useCallback(
    async (extension: IExtension) => {
      if (!sqlite) return
      await sqlite.extension.add(extension)
      console.log("addExtension", extension)
    },
    [sqlite]
  )

  const deleteExtension = useCallback(
    async (id: string) => {
      if (!sqlite) return
      await sqlite.extension.del(id)
      console.log("deleteExtension", id)
    },
    [sqlite]
  )

  const updateExtension = useCallback(
    async (extension: Partial<IExtension>) => {
      if (!sqlite || !extension.id) return
      await sqlite.extension.set(extension.id, extension)
      console.log("updateExtension", extension)
    },
    [sqlite]
  )

  const installExtension = async (extension: IExtension) => {
    setInstallLoading(true)
    extension && (await addExtension(extension))
    setInstallLoading(false)
  }
  const enableExtension = useCallback(
    async (id: string) => {
      if (!sqlite) return
      await sqlite.extension.enable(id)
      console.log("enableExtension", id)
    },
    [sqlite]
  )

  const disableExtension = useCallback(
    async (id: string) => {
      if (!sqlite) return
      await sqlite.extension.disable(id)
      console.log("disableExtension", id)
    },
    [sqlite]
  )

  return {
    addExtension,
    deleteExtension,
    updateExtension,
    installExtension,
    installLoading,
    enableExtension,
    disableExtension,
  }
}

export const useExtensionByIdOrSlug = (id?: string) => {
  const { sqlite } = useSqlite()
  const [extension, setExtension] = useState<IExtension | null>(null)
  useEffect(() => {
    if (!sqlite || !id) return
    const fetchExtension = async () => {
      const extension = await sqlite.extension.getExtensionBySlugOrId(id)
      setExtension(extension)
    }
    fetchExtension()
  }, [sqlite, id])

  useEffect(() => {
    const bc = new BroadcastChannel(EidosDataEventChannelName)

    const handler = async (ev: MessageEvent<EidosDataEventChannelMsg>) => {
      const { type, payload } = ev.data
      if (type === EidosDataEventChannelMsgType.MetaTableUpdateSignalType) {
        const { table, _new, _old, type: updateType } = payload
        if (table !== ExtensionTableName) return
        try {
          switch (updateType) {
            case DataUpdateSignalType.Update:
              if (_new?.id === id) {
                setExtension(_new as unknown as IExtension)
              }
              break
            default:
              break
          }
        } finally {
        }
      }
    }

    bc.addEventListener("message", handler)
    return () => {
      bc.removeEventListener("message", handler)
      bc.close()
    }
  }, [])

  if (!id) return null
  return extension
}
