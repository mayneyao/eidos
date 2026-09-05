import type { BuiltInMarkdownProfileId } from "@eidos.space/markdown"
import { PLAYGROUND_MARKDOWN } from "../sample-markdown"
import { syntaxExamples } from "./syntax-catalog"

export function presetSample(preset: BuiltInMarkdownProfileId): string {
  if (preset === "eidos") return PLAYGROUND_MARKDOWN
  const ids =
    preset === "gfm"
      ? [
          "emphasis",
          "table",
          "task-list",
          "strikethrough",
          "extended-autolink",
          "fenced-code",
        ]
      : [
          "frontmatter",
          "wikilink",
          "callout",
          "tag",
          "inline-math",
          "footnote",
          "comment",
        ]
  return (
    (preset === "gfm" ? "# GitHub Flavored Markdown\n\n" : "") +
    ids
      .map((id) => syntaxExamples.find((entry) => entry.id === id)!.source)
      .join("\n\n")
  )
}
