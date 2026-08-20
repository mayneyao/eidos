import {
  layout,
  prepare,
  type PreparedText,
  type PrepareOptions,
} from "@chenglou/pretext"
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react"

const EIDOS_FILE_UI_FONT =
  '"Aptos", "Segoe UI Variable", "Segoe UI", sans-serif'
const PREPARED_TEXT_CACHE_LIMIT = 1_000
const preparedTextCache = new Map<string, PreparedText>()

export const EIDOS_FILE_RECORD_CARD_TITLE_LINE_HEIGHT = 20
export const EIDOS_FILE_RECORD_CARD_TITLE_MAX_LINES = 3
export const EIDOS_FILE_RECORD_CARD_FIELD_LINE_HEIGHT = 16
export const EIDOS_FILE_RECORD_CARD_FIELD_MAX_LINES = 2

export interface EidosFileTextLayout {
  height: number
  lineCount: number
  overflowing: boolean
}

function browserCanMeasureText(): boolean {
  if (typeof OffscreenCanvas !== "undefined") return true
  if (typeof document === "undefined") return false
  return (
    typeof navigator === "undefined" ||
    !navigator.userAgent.toLowerCase().includes("jsdom")
  )
}

function cachePreparedText(
  text: string,
  font: string,
  options: PrepareOptions
): PreparedText | null {
  if (!browserCanMeasureText()) return null
  const cacheKey = `${font}\u001f${options.whiteSpace ?? "normal"}\u001f${options.wordBreak ?? "normal"}\u001f${options.letterSpacing ?? 0}\u001f${text}`
  const cached = preparedTextCache.get(cacheKey)
  if (cached) return cached

  try {
    const prepared = prepare(text, font, options)
    preparedTextCache.set(cacheKey, prepared)
    if (preparedTextCache.size > PREPARED_TEXT_CACHE_LIMIT) {
      const oldest = preparedTextCache.keys().next().value
      if (typeof oldest === "string") preparedTextCache.delete(oldest)
    }
    return prepared
  } catch {
    return null
  }
}

function fallbackLineCount(
  text: string,
  maxWidth: number,
  fontSize: number
): number {
  if (!text) return 1
  const averageCharacterWidth = Math.max(1, fontSize * 0.56)
  const charactersPerLine = Math.max(
    1,
    Math.floor(maxWidth / averageCharacterWidth)
  )
  return text.split("\n").reduce((total, line) => {
    const graphemeCount = Array.from(line).length
    return total + Math.max(1, Math.ceil(graphemeCount / charactersPerLine))
  }, 0)
}

export function measureEidosFileTextHeight({
  text,
  maxWidth,
  font,
  fontSize,
  lineHeight,
  maxLines,
  whiteSpace = "pre-wrap",
  wordBreak = "normal",
  letterSpacing = 0,
}: {
  text: string
  maxWidth: number
  font: string
  fontSize: number
  lineHeight: number
  maxLines: number
  whiteSpace?: PrepareOptions["whiteSpace"]
  wordBreak?: PrepareOptions["wordBreak"]
  letterSpacing?: number
}): EidosFileTextLayout {
  const safeWidth = Math.max(1, maxWidth)
  const prepared = cachePreparedText(text || " ", font, {
    whiteSpace,
    wordBreak,
    letterSpacing,
  })
  const measuredLineCount = prepared
    ? Math.max(1, layout(prepared, safeWidth, lineHeight).lineCount)
    : fallbackLineCount(text, safeWidth, fontSize)
  const visibleLineCount = Math.min(maxLines, measuredLineCount)
  return {
    height: visibleLineCount * lineHeight,
    lineCount: measuredLineCount,
    overflowing: measuredLineCount > maxLines,
  }
}

export function eidosFileRecordCardTitleWidth(
  cardWidth: number,
  compact: boolean
): number {
  // Card padding + leading icon + title gap + borders.
  return Math.max(1, cardWidth - (compact ? 50 : 58))
}

export function eidosFileRecordCardTitleHeight(
  title: string,
  cardWidth: number,
  compact: boolean
): EidosFileTextLayout {
  return measureEidosFileTextHeight({
    text: title,
    maxWidth: eidosFileRecordCardTitleWidth(cardWidth, compact),
    font: `500 14px ${EIDOS_FILE_UI_FONT}`,
    fontSize: 14,
    lineHeight: EIDOS_FILE_RECORD_CARD_TITLE_LINE_HEIGHT,
    maxLines: EIDOS_FILE_RECORD_CARD_TITLE_MAX_LINES,
    whiteSpace: "normal",
  })
}

export function eidosFileRecordCardFieldTextWidth(
  cardWidth: number,
  compact: boolean
): number {
  // Card padding + field label column + field gap + borders.
  return Math.max(1, cardWidth - (compact ? 122 : 130))
}

export function eidosFileRecordCardFieldTextHeight(
  text: string,
  cardWidth: number,
  compact: boolean
): EidosFileTextLayout {
  return measureEidosFileTextHeight({
    text,
    maxWidth: eidosFileRecordCardFieldTextWidth(cardWidth, compact),
    font: `400 12px ${EIDOS_FILE_UI_FONT}`,
    fontSize: 12,
    lineHeight: EIDOS_FILE_RECORD_CARD_FIELD_LINE_HEIGHT,
    maxLines: EIDOS_FILE_RECORD_CARD_FIELD_MAX_LINES,
    whiteSpace: "normal",
  })
}

interface EidosFileAutosizedTextStyle extends CSSProperties {
  height?: number
  maxHeight?: number
}

export function useEidosFileAutosizedText<T extends HTMLElement>({
  text,
  maxLines,
  whiteSpace = "pre-wrap",
}: {
  text: string
  maxLines: number
  whiteSpace?: PrepareOptions["whiteSpace"]
}): {
  ref: RefObject<T>
  style: EidosFileAutosizedTextStyle
  overflowing: boolean
} {
  const ref = useRef<T>(null)
  const [layoutState, setLayoutState] = useState<{
    height?: number
    maxHeight?: number
    overflowing: boolean
  }>({ overflowing: false })

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return

    const measureNode = () => {
      const computed = getComputedStyle(node)
      const paddingLeft = Number.parseFloat(computed.paddingLeft) || 0
      const paddingRight = Number.parseFloat(computed.paddingRight) || 0
      const paddingTop = Number.parseFloat(computed.paddingTop) || 0
      const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0
      const borderTop = Number.parseFloat(computed.borderTopWidth) || 0
      const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0
      const fontSize = Number.parseFloat(computed.fontSize) || 14
      const lineHeight =
        Number.parseFloat(computed.lineHeight) || fontSize * 1.5
      const letterSpacing = Number.parseFloat(computed.letterSpacing) || 0
      const contentWidth = node.clientWidth - paddingLeft - paddingRight
      if (contentWidth <= 0) return

      const measured = measureEidosFileTextHeight({
        text,
        maxWidth: contentWidth,
        font: `${computed.fontWeight || 400} ${fontSize}px ${computed.fontFamily || EIDOS_FILE_UI_FONT}`,
        fontSize,
        lineHeight,
        maxLines,
        whiteSpace,
        letterSpacing,
      })
      const chromeHeight = paddingTop + paddingBottom + borderTop + borderBottom
      const next = {
        height: measured.height + chromeHeight,
        maxHeight: maxLines * lineHeight + chromeHeight,
        overflowing: measured.overflowing,
      }
      setLayoutState((current) =>
        current.height === next.height &&
        current.maxHeight === next.maxHeight &&
        current.overflowing === next.overflowing
          ? current
          : next
      )
    }

    measureNode()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measureNode)
    observer.observe(node)
    return () => observer.disconnect()
  }, [maxLines, text, whiteSpace])

  return {
    ref,
    style: {
      boxSizing: "border-box",
      height: layoutState.height,
      maxHeight: layoutState.maxHeight,
      overflowY: layoutState.overflowing ? "auto" : "hidden",
    },
    overflowing: layoutState.overflowing,
  }
}
