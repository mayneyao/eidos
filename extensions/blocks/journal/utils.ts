/**
 * Utility functions for journal sidebar
 */

/**
 * Get today's date in YYYY-MM-DD format (local timezone)
 */
export const getToday = (): string => {
  return new Date().toLocaleDateString("en-CA")
}

/**
 * Get yesterday's date in YYYY-MM-DD format (local timezone)
 */
export const getYesterday = (): string => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString("en-CA")
}

/**
 * Build a preview snippet from markdown content
 */
export const buildSnippet = (markdown: string): string => {
  if (!markdown) return ""
  // Strip simple markdown markers to make a lightweight preview
  const text = markdown
    .replace(/`{3}[\s\S]*?`{3}/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_\-\[\]\(\)]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return ""
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
}
