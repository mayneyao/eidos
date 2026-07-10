// @vitest-environment node

import { markdownHeadingSlug, parseMarkdownMetadata } from "./markdown-metadata"

describe("Markdown metadata", () => {
  it("creates stable Unicode heading slugs", () => {
    expect(markdownHeadingSlug("Hello, World!")).toBe("hello-world")
    expect(markdownHeadingSlug("下一步 计划")).toBe("下一步-计划")
    expect(markdownHeadingSlug("下一步 计划", 2)).toBe("下一步-计划-2")
  })

  it("extracts frontmatter, headings, Unicode slugs, and inline tags", () => {
    const metadata = parseMarkdownMetadata(
      "notes/项目.md",
      [
        "---",
        'title: "项目计划"',
        "aliases: [Roadmap, '路线']",
        "tags:",
        "  - work",
        "  - 项目",
        "---",
        "# Ignored title because frontmatter wins",
        "## [[Roadmap|路线图]]",
        "## 路线图",
        "A note with #status/active and #项目.",
      ].join("\n")
    )

    expect(metadata.title).toBe("项目计划")
    expect(metadata.aliases).toEqual(["Roadmap", "路线"])
    expect(metadata.tags).toEqual(["status/active", "work", "项目"])
    expect(metadata.headings).toEqual([
      {
        depth: 1,
        text: "Ignored title because frontmatter wins",
        line: 8,
        slug: "ignored-title-because-frontmatter-wins",
      },
      { depth: 2, text: "路线图", line: 9, slug: "路线图" },
      { depth: 2, text: "路线图", line: 10, slug: "路线图-1" },
    ])
  })

  it("supports inline tag lists and setext headings", () => {
    const metadata = parseMarkdownMetadata(
      "Readme.md",
      ["---", "tags: [docs, '#public']", "---", "Overview", "===", ""].join(
        "\n"
      )
    )

    expect(metadata.title).toBe("Overview")
    expect(metadata.aliases).toEqual([])
    expect(metadata.frontmatter.tags).toEqual(["docs", "public"])
    expect(metadata.headings).toEqual([
      { depth: 1, text: "Overview", line: 4, slug: "overview" },
    ])
  })

  it("supports singular and list-style frontmatter aliases", () => {
    const singular = parseMarkdownMetadata(
      "Project.md",
      ["---", "alias: Project Alpha", "---"].join("\n")
    )
    const list = parseMarkdownMetadata(
      "Project.md",
      [
        "---",
        "aliases:",
        "  - Project Alpha",
        "  - '项目甲'",
        "  - project alpha",
        "---",
      ].join("\n")
    )

    expect(singular.aliases).toEqual(["Project Alpha"])
    expect(list.aliases).toEqual(["Project Alpha", "项目甲"])
    expect(list.frontmatter.aliases).toEqual(["Project Alpha", "项目甲"])
  })

  it("ignores headings and tags in fenced or inline code", () => {
    const marker = String.fromCharCode(96)
    const metadata = parseMarkdownMetadata(
      "Code.md",
      [
        "# Visible",
        marker.repeat(3) + "md",
        "# Hidden",
        "#hidden-tag",
        marker.repeat(3),
        "Text " + marker + "#inline" + marker + " #real",
      ].join("\n")
    )

    expect(metadata.headings.map((heading) => heading.text)).toEqual([
      "Visible",
    ])
    expect(metadata.tags).toEqual(["real"])
  })

  it("ignores headings and tags in Markdown comments", () => {
    const metadata = parseMarkdownMetadata(
      "Comments.md",
      [
        "# Visible",
        "<!--",
        "# Hidden HTML heading",
        "#hidden-html",
        "-->",
        "%% #hidden-obsidian",
        "## Hidden Obsidian heading %%",
        "Visible #real-tag",
      ].join("\n")
    )

    expect(metadata.headings.map((heading) => heading.text)).toEqual([
      "Visible",
    ])
    expect(metadata.tags).toEqual(["real-tag"])
  })
})
