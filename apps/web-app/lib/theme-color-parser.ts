/**
 * Parse theme colors from CSS content
 * Extracts key CSS variables used for theme preview
 */

// CSS color variable names to extract (in priority order)
const COLOR_VARS = [
  "--background",
  "--foreground",
  "--card",
  "--primary",
  "--secondary",
  "--accent",
  "--muted",
  "--popover",
  "--border",
]

/**
 * Extract CSS variable values from theme CSS
 * Returns an array of colors for the preview
 */
export function extractThemeColors(css: string): string[] | null {
  if (!css || typeof css !== "string") return null

  const colors: string[] = []
  const colorMap = new Map<string, string>()

  // Match CSS variable declarations: --var-name: value;
  const varRegex = /(--[\w-]+)\s*:\s*([^;]+);/g
  let match: RegExpExecArray | null

  while ((match = varRegex.exec(css)) !== null) {
    const [, varName, value] = match
    const trimmedValue = value.trim()
    if (COLOR_VARS.includes(varName)) {
      colorMap.set(varName, trimmedValue)
    }
  }

  // Priority 1: background, primary, accent
  if (colorMap.has("--background")) {
    colors.push(normalizeColor(colorMap.get("--background")!))
  }
  if (colorMap.has("--primary")) {
    colors.push(normalizeColor(colorMap.get("--primary")!))
  }
  if (colorMap.has("--accent")) {
    colors.push(normalizeColor(colorMap.get("--accent")!))
  }

  // Priority 2: card, secondary, muted
  if (colors.length < 3 && colorMap.has("--card")) {
    colors.push(normalizeColor(colorMap.get("--card")!))
  }
  if (colors.length < 3 && colorMap.has("--secondary")) {
    colors.push(normalizeColor(colorMap.get("--secondary")!))
  }
  if (colors.length < 3 && colorMap.has("--muted")) {
    colors.push(normalizeColor(colorMap.get("--muted")!))
  }

  // Priority 3: popover, border, foreground
  if (colors.length < 3 && colorMap.has("--popover")) {
    colors.push(normalizeColor(colorMap.get("--popover")!))
  }
  if (colors.length < 3 && colorMap.has("--border")) {
    colors.push(normalizeColor(colorMap.get("--border")!))
  }
  if (colors.length < 3 && colorMap.has("--foreground")) {
    colors.push(normalizeColor(colorMap.get("--foreground")!))
  }

  return colors.length >= 2 ? colors.slice(0, 3) : null
}

/**
 * Normalize CSS color value
 * - Preserves hex colors
 * - Converts hsl() to hsl string
 * - Converts rgb() to rgb string
 * - Handles CSS variables by returning as-is (will be resolved by browser)
 */
function normalizeColor(value: string): string {
  const trimmed = value.trim()

  // Handle CSS variables - return fallback if exists, otherwise return the var
  if (trimmed.startsWith("var(")) {
    // Try to extract fallback value from var(--name, fallback)
    const fallbackMatch = trimmed.match(/var\([^,]+,\s*(.+)\)/)
    if (fallbackMatch) {
      return normalizeColor(fallbackMatch[1])
    }
    // If no fallback, return a neutral color
    return "#888888"
  }

  // Handle HSL with oklch/lch format: oklch(0.985 0.001 106.5)
  if (trimmed.startsWith("oklch(") || trimmed.startsWith("lch(")) {
    // Return as-is, browser can render it
    return trimmed
  }

  // Handle HSL format: hsl(142.1 76.2% 36.3%)
  if (trimmed.startsWith("hsl(")) {
    return trimmed
  }

  // Handle HSL with comma format: hsl(142.1, 76.2%, 36.3%)
  if (trimmed.startsWith("hsl(") && trimmed.includes(",")) {
    return trimmed.replace(/,/g, " ")
  }

  // Handle RGB format
  if (trimmed.startsWith("rgb(") || trimmed.startsWith("rgba(")) {
    return trimmed
  }

  // Handle hex colors
  if (trimmed.startsWith("#")) {
    return trimmed
  }

  // Handle named colors
  return trimmed
}

/**
 * Generate fallback colors based on theme name (original algorithm)
 * Used when CSS parsing fails
 */
export function generateFallbackColors(name: string): string[] {
  const hash = name
    .split("")
    .reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0)
  const colors = []
  for (let i = 0; i < 3; i++) {
    const hue = (hash + i * 60) % 360
    colors.push(`hsl(${hue} 45% 60%)`)
  }
  return colors
}
