export function shouldDisableTextEditorLineNumbers(
  relativePath: string
): boolean {
  return /\.(?:md|markdown)$/i.test(relativePath)
}
