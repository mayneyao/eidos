import { useCallback, useMemo, useRef, useEffect } from "react"
import type { IField } from "@/packages/core/types/IField"
import type { IGalleryViewProperties } from "./properties"
import {
  useTextMeasurement,
  computeGalleryCardHeight,
  GALLERY_MEASUREMENT_CONFIG,
} from "./use-text-measurement"

interface GalleryItem {
  _id: string
  title?: string
  [key: string]: any
}

interface UseGalleryLayoutOptions {
  items: string[] // rowIds
  showFields: IField[]
  properties?: IGalleryViewProperties
  cardWidth: number
  columnCount: number
  tableId: string
  getRowById: (tableId: string, rowId: string) => GalleryItem | undefined
}

interface RowHeightInfo {
  rowIndex: number
  height: number
  itemIndices: number[]
}

/**
 * Pretext-based Gallery layout optimization Hook
 *
 * Optimization points:
 * 1. Precisely measure each line's text height instead of using fixed estimates
 * 2. Support accurate layout for multi-language, emoji, mixed text
 * 3. Dynamically calculate max height for each row's cards to ensure neat alignment
 * 4. Cache measurement results to avoid repeated calculations
 */
export function useGalleryLayout({
  items,
  showFields,
  properties,
  cardWidth,
  columnCount,
  tableId,
  getRowById,
}: UseGalleryLayoutOptions) {
  const { measureText, clearCache } = useTextMeasurement()

  // Cache measurement results
  const measurementCache = useRef<Map<string, number>>(new Map())

  // Clear cache when key parameters change
  useEffect(() => {
    measurementCache.current.clear()
  }, [cardWidth, columnCount, showFields.length, properties?.hideEmptyFields])

  /**
   * Get visible field count for a single card
   */
  const getVisibleFieldCount = useCallback(
    (item: GalleryItem | undefined): number => {
      if (!item) return 0

      return showFields.filter((field) => {
        const value = item[field.table_column_name]
        if (!value && properties?.hideEmptyFields) return false
        return true
      }).length
    },
    [showFields, properties?.hideEmptyFields]
  )

  /**
   * Measure single card height (with caching)
   */
  const measureCardHeight = useCallback(
    (item: GalleryItem | undefined): number => {
      if (!item) return GALLERY_MEASUREMENT_CONFIG.coverHeight + 100 // Default minimum height

      const cacheKey = `${item._id}:${cardWidth}:${properties?.hideEmptyFields}`

      const cached = measurementCache.current.get(cacheKey)
      if (cached !== undefined) {
        return cached
      }

      const title = item.title || "Untitled"
      const visibleFieldCount = getVisibleFieldCount(item)

      const height = computeGalleryCardHeight(
        title,
        visibleFieldCount,
        cardWidth,
        measureText,
        true
      )

      // Cache result
      measurementCache.current.set(cacheKey, height)

      // Limit cache size
      if (measurementCache.current.size > 2000) {
        const firstKey = measurementCache.current.keys().next().value
        if (firstKey !== undefined) {
          measurementCache.current.delete(firstKey)
        }
      }

      return height
    },
    [cardWidth, getVisibleFieldCount, measureText, properties?.hideEmptyFields]
  )

  /**
   * Calculate row height (max card height in a row)
   *
   * This is a key function for virtual lists, needs to execute efficiently
   */
  const getRowHeight = useCallback(
    (rowIndex: number): number => {
      const startIndex = rowIndex * columnCount
      const endIndex = Math.min(startIndex + columnCount, items.length)

      // Get all card heights in this row
      const rowHeights: number[] = []
      for (let i = startIndex; i < endIndex; i++) {
        const rowId = items[i]
        const item = getRowById(tableId, rowId)
        if (item) {
          rowHeights.push(measureCardHeight(item))
        }
      }

      // Return max height in row to ensure alignment
      if (rowHeights.length === 0) {
        return GALLERY_MEASUREMENT_CONFIG.coverHeight + 100
      }

      return Math.max(...rowHeights)
    },
    [columnCount, items, tableId, getRowById, measureCardHeight]
  )

  /**
   * Batch pre-compute row heights (for initial render optimization)
   */
  const precomputeRowHeights = useCallback((): number[] => {
    const rowCount = Math.ceil(items.length / columnCount)
    const heights: number[] = []

    for (let row = 0; row < rowCount; row++) {
      heights.push(getRowHeight(row))
    }

    return heights
  }, [columnCount, items.length, getRowHeight])

  /**
   * Get total height of all rows (for scrollbar calculation)
   */
  const totalHeight = useMemo(() => {
    const rowHeights = precomputeRowHeights()
    return rowHeights.reduce((sum, h) => sum + h, 0)
  }, [precomputeRowHeights])

  /**
   * Get specific row info (for debugging and optimization)
   */
  const getRowInfo = useCallback(
    (rowIndex: number): RowHeightInfo => {
      const startIndex = rowIndex * columnCount
      const endIndex = Math.min(startIndex + columnCount, items.length)

      return {
        rowIndex,
        height: getRowHeight(rowIndex),
        itemIndices: Array.from(
          { length: endIndex - startIndex },
          (_, i) => startIndex + i
        ),
      }
    },
    [columnCount, items.length, getRowHeight]
  )

  /**
   * Force remeasurement (used when data updates)
   */
  const remeasure = useCallback(() => {
    measurementCache.current.clear()
    clearCache()
  }, [clearCache])

  return useMemo(
    () => ({
      // Core methods
      getRowHeight,
      measureCardHeight,
      getVisibleFieldCount,

      // Batch calculation
      precomputeRowHeights,
      totalHeight,

      // Helper methods
      getRowInfo,
      remeasure,

      // Cache info (for debugging)
      cacheSize: measurementCache.current.size,
    }),
    [
      getRowHeight,
      measureCardHeight,
      getVisibleFieldCount,
      precomputeRowHeights,
      totalHeight,
      getRowInfo,
      remeasure,
    ]
  )
}

/**
 * Simplified version using fixed estimates (as fallback)
 * Used when pretext is not available
 */
export function useGalleryLayoutFallback({
  items,
  showFields,
  properties,
  cardWidth,
  columnCount,
  tableId,
  getRowById,
}: UseGalleryLayoutOptions) {
  const { fieldRowHeight, coverHeight, padding, titleMinHeight } =
    GALLERY_MEASUREMENT_CONFIG

  const getVisibleFieldCount = useCallback(
    (item: GalleryItem | undefined): number => {
      if (!item) return 0
      return showFields.filter((field) => {
        const value = item[field.table_column_name]
        if (!value && properties?.hideEmptyFields) return false
        return true
      }).length
    },
    [showFields, properties?.hideEmptyFields]
  )

  const getRowHeight = useCallback(
    (rowIndex: number): number => {
      const startIndex = rowIndex * columnCount
      const endIndex = Math.min(startIndex + columnCount, items.length)

      const rowFieldCounts: number[] = []
      for (let i = startIndex; i < endIndex; i++) {
        const rowId = items[i]
        const item = getRowById(tableId, rowId)
        rowFieldCounts.push(getVisibleFieldCount(item))
      }

      const maxFieldCount = Math.max(...rowFieldCounts, 0)

      // Fixed estimate formula (consistent with original)
      return (
        padding.outer * 2 +
        padding.content * 2 +
        coverHeight +
        titleMinHeight +
        fieldRowHeight * maxFieldCount
      )
    },
    [
      columnCount,
      items,
      tableId,
      getRowById,
      getVisibleFieldCount,
      fieldRowHeight,
      coverHeight,
      padding,
      titleMinHeight,
    ]
  )

  return { getRowHeight }
}
