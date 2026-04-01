// Singleton canvas context for text width measurement
let canvasInstance: HTMLCanvasElement | null = null
let canvasContext: CanvasRenderingContext2D | null = null

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null

  if (!canvasContext) {
    canvasInstance = document.createElement("canvas")
    canvasContext = canvasInstance.getContext("2d")
  }
  return canvasContext
}

/**
 * Use Canvas to precisely measure text width
 */
export function measureTextWidth(
  text: string,
  fontStyle: string = "13px system-ui, -apple-system, sans-serif"
): number {
  const ctx = getCanvasContext()
  if (!ctx) return text.length * 7

  ctx.font = fontStyle
  return ctx.measureText(text).width
}

/**
 * Calculate needed padding spaces for right alignment
 * If text is too long, truncate and show ellipsis
 */
export function calculatePaddingSpaces(
  text: string,
  containerWidth: number,
  fontStyle?: string,
  spaceChar: string = "\u00A0"
): { padding: string; displayText: string } {
  const textWidth = measureTextWidth(text, fontStyle)
  const spaceWidth = measureTextWidth(spaceChar, fontStyle)

  if (textWidth >= containerWidth - 10) {
    // Leave 10px margin
    // Try truncating and adding ellipsis
    let truncated = text
    while (
      truncated.length > 0 &&
      measureTextWidth(truncated + "...", fontStyle) > containerWidth - 10
    ) {
      truncated = truncated.slice(0, -1)
    }
    return {
      padding: "",
      displayText: truncated ? truncated + "..." : text.slice(0, 3) + "...",
    }
  }

  const spacesNeeded = Math.floor((containerWidth - textWidth) / spaceWidth)
  return {
    padding: spaceChar.repeat(Math.max(0, spacesNeeded)),
    displayText: text,
  }
}
