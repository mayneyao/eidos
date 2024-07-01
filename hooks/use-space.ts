import { useCallback, useEffect } from "react"

import { MsgType } from "@/lib/const"
import { getWorker } from "@/lib/sqlite/worker"
import { spaceFileSystem } from "@/lib/storage/space"
import { uuidv4 } from "@/lib/utils"
import { useLastOpened } from "@/app/[database]/hook"

import { useSqliteStore } from "./use-sqlite"

export const useSpace = () => {
  const { setSpaceList, spaceList } = useSqliteStore()
  const { setLastOpenedDatabase } = useLastOpened()
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

  const createSpace = useCallback(async (spaceName: string) => {
    const msgId = uuidv4()
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

    await spaceFileSystem.create(spaceName)
    return new Promise((resolve) => {
      channel.port1.onmessage = (e) => {
        if (e.data.id === msgId) {
          resolve(e.data.data)
        }
        // close the channel
        channel.port1.close()
      }
    })
  }, [])

  return {
    spaceList,
    updateSpaceList,
    createSpace,
    exportSpace,
    deleteSpace,
  }
}
