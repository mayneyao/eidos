export interface ObsidianImagePresentation {
  alt: string
  height?: number
  obsidian: true
  width?: number
}

/** Parses the image-alt size forms documented by Obsidian Markdown. */
export function obsidianImagePresentation(
  rawAlt: string
): ObsidianImagePresentation {
  const labelledSize = rawAlt.match(/^(.*)\|(\d+)(?:x(\d+))?$/u)
  const unlabelledSize = labelledSize
    ? null
    : rawAlt.match(/^(\d+)(?:x(\d+))?$/u)
  const width = labelledSize?.[2] ?? unlabelledSize?.[1]
  const height = labelledSize?.[3] ?? unlabelledSize?.[2]

  return {
    alt: labelledSize?.[1] ?? (unlabelledSize ? "" : rawAlt),
    ...(width ? { width: Number(width) } : {}),
    ...(height ? { height: Number(height) } : {}),
    obsidian: true,
  }
}
