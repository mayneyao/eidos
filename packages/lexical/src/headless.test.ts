/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest"
import { markdown2lexical, lexical2markdown } from "./headless"

describe("Lexical Headless Bi-directional Conversion", () => {
  const testBiDirectional = async (
    markdown: string,
    expectedMarkdown?: string
  ) => {
    const json = await markdown2lexical(markdown)
    const resultMarkdown = await lexical2markdown(json)

    // Normalize to ignore differences in number of newlines between blocks.
    const normalize = (s: string) =>
      s
        .trim()
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .join("\n")

    const normResult = normalize(resultMarkdown)
    const normExpected = normalize(expectedMarkdown || markdown)

    if (normResult !== normExpected) {
      console.log("RESULT:\n", normResult)
      console.log("EXPECTED:\n", normExpected)
    }

    expect(normResult).toBe(normExpected)
  }

  it("should handle standard formatting", async () => {
    await testBiDirectional("# Heading\n\n**Bold** and *italic* text.")
    await testBiDirectional("[Google](https://google.com)")
    await testBiDirectional("Inline `code` block.")
  })

  it("should handle simple lists", async () => {
    await testBiDirectional("- Item 1\n- Item 2")
    await testBiDirectional("1. First\n2. Second")
  })

  it("should handle Mermaid blocks bi-directionally", async () => {
    const mermaid = "```mermaid\ngraph TD\nA[Start] --> B(End)\n```"
    await testBiDirectional(mermaid)
  })

  it("should handle Chart blocks bi-directionally", async () => {
    const chart = "<chart>\ntype: line\ndata: [1, 2, 3]\n</chart>"
    await testBiDirectional(chart)
  })

  it("should handle Video/Audio nodes bi-directionally", async () => {
    await testBiDirectional('<video src="https://example.com/video.mp4" />')
    await testBiDirectional('<audio src="https://example.com/audio.mp3" />')
  })

  it("should handle Bookmark nodes bi-directionally", async () => {
    const bookmark =
      '<a href="https://example.com" data-eidos-type="bookmark">https://example.com</a>'
    await testBiDirectional(bookmark)

    const bookmarkWithMeta =
      '<a href="https://example.com" data-eidos-type="bookmark" data-title="Example Site" data-description="A test site" data-image="https://example.com/img.png">https://example.com</a>'
    await testBiDirectional(bookmarkWithMeta)
  })

  it("should handle YouTube conversion (Markdown -> Lexical -> Markdown)", async () => {
    const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    await testBiDirectional(youtubeUrl)
  })

  it("should handle specialized SQL query nodes bi-directionally", async () => {
    await testBiDirectional('<query sql="SELECT * FROM users LIMIT 10" />')
  })

  it("should handle complex documents with mixed content", async () => {
    const complexDoc = [
      "# Project Overview",
      "This is a **complex** document testing all nodes.",
      "",
      "- Item A",
      "- Item B",
      "",
      "## Visualization",
      "",
      "```mermaid",
      "graph LR",
      "  A[Source] --> B[Target]",
      "```",
      "",
      "## Media and Resources",
      "",
      '<a href="https://example.com" data-eidos-type="bookmark" data-title="Eidos">https://example.com</a>',
      '<video src="demo.mp4" />',
      "",
      "Final message.",
    ].join("\n")

    await testBiDirectional(complexDoc)
  })
})
