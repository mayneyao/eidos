import {
  findObsidianHeadingTarget,
  parseObsidianMarkdownLinkDestination,
  parseObsidianWikilink,
} from "./obsidian-internal-link"

describe("parseObsidianMarkdownLinkDestination", () => {
  it("parses Vault notes, headings, block references, and encoded paths", () => {
    expect(
      parseObsidianMarkdownLinkDestination(
        "Projects/Three%20laws.md#Links%20are%20first-class"
      )
    ).toEqual({
      target: "Projects/Three%20laws.md#Links%20are%20first-class",
      path: "Projects/Three laws.md",
      heading: "Links are first-class",
    })
    expect(parseObsidianMarkdownLinkDestination("#^quote-of-the-day")).toEqual({
      target: "#^quote-of-the-day",
      path: "",
      blockId: "quote-of-the-day",
    })
    expect(parseObsidianMarkdownLinkDestination("../Daily/Today.md")).toEqual({
      target: "../Daily/Today.md",
      path: "../Daily/Today.md",
    })
  })

  it("leaves external and malformed destinations outside Vault routing", () => {
    expect(
      parseObsidianMarkdownLinkDestination("https://obsidian.md")
    ).toBeNull()
    expect(
      parseObsidianMarkdownLinkDestination("mailto:test@example.com")
    ).toBeNull()
    expect(
      parseObsidianMarkdownLinkDestination("//example.com/note")
    ).toBeNull()
    expect(parseObsidianMarkdownLinkDestination("bad%ZZ.md")).toBeNull()
  })
})

describe("findObsidianHeadingTarget", () => {
  it("matches a nested heading path instead of the first duplicate child", () => {
    document.body.innerHTML = `<main>
      <h2>First</h2><h3>Details</h3>
      <h2>Second</h2><h3>Details</h3>
    </main>`
    const root = document.querySelector("main")!

    expect(findObsidianHeadingTarget(root, "Second#Details")?.textContent).toBe(
      "Details"
    )
    expect(findObsidianHeadingTarget(root, "Missing#Details")).toBeNull()
  })
})

describe("parseObsidianWikilink", () => {
  it("parses complete wikilink scalars and aliases", () => {
    expect(parseObsidianWikilink("[[Clippings]]")).toEqual({
      target: "Clippings",
      path: "Clippings",
    })
    expect(parseObsidianWikilink("[[People/Steph Ango|Steph]]")).toEqual({
      target: "People/Steph Ango",
      path: "People/Steph Ango",
      displayText: "Steph",
    })
  })

  it("rejects ordinary strings and external URI targets", () => {
    expect(parseObsidianWikilink("Clippings")).toBeNull()
    expect(parseObsidianWikilink("[[https://example.com]]")).toBeNull()
  })
})
