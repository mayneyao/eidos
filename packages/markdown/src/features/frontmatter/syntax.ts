/** Frontmatter is recognized only at document start and with a closing fence. */
export function frontmatterRange(source: string) {
  if (!source.startsWith("---\n")) return null
  let start = 4
  while (start <= source.length) {
    const newline = source.indexOf("\n", start)
    const end = newline < 0 ? source.length : newline
    if (source.slice(start, end) === "---")
      return { start: 0, end, closingStart: start }
    if (newline < 0) break
    start = newline + 1
  }
  return null
}
