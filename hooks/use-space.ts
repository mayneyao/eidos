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
    worker.postMessage({
      type: MsgType.CreateSpace,
      data: {
        spaceName,
      },
      id: msgId,
    })
    return new Promise((resolve) => {
      worker.addEventListener("message", (e) => {
        const { id: returnId, data } = e.data
        if (returnId === msgId) {
          resolve(data)
        }
      })
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
