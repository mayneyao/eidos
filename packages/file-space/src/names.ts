function extensionOf(filename: string): string {
  const lastDot = filename.lastIndexOf(".")
  if (lastDot <= 0) return ""
  return filename.slice(lastDot)
}

export function uniqueSpaceEntryName(
  existingNames: Iterable<string>,
  filename: string
): string {
  const existing = new Set([...existingNames].map((name) => name.toLowerCase()))
  const extension = extensionOf(filename)
  const stem = filename.slice(0, filename.length - extension.length)
  let candidate = filename
  let counter = 2
  while (existing.has(candidate.toLowerCase())) {
    candidate = `${stem} ${counter}${extension}`
    counter += 1
  }
  return candidate
}
