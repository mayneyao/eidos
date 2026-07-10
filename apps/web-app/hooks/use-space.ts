import { useCallback, useEffect } from "react"

import { useLastOpened } from "@/apps/web-app/pages/[database]/hook"
import { MsgType } from "@/lib/const"
import { getWorker } from "@/packages/core/sqlite/worker"
import { uuidv7 } from "@/lib/utils"

import { isDesktopMode } from "@/lib/env"
import { useSqlite } from "./use-sqlite"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import type { SpaceInfo } from "./use-current-space"

export const useSpace = () => {
  const { setSpaceList, spaceList } = useSqliteStore()
  const { sqlite } = useSqlite()
  const { setLastOpenedDatabase } = useLastOpened()

  const updateSpaceList = useCallback(async () => {
    if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
      // In desktop mode, use IPC to get workspace list
      try {
        const spaces: SpaceInfo[] = await window.eidos.spaceMgmt.listSpaces()
        setSpaceList(spaces)
      } catch (error) {
        console.error("Failed to get spaces from Electron:", error)
      }
    }
    // Web mode will only support single space, no multi-space management needed
  }, [setSpaceList])

  useEffect(() => {
    updateSpaceList()
  }, [updateSpaceList])

  const deleteSpace = useCallback(
    async (
      spaceId: string
    ): Promise<{ success: boolean; nextSpaceId?: string }> => {
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        // In desktop mode, use IPC to delete workspace
        try {
          const result = await window.eidos.spaceMgmt.removeSpace(spaceId)
          if (result.success) {
            setLastOpenedDatabase(result.nextSpaceId ?? "")
            await updateSpaceList()
            return result
          } else {
            throw new Error("Failed to remove space")
          }
        } catch (error) {
          console.error("Error deleting space:", error)
          throw error
        }
      }
      // Web mode doesn't support space deletion
      return { success: false, nextSpaceId: undefined }
    },
    [setLastOpenedDatabase, updateSpaceList]
  )

  const renameSpace = useCallback(
    async (spaceId: string, newName: string) => {
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        try {
          const result = await window.eidos.spaceMgmt.updateSpace(spaceId, {
            name: newName,
          })
          if (result.success) {
            await updateSpaceList()
          } else {
            throw new Error(result.error || "Failed to rename space")
          }
        } catch (error) {
          console.error("Error renaming space:", error)
          throw error
        }
      }
      // Web mode doesn't support space renaming
    },
    [updateSpaceList]
  )

  const rebuildIndex = useCallback(async () => {
    // Rebuild doc trigram index (no longer uses FTS)
    await sqlite?.doc.rebuildIndex({
      refillNullMarkdown: true,
    })

    console.log("Rebuilt all indexes")
  }, [sqlite])

  const createSpace = useCallback(
    async (spaceName: string) => {
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        // In desktop mode, use new IPC interface
        try {
          const result = await window.eidos.spaceMgmt.registerSpace(spaceName, {
            customName: spaceName,
          })
          if (result.success) {
            await updateSpaceList()
            return result
          } else {
            throw new Error(result.error || "Failed to create space")
          }
        } catch (error) {
          console.error("Error creating space:", error)
          throw error
        }
      } else {
        // Web mode: create space using worker
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
    },
    [updateSpaceList]
  )

  return {
    spaceList,
    updateSpaceList,
    createSpace,
    deleteSpace,
    rebuildIndex,
    renameSpace,
  }
}
