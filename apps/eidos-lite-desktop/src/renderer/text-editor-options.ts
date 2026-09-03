export function isMarkdownTextFile(relativePath: string): boolean {
  return /\.(?:md|markdown)$/i.test(relativePath)
}

export function shouldDisableTextEditorLineNumbers(
  relativePath: string
): boolean {
  return isMarkdownTextFile(relativePath)
}
