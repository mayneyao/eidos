import { useEffect, useState } from "react"
import type { ExtensionStats } from "@/packages/core/meta-table/extension"
import type { ExtensionStatus } from "@/packages/core/types/IExtension"

import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

export const useExtensionStats = (status: ExtensionStatus = "all") => {
  const [stats, setStats] = useState<ExtensionStats | null>(null)
  const [loading, setLoading] = useState(true)
  const { sqlite } = useSqlite()

  useEffect(() => {
    if (!sqlite) return

    const fetchStats = async () => {
      try {
        setLoading(true)
        const extensionStats = await sqlite.extension.getExtensionStats(status)
        setStats(extensionStats)
      } catch (error) {
        console.error("Failed to fetch extension stats:", error)
        setStats(null)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [sqlite, status])

  return { stats, loading }
}

/**
 * Hook to get count for a specific extension meta type
 */
export const useExtensionCountByMetaType = (
  extensionType: "script" | "block",
  metaType: string,
  status: ExtensionStatus = "all"
) => {
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const { sqlite } = useSqlite()

  useEffect(() => {
    if (!sqlite) return

    const fetchCount = async () => {
      try {
        setLoading(true)
        const extensionCount = await sqlite.extension.getExtensionCountByMetaType(
          extensionType,
          metaType,
          status
        )
        setCount(extensionCount)
      } catch (error) {
        console.error("Failed to fetch extension count:", error)
        setCount(0)
      } finally {
        setLoading(false)
      }
    }

    fetchCount()
  }, [sqlite, extensionType, metaType, status])

  return { count, loading }
}
