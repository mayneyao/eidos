export interface MarkdownTask {
  checked: boolean
  label: string
  line: number
  /** UTF-16 offset of the checkbox marker (` `, `x`, or `X`). */
  markerOffset: number
}

interface MarkdownFence {
  marker: "`" | "~"
  length: number
}

const TASK_LINE = /^(\s*[-*+]\s+\[)([ xX])\](?:\s+(.*?))?\s*$/
const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/

/** Parse Markdown task-list lines while ignoring fenced code blocks. */
export function parseMarkdownTasks(text: string): MarkdownTask[] {
  const tasks: MarkdownTask[] = []
  const lines = text.split("\n")
  let sourceOffset = 0
  let fence: MarkdownFence | undefined

  lines.forEach((rawLine, index) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
    const fenceMatch = FENCE_LINE.exec(line)
    if (fenceMatch) {
      const token = fenceMatch[1]
      const marker = token[0] as MarkdownFence["marker"]
      if (!fence) {
        fence = { marker, length: token.length }
      } else if (
        marker === fence.marker &&
        token.length >= fence.length &&
        line.slice(fenceMatch[0].length).trim().length === 0
      ) {
        fence = undefined
      }
    } else if (!fence) {
      const match = TASK_LINE.exec(line)
      if (match) {
        tasks.push({
          checked: match[2].toLowerCase() === "x",
          label: match[3]?.trim() || "Untitled task",
          line: index + 1,
          markerOffset: sourceOffset + match[1].length,
        })
      }
    }

    sourceOffset += rawLine.length + (index < lines.length - 1 ? 1 : 0)
  })

  return tasks
}
