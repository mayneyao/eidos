"use client"

import type { IField } from "@/packages/core/types/IField"
import type { IGalleryViewProperties } from "../gallery/properties"
import { computeCardHeightSmart } from "../gallery/utils"

/**
 * Get Kanban card width configuration
 */
export function getKanbanCardWidth(cardSize?: string): number {
  switch (cardSize) {
    case "small":
      return 300
    case "medium":
      return 350
    case "large":
      return 400
    default:
      return 350
  }
}

/**
 * Estimate card height - uses Gallery's Pretext-based calculation for consistency
 *
 * Note: innerCardWidth is the column width minus px-2 padding (16px)
 * But DataCard in Kanban has p-4 padding (32px total), so text width is innerCardWidth - 32
 * Gallery's computeCardHeightSmart expects outer container width, so we add padding back
 */
export function estimateCardHeight(
  item: Record<string, any>,
  showFields: IField[],
  properties: IGalleryViewProperties | undefined,
  innerCardWidth: number,
  titleField: string = "title",
  hasCover: boolean = true
): number {
  // innerCardWidth = card content width (includes p-4 padding)
  // For computeCardHeightSmart, we need the full card width (including outer padding)
  // Gallery uses OUT_PADDING=6 on each side, so add 12
  // But Kanban doesn't have outer padding, so we just use innerCardWidth as-is
  // The function will subtract OUT_PADDING*2, so we need to add it back to compensate
  const adjustedCardWidth = innerCardWidth + 12 // Add back what getContentTextWidth subtracts

  // Reuse Gallery's Pretext-based calculation
  return computeCardHeightSmart(
    item,
    showFields,
    properties,
    adjustedCardWidth,
    titleField,
    hasCover
  )
}
