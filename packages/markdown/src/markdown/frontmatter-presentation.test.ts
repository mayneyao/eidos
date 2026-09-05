import { parseFrontmatterPresentation } from "./frontmatter-presentation"

describe("frontmatter presentation", () => {
  it("preserves YAML value types for visual rendering", () => {
    expect(
      parseFrontmatterPresentation(`---
title: In good hands
topics:
published: 2023-08-06
featured: true
rating: 5
url: https://stephango.com/in-good-hands
---`)
    ).toEqual({
      entries: [
        {
          key: "title",
          value: { kind: "scalar", type: "string", value: "In good hands" },
        },
        { key: "topics", value: { kind: "empty" } },
        {
          key: "published",
          value: { kind: "scalar", type: "string", value: "2023-08-06" },
        },
        {
          key: "featured",
          value: { kind: "scalar", type: "boolean", value: "true" },
        },
        {
          key: "rating",
          value: { kind: "scalar", type: "number", value: "5" },
        },
        {
          key: "url",
          value: {
            href: "https://stephango.com/in-good-hands",
            kind: "url",
            value: "https://stephango.com/in-good-hands",
          },
        },
      ],
    })
  })

  it("presents Obsidian wikilink arrays as separate semantic values", () => {
    expect(
      parseFrontmatterPresentation(
        `---
categories:
  - "[[Clippings]]"
  - "[[Posts|Published posts]]"
---`,
        { obsidianWikilinks: true }
      )
    ).toEqual({
      entries: [
        {
          key: "categories",
          value: {
            kind: "sequence",
            items: [
              {
                kind: "wikilink",
                target: "Clippings",
                path: "Clippings",
              },
              {
                kind: "wikilink",
                target: "Posts",
                path: "Posts",
                displayText: "Published posts",
              },
            ],
          },
        },
      ],
    })
  })

  it("does not reinterpret wikilink-looking YAML in the EFM profile", () => {
    expect(
      parseFrontmatterPresentation('---\ncategory: "[[Clippings]]"\n---')
    ).toEqual({
      entries: [
        {
          key: "category",
          value: {
            kind: "scalar",
            type: "string",
            value: "[[Clippings]]",
          },
        },
      ],
    })
  })
})
