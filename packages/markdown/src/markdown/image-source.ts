export function markdownImageSource(
  markdownUrl: string,
  alt: string,
  title?: string
): string {
  const escapedAlt = alt.replace(/\\/gu, "\\\\").replace(/\]/gu, "\\]")
  const titleSource = title
    ? ` "${title.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`
    : ""
  return `![${escapedAlt}](<${markdownUrl}>${titleSource})`
}
