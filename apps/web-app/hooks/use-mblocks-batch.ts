import { useEffect, useState } from "react"

import { useSqlite } from "./use-sqlite"
import type { IExtension } from "@/packages/core/meta-table/extension"

export const useMblocksBatch = (ids: string[]) => {
  const [blocks, setBlocks] = useState<Record<string, IExtension | null>>({})
  const [loading, setLoading] = useState(false)
  const { sqlite } = useSqlite()

  useEffect(() => {
    if (!sqlite || ids.length === 0) {
      setBlocks({})
      return
    }

    const fetchBlocks = async () => {
      setLoading(true)
      try {
        // 过滤掉已经获取过的 block
        const newIds = ids.filter(id => !(id in blocks))
        
        if (newIds.length === 0) {
          setLoading(false)
          return
        }

        // 使用批量获取方法
        const batchResults = await sqlite.script.getBatch(newIds)
        
        // 更新状态
        setBlocks(prev => {
          const newBlocks = { ...prev }
          Object.entries(batchResults).forEach(([id, block]) => {
            newBlocks[id] = block
          })
          return newBlocks
        })
      } catch (error) {
        console.error('Failed to fetch blocks:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchBlocks()
  }, [sqlite, ids.join(',')]) // 使用 join 来避免数组引用变化

  // 清理不再需要的 blocks
  useEffect(() => {
    setBlocks(prev => {
      const newBlocks: Record<string, IExtension | null> = {}
      ids.forEach(id => {
        if (id in prev) {
          newBlocks[id] = prev[id]
        }
      })
      return newBlocks
    })
  }, [ids.join(',')])

  return { blocks, loading }
}
