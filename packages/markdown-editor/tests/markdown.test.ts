import { $createTextNode, $getRoot, $isElementNode } from "lexical"

import {
  findUnsupportedMarkdown,
  inspectMarkdownCompatibility,
  markdownToSourceSnapshot,
  normalizeMarkdown,
  splitMarkdownDocument,
} from "../src"
import {
  createMarkdownHeadlessEditor,
  editorStateToMarkdown,
  setEditorMarkdown,
} from "../src/markdown"

describe("Markdown semantic conversion", () => {
  const supported = [
    [
      "headings and soft-wrapped paragraphs",
      "# Heading one\n\n## Heading two\n\nA paragraph with a second\nsoft-wrapped line.",
    ],
    [
      "emphasis and escapes",
      String.raw`Plain \*stars\*, **bold**, *italic*, ***both***, ~~gone~~, and a \\ slash.`,
    ],
    ["links", '[Lexical **docs**](https://lexical.dev/docs "Reference")'],
    [
      "nested ordered and unordered lists",
      "- first\n    - nested\n    - nested two\n- second\n\n3. three\n4. four",
    ],
    ["task lists", "- [ ] open\n- [x] complete\n    - [ ] nested"],
    ["nested quotes", "> Outer\n> > Nested\n> continuation"],
    [
      "fenced, indented, and inline code",
      "Use ``a ` tick`` here.\n\n~~~ts title=demo\nconst tick = `value`;\n~~~\n\n    indented()",
    ],
    ["thematic breaks", "Before\n\n* * *\n\nAfter"],
    [
      "images with alt text and titles",
      '![Local diagram](assets/flow.png "Architecture")',
    ],
    [
      "Space wiki links and image embeds",
      "See [[Notes/Plan]], [[Today#Next|next step]], and ![[cover.png|320]].",
    ],
    ["GFM table", "| Name | Done |\n| :--- | ---: |\n| Editor | yes |"],
    ["setext and hard breaks", "Heading\n=======\n\nfirst  \nsecond"],
    [
      "reference and automatic links",
      "[Eidos][site] <hello@example.com> https://eidos.space\n\n[site]: https://eidos.space",
    ],
    ["parenthesized ordered lists", "1) one\n2) two"],
    [
      "lazy list continuation",
      "- first\n  continued lazily\n\n  second paragraph",
    ],
  ] as const

  it.each(supported)(
    "round-trips %s through a stable mdast form",
    (_name, source) => {
      const normalized = normalizeMarkdown(source)

      expect(normalizeMarkdown(normalized)).toBe(normalized)
      expect(inspectMarkdownCompatibility(source)).toMatchObject({
        semanticRoundTripStable: true,
        safeToEdit: true,
      })
    }
  )

  it("preserves the exact raw source while semantics are unchanged", () => {
    const raw = "# Title\r\n\r\n__bold__ and _italic_  \r\n"
    const editor = createMarkdownHeadlessEditor()
    try {
      const source = setEditorMarkdown(editor, raw)
      const exported = editorStateToMarkdown(
        editor.getEditorState(),
        editor,
        source
      )

      expect(exported.markdown).toBe(raw)
      expect(exported.sourcePreserved).toBe(true)
      expect(exported.canonical).not.toBe(raw)
    } finally {
      editor.dispose()
    }
  })

  it("exports stable Markdown after a semantic edit", () => {
    const editor = createMarkdownHeadlessEditor()
    try {
      const source = setEditorMarkdown(editor, "__bold__")
      editor.update(
        () => {
          const firstBlock = $getRoot().getFirstChildOrThrow()
          if (!$isElementNode(firstBlock)) {
            throw new Error("Expected an editable block")
          }
          firstBlock.append($createTextNode(" changed"))
        },
        { discrete: true }
      )

      const result = editorStateToMarkdown(
        editor.getEditorState(),
        editor,
        source
      )
      expect(result.markdown).toContain("bold")
      expect(result.markdown).toContain(" changed")
      expect(result.sourcePreserved).toBe(false)
      expect(normalizeMarkdown(result.markdown)).toBe(result.markdown)
    } finally {
      editor.dispose()
    }
  })

  it("parses and preserves YAML frontmatter across body edits", () => {
    const frontmatter = '---\r\ntitle: "Demo"\r\ntags:\r\n  - local\r\n---\r\n'
    const raw = `${frontmatter}# Title\n\nBody.`
    const parts = splitMarkdownDocument(raw)
    expect(parts.frontmatter).toMatchObject({
      raw: frontmatter,
      yaml: 'title: "Demo"\r\ntags:\r\n  - local',
      data: { title: "Demo", tags: ["local"] },
    })

    const editor = createMarkdownHeadlessEditor()
    try {
      const source = setEditorMarkdown(editor, raw)
      editor.update(
        () => {
          const heading = $getRoot().getFirstChildOrThrow()
          if (!$isElementNode(heading)) throw new Error("Expected heading")
          heading.append($createTextNode(" changed"))
        },
        { discrete: true }
      )

      const result = editorStateToMarkdown(
        editor.getEditorState(),
        editor,
        source
      )
      expect(result.markdown.startsWith(frontmatter)).toBe(true)
      expect(result.markdown).toContain("# Title changed")
      expect(result.sourcePreserved).toBe(false)
    } finally {
      editor.dispose()
    }
  })

  it("exposes source-aware, stable compatibility metadata", () => {
    expect(inspectMarkdownCompatibility("__bold__")).toEqual({
      semanticRoundTripStable: true,
      sourceIsCanonical: true,
      source: "__bold__",
      canonical: "__bold__",
      issues: [],
      safeToEdit: true,
    })
  })

  it("does not mistake fenced or inline code for unsupported syntax", () => {
    const markdown = [
      "`````ts title=demo",
      "const table = '| A | B |  ';",
      "const html = '<mark>safe here</mark>';",
      "```` is text inside the fence",
      "`````",
      "",
      "Use ``two  spaces and ` a tick``.",
    ].join("\n")

    expect(findUnsupportedMarkdown(markdown)).toEqual([])
    expect(inspectMarkdownCompatibility(markdown).safeToEdit).toBe(true)
  })

  it("does not mistake an escaped task-like marker for TeX math", () => {
    const markdown = String.raw`## 文档

- \[] 没有变成 todo lists`

    expect(findUnsupportedMarkdown(markdown)).toEqual([])
    expect(inspectMarkdownCompatibility(markdown).safeToEdit).toBe(true)
  })

  it("keeps wiki targets lossless across UTF-16 and punctuation edge cases", () => {
    const source =
      "😀 See [[A ) folder/Plan|label \\| detail]] and ![[图 (1).png]]."
    const normalized = normalizeMarkdown(source)

    expect(normalized).toContain("[[A ) folder/Plan|label \\| detail]]")
    expect(normalized).toContain("![[图 (1).png]]")
    expect(normalizeMarkdown(normalized)).toBe(normalized)
  })

  it("never marks an unstable conversion safe to edit", () => {
    const compatibility = inspectMarkdownCompatibility(
      String.raw`![a\]b](image.png)`
    )
    expect(compatibility.safeToEdit).toBe(
      compatibility.issues.length === 0 && compatibility.semanticRoundTripStable
    )
  })

  it.each([
    ["footnote", "Text[^1]\n\n[^1]: Note", "footnote"],
    ["raw HTML", "Before <mark>important</mark>", "raw-html"],
    ["display math", "$$\nx^2\n$$", "math"],
    ["bracket-delimited math", String.raw`\[x^2\]`, "math"],
    ["parenthesis-delimited math", String.raw`\(x^2\)`, "math"],
    ["inline math", "Euler wrote $e^{i\\pi}+1=0$.", "math"],
    ["Obsidian comment", "Visible %%hidden%% text", "obsidian-comment"],
    ["Obsidian highlight", "This is ==important==.", "obsidian-highlight"],
    ["callout", "> [!NOTE]\n> Body", "obsidian-callout"],
    ["block id", "Paragraph ^stable-id", "obsidian-block-id"],
  ])(
    "uses the lossless raw fallback for unsupported %s syntax",
    (_name, source, code) => {
      const compatibility = inspectMarkdownCompatibility(source)

      expect(compatibility.safeToEdit).toBe(false)
      expect(compatibility.issues.map((issue) => issue.code)).toContain(code)
      expect(markdownToSourceSnapshot(source).source).toBe(source)
    }
  )
})
