import { useCallback, useEffect } from "react"

import { MsgType } from "@/lib/const"
import { getWorker } from "@/lib/sqlite/worker"
import { spaceFileSystem } from "@/lib/storage/space"
import { uuidv4 } from "@/lib/utils"

import { useSqliteStore } from "./use-sqlite"

export const useSpace = () => {
  const { setSpaceList, spaceList } = useSqliteStore()

  const updateSpaceList = useCallback(async () => {
    const spaceNames = await spaceFileSystem.list()
    setSpaceList(spaceNames)
  }, [setSpaceList])

  useEffect(() => {
    updateSpaceList()
  }, [setSpaceList, updateSpaceList])

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
      worker.onmessage = (e) => {
        const { id: returnId, data } = e.data
        if (returnId === msgId) {
          resolve(data)
        }
      }
    })
  }, [])

  return {
    spaceList,
    updateSpaceList,
    createSpace,
  }
}
