import { scanInlineSyntax } from "../../core/inline-syntax"
import { MARKDOWN_FEATURES } from "../../plugin-system/feature-ids"
import { vaultInlineSyntax, tagSyntax } from "./syntax"

describe("Vault inline ownership", () => {
  it("owns outer tokens before inner tags and retains escaped tokens as text", () => {
    const source =
      "%% #hidden [[Hidden]] %% [[Note|#alias]] #visible \\#escaped \\[[literal]]"
    const matches = scanInlineSyntax(source, vaultInlineSyntax, [], {})
    expect(matches.map((match) => match.syntax.id)).toEqual([
      "markdown.comment.syntax",
      "markdown.wikilink.syntax",
      "markdown.tag.syntax",
    ])
    expect(
      matches.map((match) => source.slice(match.start, match.end))
    ).toEqual(["%% #hidden [[Hidden]] %%", "[[Note|#alias]]", "#visible"])
  })
  it("only protects syntax that was actually enabled", () => {
    const source = "%% #visible %%"
    const matches = scanInlineSyntax(source, [tagSyntax], [], {
      syntaxFeatures: new Set([MARKDOWN_FEATURES.obsidianTag]),
    })
    expect(
      matches.map((match) => source.slice(match.start, match.end))
    ).toEqual(["#visible"])
    expect(
      scanInlineSyntax(
        source,
        [tagSyntax],
        [{ start: 0, end: source.length }],
        {}
      )
    ).toEqual([])
  })
})
