import {
  MarkdownEditor,
  type MarkdownEditorLabels,
} from "@eidos.space/markdown"
import "@eidos.space/markdown/styles.css"

export const initialMarkdown = `# A little room to think

Write naturally. The document stays **Markdown**.

- Select text to format it
- Type / on an empty line to insert a block
- Drag a handle to move a block

## Keep your ideas portable

- [x] Own your content
- [ ] Make something worth writing about

An inline equation: $e^{i\\pi} + 1 = 0$.
`

export function BasicExample({
  theme = "light",
  readOnly = false,
  markdown,
  onMarkdownChange,
  ariaLabel = "Try the Markdown editor",
  placeholder,
  labels,
}: {
  theme?: "light" | "dark"
  readOnly?: boolean
  markdown: string
  onMarkdownChange(markdown: string): void
  ariaLabel?: string
  placeholder?: string
  labels?: Partial<MarkdownEditorLabels>
}) {
  return (
    <MarkdownEditor
      documentKey="website-example"
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      labels={labels}
      markdown={markdown}
      onMarkdownChange={onMarkdownChange}
      theme={theme}
      readOnly={readOnly}
    />
  )
}
