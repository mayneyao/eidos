import { FieldType } from "@/lib/fields/const"
import { getColumnsFromQuery } from "@/lib/sqlite/sql-parser"
import { IField } from "@/lib/store/interface"

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

const OUT_PADDING = 8
const CONTENT_PADDING = 8
const TITLE_HEIGHT = 36
const COVER_HEIGHT = 200
const FIELD_HEIGHT = 32

export const computeCardHeight = (allColumnSize: number) => {
  const columnCount = allColumnSize || 0
  return (
    OUT_PADDING * 2 +
    CONTENT_PADDING * 2 +
    TITLE_HEIGHT +
    COVER_HEIGHT +
    FIELD_HEIGHT * columnCount
  )
}

export const shouldShowField = (value: any, field: IField) => {
  switch (field.type) {
    case FieldType.Checkbox:
      return true
    default:
      return Boolean(value)
  }
}
