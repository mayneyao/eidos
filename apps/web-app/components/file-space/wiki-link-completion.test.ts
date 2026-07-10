// @vitest-environment node

import {
  createWikiLinkCompletions,
  getWikiLinkCompletionContext,
} from "./wiki-link-completion"

describe("Wiki link completion", () => {
  it("extracts the unfinished target after double brackets", () => {
    expect(getWikiLinkCompletionContext("See [[proj")).toEqual({
      query: "proj",
      replaceLength: 4,
    })
    expect(getWikiLinkCompletionContext("[[Plan|label")).toBeNull()
    expect(getWikiLinkCompletionContext("[[Plan#heading")).toBeNull()
    expect(getWikiLinkCompletionContext("ordinary text")).toBeNull()
  })

  it("uses full paths only when Markdown file names are ambiguous", () => {
    expect(
      createWikiLinkCompletions(
        [
          { path: "projects/Plan.md" },
          { path: "archive/plan.md" },
          { path: "Today.md" },
          { path: "image.png" },
        ],
        "Today.md"
      )
    ).toEqual([
      {
        label: "Plan",
        description: "projects/Plan.md",
        insertText: "projects/Plan",
      },
      {
        label: "plan",
        description: "archive/plan.md",
        insertText: "archive/plan",
      },
    ])
  })

  it("inserts unique aliases and disambiguates duplicate alias targets", () => {
    expect(
      createWikiLinkCompletions(
        [
          { path: "projects/Plan.md", matchedAlias: "Roadmap" },
          { path: "archive/Old.md", matchedAlias: "Roadmap" },
          { path: "People.md", matchedAlias: "Team directory" },
        ],
        "Today.md"
      )
    ).toEqual([
      {
        label: "Roadmap",
        description: "projects/Plan.md",
        insertText: "projects/Plan|Roadmap",
      },
      {
        label: "Roadmap",
        description: "archive/Old.md",
        insertText: "archive/Old|Roadmap",
      },
      {
        label: "Team directory",
        description: "People.md",
        insertText: "Team directory",
      },
    ])
  })
})
