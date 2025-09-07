import { useCallback, useEffect, useState } from "react"

import { extractIdFromShortId } from "@/lib/utils"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

/**
 * Hooks for managing document properties and meta configurations
 * Provides both global utility functions and state-managed hooks for UI components
 */

/**
 * Global utility hooks for document properties
 * Provides basic get/set operations without state management
 */
export const useDocPropertyGlobal = () => {
  const { sqlite } = useSqlite()

  const getProperty = useCallback(
    async (docId: string) => {
      if (!sqlite) return
      const res = await sqlite.doc.getProperties(docId)
      return res
    },
    [sqlite]
  )

  const getAllProperties = useCallback(
    async (docId: string) => {
      if (!sqlite) return
      const res = await sqlite.doc.getAllProperties(docId)
      return res
    },
    [sqlite]
  )

  const setProperty = useCallback(
    async (docId: string, data: Record<string, any>) => {
      if (!sqlite) return
      return await sqlite.doc.setProperties(docId, data)
    },
    [sqlite]
  )

  return {
    getProperty,
    getAllProperties,
    setProperty,
  }
}

/**
 * Global utility hooks for document meta configurations
 * Provides all meta-related operations without state management
 */
export const useDocPropertyMeta = () => {
  const { sqlite } = useSqlite()

  const getMeta = useCallback(
    async (docId: string) => {
      if (!sqlite) return null
      const res = await sqlite.doc.getMeta(docId)
      return res
    },
    [sqlite]
  )

  const setMeta = useCallback(
    async (docId: string, meta: any) => {
      if (!sqlite) return { success: false }
      const res = await sqlite.doc.setMeta(docId, meta)
      return res
    },
    [sqlite]
  )

  const getMetas = useCallback(
    async (docIds: string[]) => {
      if (!sqlite) return {}
      const res = await sqlite.doc.getMetas(docIds)
      return res
    },
    [sqlite]
  )

  const addDisplayProperty = useCallback(
    async (docId: string, propertyName: string) => {
      if (!sqlite) return { success: false }
      const res = await sqlite.doc.addDisplayProperty(docId, propertyName)
      return res
    },
    [sqlite]
  )

  const removeDisplayProperty = useCallback(
    async (docId: string, propertyName: string) => {
      if (!sqlite) return { success: false }
      const res = await sqlite.doc.removeDisplayProperty(docId, propertyName)
      return res
    },
    [sqlite]
  )

  const setDisplayProperties = useCallback(
    async (docId: string, propertyNames: string[]) => {
      if (!sqlite) return { success: false }
      const res = await sqlite.doc.setDisplayProperties(docId, propertyNames)
      return res
    },
    [sqlite]
  )

  const getDisplayProperties = useCallback(
    async (docId: string) => {
      if (!sqlite) return {}
      const res = await sqlite.doc.getDisplayProperties(docId)
      return res
    },
    [sqlite]
  )

  const shouldDisplayProperty = useCallback(
    async (docId: string, propertyName: string) => {
      if (!sqlite) return false
      const res = await sqlite.doc.shouldDisplayProperty(docId, propertyName)
      return res
    },
    [sqlite]
  )

  return {
    getMeta,
    setMeta,
    getMetas,
    addDisplayProperty,
    removeDisplayProperty,
    setDisplayProperties,
    getDisplayProperties,
    shouldDisplayProperty,
  }
}

/**
 * State-managed hook for document meta configurations
 * Provides loading states and automatic state updates for UI components
 * @param data.docId - The document ID to manage meta for
 */
export const useDocMeta = (data: { docId: string }) => {
  const { docId } = data
  const { sqlite } = useSqlite()
  const [docMeta, setDocMeta] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const { getMeta, setMeta, addDisplayProperty, removeDisplayProperty, setDisplayProperties } = useDocPropertyMeta()

  const _getMeta = useCallback(async () => {
    if (!sqlite) return
    setLoading(true)
    try {
      const rowId = extractIdFromShortId(docId)
      const res = await getMeta(rowId)
      setDocMeta(res)
    } catch (error) {
      console.error('Failed to get meta:', error)
    } finally {
      setLoading(false)
    }
  }, [docId, getMeta, sqlite])

  const _setMeta = useCallback(
    async (meta: any) => {
      if (!sqlite) return
      setLoading(true)
      try {
        const rowId = extractIdFromShortId(docId)
        const res = await setMeta(rowId, meta)
        if (res.success) {
          await _getMeta()
        }
        return res
      } catch (error) {
        console.error('Failed to set meta:', error)
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
      } finally {
        setLoading(false)
      }
    },
    [sqlite, docId, setMeta, _getMeta]
  )

  const _addDisplayProperty = useCallback(
    async (propertyName: string) => {
      if (!sqlite) return { success: false }
      const rowId = extractIdFromShortId(docId)
      const res = await addDisplayProperty(rowId, propertyName)
      if (res.success) {
        await _getMeta()
      }
      return res
    },
    [sqlite, docId, addDisplayProperty, _getMeta]
  )

  const _removeDisplayProperty = useCallback(
    async (propertyName: string) => {
      if (!sqlite) return { success: false }
      const rowId = extractIdFromShortId(docId)
      const res = await removeDisplayProperty(rowId, propertyName)
      if (res.success) {
        await _getMeta()
      }
      return res
    },
    [sqlite, docId, removeDisplayProperty, _getMeta]
  )

  const _setDisplayProperties = useCallback(
    async (propertyNames: string[]) => {
      if (!sqlite) return { success: false }
      const rowId = extractIdFromShortId(docId)
      const res = await setDisplayProperties(rowId, propertyNames)
      if (res.success) {
        await _getMeta()
      }
      return res
    },
    [sqlite, docId, setDisplayProperties, _getMeta]
  )

  useEffect(() => {
    _getMeta()
  }, [_getMeta])

  return {
    meta: docMeta,
    loading,
    setMeta: _setMeta,
    addDisplayProperty: _addDisplayProperty,
    removeDisplayProperty: _removeDisplayProperty,
    setDisplayProperties: _setDisplayProperties,
    refresh: _getMeta,
  }
}

/**
 * State-managed hook for document custom properties
 * Provides loading states and automatic state updates for UI components
 * @param data.docId - The document ID to manage properties for
 */
export const useDocProperty = (data: { docId: string }) => {
  const { docId } = data
  const { sqlite } = useSqlite()
  const [docProperty, setDocProperty] = useState<Record<string, any> | null>(
    null
  )
  const { getProperty, setProperty } = useDocPropertyGlobal()

  const _getProperty = useCallback(async () => {
    if (!sqlite) return
    const rowId = extractIdFromShortId(docId)
    const res = await getProperty(rowId)
    res && setDocProperty(res)
  }, [docId, getProperty, sqlite])

  const _setProperty = useCallback(
    async (data: Record<string, any>) => {
      if (!sqlite) return
      const rowId = extractIdFromShortId(docId)
      await setProperty(rowId, data)
      await _getProperty()
    },
    [sqlite, docId, setProperty, _getProperty]
  )

  useEffect(() => {
    _getProperty()
  }, [_getProperty])

  if (!docProperty) {
    return {
      properties: null,
      setProperty: _setProperty,
    }
  }
  const { _id, title, ...restData } = docProperty
  return {
    properties: restData,
    setProperty: _setProperty,
  }
}
