import { prepare, layout } from "@chenglou/pretext"
import { FieldType } from "@/packages/core/fields/const"
import { getColumnsFromQuery } from "@/packages/core/sqlite/sql-parser"
import type { IField } from "@/packages/core/types/IField"

const PADDING_RIGHT = 20

const getCardCount = (w: number) => {
  if (w < 560) {
    return 2
  }
  if (w >= 560 && w < 720) {
    return 3
  }
  if (w >= 720 && w < 960) {
    return 3
  }

  if (w >= 960 && w < 1280) {
    return 4
  }
  if (w >= 1280 && w < 1620) {
    return 4
  }
  if (w >= 1620 && w < 1920) {
    return 6
  }
  return 7
}

export const getColumnWidthAndCount = (
  containerWith: number,
  isMobile: boolean = false
) => {
  let width = containerWith - (isMobile ? 0 : PADDING_RIGHT)
  let cardWidth = 248
  let columnCount = getCardCount(width)

  const isOneColumnMode = columnCount === 1
  if (isOneColumnMode && !isMobile) {
    width = 720
  }

  if (isMobile) {
    columnCount = Math.min(columnCount, 2)
  }
  cardWidth = width / columnCount
  return {
    cardWidth,
    columnCount,
  }
}

// ==========================================
// Pretext-based dynamic height calculation
// ==========================================

// Font configuration
const FONT_FAMILY =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

// Notion-style card dimension constants
const OUT_PADDING = 6
const CONTENT_PADDING = 16 // p-4 = 16px (only bottom content area)
const COVER_HEIGHT = 160 // Notion-style cover height
const FIELD_SPACING = 4 // space-y-1 = 4px between fields
const CONTENT_TITLE_GAP = 12 // mt-3 = 12px between title and fields
const CARD_BORDER = 1 // border from cardClassName

/**
 * Calculate available text width inside card
 * Card structure: card border(1) → content padding(16) → text
 * Note: OUT_PADDING is on outer container, doesn't affect text width
 */
function getContentTextWidth(cardWidth: number): number {
  // cardWidth includes OUT_PADDING, but text is inside content area
  // Actual content width = cardWidth - OUT_PADDING*2 (outer) - BORDER*2 - CONTENT_PADDING*2
  return cardWidth - OUT_PADDING * 2 - CARD_BORDER * 2 - CONTENT_PADDING * 2
}

// Font configuration constants
const TITLE_CONFIG = {
  fontSize: 15,
  fontWeight: "600",
  lineHeight: 21, // leading-[1.4] - 2 lines = 42px
}

const FIELD_VALUE_CONFIG = {
  fontSize: 14,
  fontWeight: "400",
  lineHeight: 21, // Based on actual measurement: 147/7=21, 63/3=21
}

// Cache for prepared text
const prepareCache = new Map<string, ReturnType<typeof prepare>>()

/**
 * Get font string
 */
function getFontString(fontSize: number, fontWeight: string = "400"): string {
  return `${fontWeight} ${fontSize}px ${FONT_FAMILY}`
}

/**
 * Measure text height using pretext
 * Fully dynamic calculation, no line limit
 */
function measureTextHeight(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: string,
  lineHeight: number
): { height: number; lineCount: number } {
  if (!text || text.trim().length === 0) {
    return { height: 0, lineCount: 0 }
  }

  const font = getFontString(fontSize, fontWeight)
  const cacheKey = `${text}:${font}:${maxWidth}`

  let prepared = prepareCache.get(cacheKey)
  if (!prepared) {
    prepared = prepare(text, font)
    prepareCache.set(cacheKey, prepared)

    // Limit cache size
    if (prepareCache.size > 2000) {
      const firstKey = prepareCache.keys().next().value
      if (firstKey !== undefined) {
        prepareCache.delete(firstKey)
      }
    }
  }

  const result = layout(prepared, maxWidth, lineHeight)
  // Use lineCount * lineHeight to match CSS line-height behavior
  // Pretext's result.height may include font metrics that differ from CSS
  const calculatedHeight = result.lineCount * lineHeight
  return {
    height: calculatedHeight,
    lineCount: result.lineCount,
  }
}

// Height for empty title placeholder ("Untitled" text)
const EMPTY_TITLE_HEIGHT = 21 // Same as single line with leading-[1.4]

/**
 * Measure title height
 * Fully dynamic calculation, no line limit
 */
function measureTitleHeight(title: unknown, cardWidth: number): number {
  const maxWidth = getContentTextWidth(cardWidth)

  // Ensure title is a string
  const titleStr = typeof title === "string" ? title : String(title ?? "")

  // If title is empty, return placeholder height for "Untitled" text
  if (!titleStr || titleStr.trim().length === 0) {
    return EMPTY_TITLE_HEIGHT
  }

  const result = measureTextHeight(
    titleStr,
    maxWidth,
    TITLE_CONFIG.fontSize,
    TITLE_CONFIG.fontWeight,
    TITLE_CONFIG.lineHeight
  )

  return result.height
}

/**
 * Measure field value height
 * Fully dynamic calculation, no line limit
 */
function measureFieldValueHeight(
  value: any,
  cardWidth: number,
  fieldType: FieldType
): number {
  if (!value) return 0

  // File type field - in DataCard it displays as single line (24px), not full file preview
  if (fieldType === FieldType.File) {
    return 24 // Matches DataCard's single line display height
  }

  // MultiSelect type - use pretext to measure actual layout
  if (fieldType === FieldType.MultiSelect) {
    const values = Array.isArray(value)
      ? value
      : value.toString().split(",").filter(Boolean)
    if (values.length === 0) return 0

    // Available width for MultiSelect container
    const containerWidth = getContentTextWidth(cardWidth)

    // Create a text representation with spaces between tags to simulate gap
    const tagTexts = values.map((v: string) => String(v).trim())
    const font = getFontString(
      FIELD_VALUE_CONFIG.fontSize,
      FIELD_VALUE_CONFIG.fontWeight
    )

    // Measure combined text with pretext
    // Use double space between tags to approximate tag padding + gap
    const combinedText = tagTexts.join("  ")
    const prepared = prepare(combinedText, font)
    const result = layout(prepared, containerWidth, 24) // 24px line height

    return result.height
  }

  // Non-text type fields return fixed height
  if (!supportsDynamicHeight(fieldType)) {
    return 24 // Single line height (checkbox, rating, date, etc.)
  }

  const text = String(value)
  if (text.trim().length === 0) return 0

  // Available width = card width - outer margin - border - content padding
  const maxWidth = getContentTextWidth(cardWidth)

  const result = measureTextHeight(
    text,
    maxWidth,
    FIELD_VALUE_CONFIG.fontSize,
    FIELD_VALUE_CONFIG.fontWeight,
    FIELD_VALUE_CONFIG.lineHeight
  )

  return result.height
}

/**
 * Check if field type supports dynamic height (text fields)
 */
function supportsDynamicHeight(fieldType: FieldType): boolean {
  return [
    FieldType.Text,
    FieldType.Title,
    FieldType.Formula,
    FieldType.URL,
    FieldType.MultiSelect,
  ].includes(fieldType)
}

export const shouldShowField = (value: any, field: IField) => {
  switch (field.type) {
    case FieldType.Checkbox:
      return true
    default:
      return Boolean(value)
  }
}

// ==========================================
// Pretext-based height calculation API
// ==========================================

import type { IGalleryViewProperties } from "./properties"

export interface CardHeightParams {
  rowId: string
  visibleFieldCount: number
  title?: string
  hasCover?: boolean
}

/**
 * Get visible field count
 */
export const getCardVisibleFieldCount = (
  item: Record<string, any>,
  showFields: IField[],
  hideEmptyFields?: boolean
): number => {
  if (!item) return 0

  return showFields.filter((field) => {
    const value = item[field.table_column_name]
    if (!value && hideEmptyFields) return false
    return true
  }).length
}

/**
 * Calculate total height of all visible fields
 * Use pretext to precisely calculate each field's height
 *
 * Note: This should match DataCard's visibleFields calculation:
 * - Filter out _id and title when isView is false
 * - Filter out fields not in uiColumnMap (rawIdNameMap lookup returns undefined)
 * - Filter out empty fields when hideEmptyFields is true
 */
export interface FieldHeightDetail {
  name: string
  type: string
  calculatedHeight: number
  value: string | null
}

function computeFieldsHeightWithPretext(
  item: Record<string, any>,
  showFields: IField[],
  hideEmptyFields: boolean | undefined,
  cardWidth: number,
  isView: boolean = false
): {
  totalHeight: number
  visibleCount: number
  fieldDetails: FieldHeightDetail[]
} {
  let totalHeight = 0
  let visibleCount = 0
  const fieldDetails: FieldHeightDetail[] = []

  for (const field of showFields) {
    // Skip _id and title fields when not in view mode (handled separately in DataCard)
    if (
      !isView &&
      (field.table_column_name === "_id" || field.table_column_name === "title")
    ) {
      continue
    }

    const value = item[field.table_column_name]

    // Skip empty fields when hideEmptyFields is true
    if (!value && hideEmptyFields) continue

    visibleCount++

    // Calculate height based on field type
    const fieldType = field.type as FieldType
    const fieldHeight = measureFieldValueHeight(value, cardWidth, fieldType)
    const finalHeight = Math.max(fieldHeight, 24)

    fieldDetails.push({
      name: field.table_column_name,
      type: fieldType,
      calculatedHeight: finalHeight,
      value: value ? String(value).slice(0, 30) : null,
    })

    // Add minimum height guarantee (even empty values have some height)
    totalHeight += finalHeight
  }

  // Add field spacing
  if (visibleCount > 1) {
    totalHeight += FIELD_SPACING * (visibleCount - 1)
  }

  return { totalHeight, visibleCount, fieldDetails }
}

export interface CardHeightBreakdown {
  total: number
  parts: {
    outPadding: number
    cardBorder: number
    contentPadding: number
    coverHeight: number
    titleHeight: number
    contentGap: number
    fieldsHeight: number
    visibleFieldCount: number
  }
  textWidth: number
  titleLineCount: number
  fieldDetails: FieldHeightDetail[]
}

/**
 * Compute card height with detailed breakdown for debugging
 */
export const computeCardHeightSmartDetailed = (
  item: Record<string, any>,
  showFields: IField[],
  properties: IGalleryViewProperties | undefined,
  cardWidth: number,
  titleField: string = "title",
  hasCover: boolean = true,
  isView: boolean = false
): CardHeightBreakdown => {
  const title = item[titleField]
  const titleStr = typeof title === "string" ? title : String(title ?? "")
  const textWidth = getContentTextWidth(cardWidth)

  // Measure title
  const titleHeight = measureTitleHeight(titleStr, cardWidth)
  const titleLineCount = titleStr
    ? Math.ceil(titleHeight / TITLE_CONFIG.lineHeight)
    : 1

  // Measure fields
  const {
    totalHeight: fieldsHeight,
    visibleCount,
    fieldDetails,
  } = computeFieldsHeightWithPretext(
    item,
    showFields,
    properties?.hideEmptyFields,
    cardWidth,
    isView
  )

  const contentGap = titleHeight > 0 && visibleCount > 0 ? CONTENT_TITLE_GAP : 0
  const coverHeight = hasCover ? COVER_HEIGHT : 0

  const total =
    OUT_PADDING * 2 +
    CARD_BORDER * 2 +
    CONTENT_PADDING * 2 +
    coverHeight +
    titleHeight +
    contentGap +
    fieldsHeight

  return {
    total,
    parts: {
      outPadding: OUT_PADDING * 2,
      cardBorder: CARD_BORDER * 2,
      contentPadding: CONTENT_PADDING * 2,
      coverHeight,
      titleHeight,
      contentGap,
      fieldsHeight,
      visibleFieldCount: visibleCount,
    },
    textWidth,
    titleLineCount,
    fieldDetails,
  }
}

/**
 * Smart card height calculation (based on Pretext precise measurement)
 *
 * Features:
 * - Title height: use pretext to precisely measure, no line limit
 * - Field height: dynamically calculated based on content for each field, text fields fully expanded
 * - Cover height: dynamically included based on hasCover
 * - Fully dynamic: no preset maximum height limit
 */
export const computeCardHeightSmart = (
  item: Record<string, any>,
  showFields: IField[],
  properties: IGalleryViewProperties | undefined,
  cardWidth: number,
  titleField: string = "title",
  hasCover: boolean = true,
  isView: boolean = false
): number => {
  return computeCardHeightSmartDetailed(
    item,
    showFields,
    properties,
    cardWidth,
    titleField,
    hasCover,
    isView
  ).total
}

/**
 * Batch calculate row card heights
 * Used for virtual list row height calculation
 */
export const computeRowCardHeights = (
  rowIds: string[],
  tableId: string,
  getRowById: (tableId: string, rowId: string) => any,
  showFields: IField[],
  properties: IGalleryViewProperties | undefined,
  cardWidth: number,
  titleField: string = "title",
  isView: boolean = false
): number[] => {
  // Check if has cover
  const hasCover =
    properties?.coverPreview !== null &&
    properties?.coverPreview !== undefined &&
    properties?.coverPreview !== ""

  return rowIds.map((rowId) => {
    const item = getRowById(tableId, rowId)
    if (!item) {
      // Default minimum height
      const coverHeight = hasCover ? COVER_HEIGHT : 0
      return OUT_PADDING * 2 + CONTENT_PADDING * 2 + coverHeight + 40
    }

    return computeCardHeightSmart(
      item,
      showFields,
      properties,
      cardWidth,
      titleField,
      hasCover,
      isView
    )
  })
}

// ==========================================
// Backward compatible deprecated functions
// ==========================================

/**
 * @deprecated 使用 computeCardHeightSmart 替代
 */
export const computeCardHeight = (allColumnSize: number) => {
  const columnCount = allColumnSize || 0
  return (
    OUT_PADDING * 2 +
    CONTENT_PADDING * 2 +
    COVER_HEIGHT +
    40 +
    24 * columnCount +
    FIELD_SPACING * Math.max(0, columnCount - 1)
  )
}

/**
 * @deprecated 使用 computeCardHeightSmart 替代
 */
export const computeCardHeightDynamic = (
  allColumnSize: number,
  _titleLineCount: number = 1
) => {
  return computeCardHeight(allColumnSize)
}

/**
 * @deprecated 使用 computeCardHeightSmart 替代
 */
export const estimateTitleLineCount = (
  _title: string,
  _cardWidth: number
): number => {
  return 1
}
