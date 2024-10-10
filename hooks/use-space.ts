import { useCallback, useEffect } from "react"

import { useLastOpened } from "@/apps/web-app/[database]/hook"
import { MsgType } from "@/lib/const"
import { getWorker } from "@/lib/sqlite/worker"
import { SpaceFileSystem } from "@/lib/storage/space"
import { uuidv7 } from "@/lib/utils"

import { isDesktopMode } from "@/lib/env"
import { useSqlite, useSqliteStore } from "./use-sqlite"

export const useSpaceFileSystem = () => {
  const spaceFileSystem = isDesktopMode
    ? window.eidos.spaceFileSystem
    : new SpaceFileSystem()
  return { spaceFileSystem }
}

export const useSpace = () => {
  const { setSpaceList, spaceList } = useSqliteStore()
  const { sqlite } = useSqlite()
  const { setLastOpenedDatabase } = useLastOpened()
  const { spaceFileSystem } = useSpaceFileSystem()
  const updateSpaceList = useCallback(async () => {
    const spaceNames = await spaceFileSystem.list()
    setSpaceList(spaceNames)
  }, [setSpaceList])

  useEffect(() => {
    updateSpaceList()
  }, [setSpaceList, updateSpaceList])

  const exportSpace = useCallback(async (spaceName: string) => {
    await spaceFileSystem.export(spaceName)
  }, [])

  const deleteSpace = useCallback(
    async (spaceName: string) => {
      await spaceFileSystem.remove(spaceName)
      setLastOpenedDatabase("")
      await updateSpaceList()
    },
    [setLastOpenedDatabase, updateSpaceList]
  )

  const rebuildIndex = useCallback(async () => {
    await sqlite?.doc.rebuildIndex({
      recreateFtsTable: true
    })
  }, [])

  const createSpace = useCallback(async (spaceName: string) => {
    await spaceFileSystem.create(spaceName)

    if (isDesktopMode) {
      const res = await window.eidos.invoke(MsgType.CreateSpace, { spaceName })
      return res
    } else {
      const msgId = uuidv7()
      const worker = getWorker()

      const channel = new MessageChannel()
      worker.postMessage(
        {
          type: MsgType.CreateSpace,
          data: {
            spaceName,
          },
          id: msgId,
        },
        [channel.port2]
      )
      return new Promise((resolve) => {
        channel.port1.onmessage = (e) => {
          if (e.data.id === msgId) {
            resolve(e.data.data)
          }
          // close the channel
          channel.port1.close()
        }
      })
    }
  }, [])

  return {
    spaceList,
    updateSpaceList,
    createSpace,
    exportSpace,
    deleteSpace,
    rebuildIndex
  }
}
