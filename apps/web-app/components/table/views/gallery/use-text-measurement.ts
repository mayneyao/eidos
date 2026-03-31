import { useCallback, useMemo, useRef } from "react"
import {
  prepare,
  layout,
  prepareWithSegments,
  layoutWithLines,
} from "@chenglou/pretext"
import type { IField } from "@/packages/core/types/IField"

// Font configuration, synced with Tailwind CSS
const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

interface TextMeasurementOptions {
  fontSize?: number
  fontWeight?: string
  lineHeight?: number
  maxWidth: number
}

interface MeasuredText {
  height: number
  lineCount: number
}

interface MeasuredTextWithLines extends MeasuredText {
  lines: string[]
  lineWidths: number[]
}

// Cache prepared text to avoid repeated calculations
const prepareCache = new Map<string, ReturnType<typeof prepare>>()
const prepareWithSegmentsCache = new Map<
  string,
  ReturnType<typeof prepareWithSegments>
>()

/**
 * Get font string
 */
function getFontString(fontSize: number, fontWeight: string = "400"): string {
  return `${fontWeight} ${fontSize}px ${FONT_FAMILY}`
}

/**
 * Pretext-based text measurement Hook
 * Used for precisely calculating text height, supports multi-language, emoji, mixed text
 */
export function useTextMeasurement() {
  // Measure single/multi-line text height
  const measureText = useCallback(
    (text: string, options: TextMeasurementOptions): MeasuredText => {
      const {
        fontSize = 14,
        fontWeight = "400",
        lineHeight = 20,
        maxWidth,
      } = options

      if (!text || text.trim().length === 0) {
        return { height: 0, lineCount: 0 }
      }

      // Ensure text is string type
      const safeText = String(text)

      const font = getFontString(fontSize, fontWeight)
      const cacheKey = `${safeText}:${font}`

      let prepared = prepareCache.get(cacheKey)
      if (!prepared) {
        prepared = prepare(safeText, font)
        prepareCache.set(cacheKey, prepared)

        // Limit cache size
        if (prepareCache.size > 1000) {
          const firstKey = prepareCache.keys().next().value
          if (firstKey !== undefined) {
            prepareCache.delete(firstKey)
          }
        }
      }

      const result = layout(prepared, maxWidth, lineHeight)
      return {
        height: result.height,
        lineCount: result.lineCount,
      }
    },
    []
  )

  // Measure text and return each line's content (for scenarios needing to know specific line break positions)
  const measureTextWithLines = useCallback(
    (text: string, options: TextMeasurementOptions): MeasuredTextWithLines => {
      const {
        fontSize = 14,
        fontWeight = "400",
        lineHeight = 20,
        maxWidth,
      } = options

      if (!text || text.trim().length === 0) {
        return { height: 0, lineCount: 0, lines: [], lineWidths: [] }
      }

      // Ensure text is string type
      const safeText = String(text)

      const font = getFontString(fontSize, fontWeight)
      const cacheKey = `${safeText}:${font}`

      let prepared = prepareWithSegmentsCache.get(cacheKey)
      if (!prepared) {
        prepared = prepareWithSegments(safeText, font)
        prepareWithSegmentsCache.set(cacheKey, prepared)

        // Limit cache size
        if (prepareWithSegmentsCache.size > 500) {
          const firstKey = prepareWithSegmentsCache.keys().next().value
          if (firstKey !== undefined) {
            prepareWithSegmentsCache.delete(firstKey)
          }
        }
      }

      const result = layoutWithLines(prepared, maxWidth, lineHeight)
      return {
        height: result.height,
        lineCount: result.lineCount,
        lines: result.lines.map((line) => line.text),
        lineWidths: result.lines.map((line) => line.width),
      }
    },
    []
  )

  // Clear cache
  const clearCache = useCallback(() => {
    prepareCache.clear()
    prepareWithSegmentsCache.clear()
  }, [])

  return useMemo(
    () => ({
      measureText,
      measureTextWithLines,
      clearCache,
    }),
    [measureText, measureTextWithLines, clearCache]
  )
}

// Gallery card related measurement configuration
export const GALLERY_MEASUREMENT_CONFIG = {
  // Title area
  title: {
    fontSize: 16,
    fontWeight: "500", // font-medium
    lineHeight: 24, // leading-6
    maxLines: 2, // Max 2 lines display
  },
  // Field label
  fieldLabel: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
  },
  // Field value
  fieldValue: {
    fontSize: 14,
    fontWeight: "400",
    lineHeight: 20,
  },
  // Card padding
  padding: {
    outer: 8,
    content: 8,
  },
  // Cover height
  coverHeight: 200,
  // Field row height
  fieldRowHeight: 32,
  // Title area min/max height
  titleMinHeight: 36,
  titleMaxHeight: 48, // 2 lines height
} as const

/**
 * Measure Gallery card title height
 */
export function measureGalleryTitle(
  title: string | null | undefined,
  cardWidth: number,
  measureText: (text: string, options: TextMeasurementOptions) => MeasuredText
): number {
  const { fontSize, fontWeight, lineHeight, maxLines } =
    GALLERY_MEASUREMENT_CONFIG.title
  const maxWidth =
    cardWidth - GALLERY_MEASUREMENT_CONFIG.padding.content * 2 - 16 // Subtract padding and extra margin

  const safeTitle = title || ""
  const result = measureText(safeTitle, {
    fontSize,
    fontWeight,
    lineHeight,
    maxWidth,
  })

  // Limit max line count
  const lineCount = Math.min(result.lineCount, maxLines)
  return Math.max(
    GALLERY_MEASUREMENT_CONFIG.titleMinHeight,
    lineCount * lineHeight
  )
}

/**
 * Calculate Gallery card total height
 */
export function computeGalleryCardHeight(
  title: string | null | undefined,
  visibleFieldCount: number,
  cardWidth: number,
  measureText: (text: string, options: TextMeasurementOptions) => MeasuredText,
  hasCover: boolean = true
): number {
  const { padding, coverHeight, fieldRowHeight } = GALLERY_MEASUREMENT_CONFIG

  // Title height (precisely measured using pretext)
  const titleHeight = measureGalleryTitle(title, cardWidth, measureText)

  // Field area height
  const fieldsHeight = visibleFieldCount * fieldRowHeight

  // Cover height
  const coverHeightValue = hasCover ? coverHeight : 0

  // Total height = outer margin + content padding + cover + title + fields
  return (
    padding.outer * 2 +
    padding.content * 2 +
    coverHeightValue +
    titleHeight +
    fieldsHeight
  )
}

/**
 * Batch measure multiple cards' heights (for virtual list row height calculation)
 */
export function batchMeasureCardHeights(
  items: Array<{
    title: string | null | undefined
    visibleFieldCount: number
    hasCover?: boolean
  }>,
  cardWidth: number,
  measureText: (text: string, options: TextMeasurementOptions) => MeasuredText
): number[] {
  return items.map((item) =>
    computeGalleryCardHeight(
      item.title,
      item.visibleFieldCount,
      cardWidth,
      measureText,
      item.hasCover ?? true
    )
  )
}
