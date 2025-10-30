import { useEffect, useState, useCallback } from "react"
import { useSqlite } from "./use-sqlite"

export interface MountConfig {
  name: string
  path: string
  type: 'directory'
  createdAt: string
  updatedAt: string
}

export interface MountMeta {
  type: 'directory'
  createdAt: string
  updatedAt: string
}

export const useMounts = () => {
  const { sqlite } = useSqlite()
  const [mounts, setMounts] = useState<MountConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Load mounts on component mount
  useEffect(() => {
    if (sqlite) {
      loadMounts()
    }
  }, [sqlite])

  const loadMounts = useCallback(async () => {
    if (!sqlite) return

    try {
      setIsLoading(true)

      // Query all mount records from KV table
      const mountRecords = await sqlite.kv.listWithPrefix({
        prefix: 'eidos:space:files:mount:'
      })

      const mountsData: MountConfig[] = mountRecords.map(record => {
        const mountName = record.key.replace('eidos:space:files:mount:', '')
        return {
          name: mountName,
          path: record.value,
          type: record.meta?.type || 'directory',
          createdAt: record.meta?.createdAt || record.created_at,
          updatedAt: record.meta?.updatedAt || record.updated_at,
        }
      })

      setMounts(mountsData)
    } catch (error) {
      console.error('Failed to load mounts:', error)
    } finally {
      setIsLoading(false)
    }
  }, [sqlite])

  const addMount = useCallback(async (name: string, path: string) => {
    if (!sqlite) throw new Error('Database not available')

    // Check if mount name already exists
    const existingMount = mounts.find(mount => mount.name === name)
    if (existingMount) {
      throw new Error(`Mount name already exists: ${name}`)
    }

    try {
      // Create mount metadata
      const mountMeta: MountMeta = {
        type: 'directory',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Add mount to KV table
      await sqlite.kv.put(`eidos:space:files:mount:${name}`, path, { meta: mountMeta })

      // Reload mounts
      await loadMounts()
    } catch (error) {
      console.error('Failed to add mount:', error)
      throw error
    }
  }, [sqlite, mounts, loadMounts])

  const removeMount = useCallback(async (name: string) => {
    if (!sqlite) throw new Error('Database not available')

    try {
      // Remove mount from KV table
      await sqlite.kv.delete(`eidos:space:files:mount:${name}`)

      // Reload mounts
      await loadMounts()
    } catch (error) {
      console.error('Failed to remove mount:', error)
      throw error
    }
  }, [sqlite, loadMounts])

  const updateMount = useCallback(async (name: string, path: string) => {
    if (!sqlite) throw new Error('Database not available')

    try {
      // Get existing mount
      const existingMount = mounts.find(mount => mount.name === name)
      if (!existingMount) {
        throw new Error(`Mount not found: ${name}`)
      }

      // Update mount metadata
      const mountMeta: MountMeta = {
        type: 'directory',
        createdAt: existingMount.createdAt,
        updatedAt: new Date().toISOString(),
      }

      // Update mount in KV table
      await sqlite.kv.put(`eidos:space:files:mount:${name}`, path, { meta: mountMeta })

      // Reload mounts
      await loadMounts()
    } catch (error) {
      console.error('Failed to update mount:', error)
      throw error
    }
  }, [sqlite, mounts, loadMounts])

  return {
    mounts,
    isLoading,
    addMount,
    removeMount,
    updateMount,
    refreshMounts: loadMounts,
  }
}
