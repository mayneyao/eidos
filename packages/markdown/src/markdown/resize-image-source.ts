/** Change only an existing standalone image's alt-size suffix. */
export function resizeImageSource(source: string, width: number): string {
  const opening = source.match(/^[ \t]*!\[/u)
  if (!Number.isFinite(width) || width <= 0 || !opening) {
    return source
  }
  const start = opening[0].length
  let end = start
  let depth = 1
  for (; end < source.length; end++) {
    if (source[end] === "\\") end++
    else if (source[end] === "[") depth++
    else if (source[end] === "]" && --depth === 0) break
  }
  if (end >= source.length) return source
  const alt = source
    .slice(start, end)
    .replace(/(?:\|)?\d+(?:x\d+)?$/u, (size, offset) =>
      size.startsWith("|") || offset === 0 ? "" : size
    )
  return `${source.slice(0, start)}${alt}|${Math.round(width)}${source.slice(end)}`
}
