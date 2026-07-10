// @vitest-environment node

import {
  expandObsidianLinks,
  remarkObsidianLinks,
} from "./remark-obsidian-links"

describe("Obsidian-style Markdown links", () => {
  it("expands note links, aliases, and image embeds", () => {
    expect(
      expandObsidianLinks(
        "Read [[Notes/Plan]], [[Today#Next|next step]], and ![[cover.png|320]]."
      )
    ).toEqual([
      { type: "text", value: "Read " },
      {
        type: "link",
        url: "Notes/Plan.md",
        children: [{ type: "text", value: "Plan" }],
      },
      { type: "text", value: ", " },
      {
        type: "link",
        url: "Today.md#Next",
        children: [{ type: "text", value: "next step" }],
      },
      { type: "text", value: ", and " },
      { type: "image", url: "cover.png", alt: "" },
      { type: "text", value: "." },
    ])
  })

  it("does not rewrite text inside an existing Markdown link", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "link",
              url: "existing.md",
              children: [{ type: "text", value: "[[keep literal]]" }],
            },
          ],
        },
      ],
    }

    remarkObsidianLinks()(tree)

    expect(tree).toEqual({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "link",
              url: "existing.md",
              children: [{ type: "text", value: "[[keep literal]]" }],
            },
          ],
        },
      ],
    })
  })

  it("rewrites eligible text nodes in the Markdown tree", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "See [[Plan]] now" }],
        },
      ],
    }

    remarkObsidianLinks()(tree)

    expect(tree).toEqual({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "See " },
            {
              type: "link",
              url: "Plan.md",
              children: [{ type: "text", value: "Plan" }],
            },
            { type: "text", value: " now" },
          ],
        },
      ],
    })
  })
})
