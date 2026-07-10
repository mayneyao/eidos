export type TextFileChangeDecision = "ignore" | "reload" | "conflict"

export function decideTextFileChange(
  diskContent: string,
  savedContent: string,
  editorContent: string,
  pendingWriteContent: string | null
): TextFileChangeDecision {
  if (
    diskContent === savedContent ||
    (pendingWriteContent !== null && diskContent === pendingWriteContent)
  ) {
    return "ignore"
  }
  return editorContent === savedContent ? "reload" : "conflict"
}
