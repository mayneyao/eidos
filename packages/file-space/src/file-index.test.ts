// @vitest-environment node

import { mkdtemp, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { FileSpaceIndex } from "./file-index"
import { SpaceFiles } from "./space-files"

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForSearchResult(
  index: FileSpaceIndex,
  query: string,
  expectedPath: string,
  timeoutMs = 1_500
): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const results = await index.search(query)
    if (results.some((result) => result.path === expectedPath)) return
    await delay(10)
  }
  throw new Error(`Timed out waiting for indexed content: ${query}`)
}

describe("FileSpaceIndex", () => {
  let root: string
  let files: SpaceFiles
  let index: FileSpaceIndex

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-file-index-"))
    files = new SpaceFiles(root)
    index = new FileSpaceIndex(files)
    await mkdir(path.join(root, "projects", "active"), { recursive: true })
    await mkdir(path.join(root, "archive"), { recursive: true })
    await writeFile(
      path.join(root, "projects", "active", "Plan.md"),
      "# Product plan\nBuild a calm local-first workspace."
    )
    await writeFile(
      path.join(root, "archive", "Plan.md"),
      "# Old plan\nThis document is archived."
    )
    await writeFile(path.join(root, "Readme.txt"), "Searchable introduction")
    await writeFile(path.join(root, "cover.png"), new Uint8Array([0, 1, 2]))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("indexes file metadata and bounded text content", async () => {
    await mkdir(path.join(root, ".git", "objects"), { recursive: true })
    await mkdir(path.join(root, "projects", ".drafts"), { recursive: true })
    await writeFile(path.join(root, ".git", "config"), "hidden repository")
    await writeFile(
      path.join(root, "projects", ".drafts", "Secret.md"),
      "hidden draft"
    )

    await expect(index.getStatus()).resolves.toMatchObject({
      fileCount: 4,
      contentFileCount: 3,
      skippedContentFileCount: 0,
    })
    await expect(index.search("local-first")).resolves.toMatchObject([
      {
        path: "projects/active/Plan.md",
        match: "content",
        line: 2,
      },
    ])
    await expect(index.search("hidden")).resolves.toEqual([])
  })

  it("ranks exact filename matches before path and content matches", async () => {
    await writeFile(path.join(root, "Notes.txt"), "The plan appears here")
    const results = await index.search("plan")
    expect(new Set(results.slice(0, 2).map((result) => result.path))).toEqual(
      new Set(["projects/active/Plan.md", "archive/Plan.md"])
    )
    expect(results.slice(0, 2).every((result) => result.match === "name")).toBe(
      true
    )
    expect(results[2]).toMatchObject({ path: "Notes.txt", match: "content" })
  })

  it("can search only names and paths for link completion", async () => {
    await expect(
      index.search("local-first", { includeContent: false })
    ).resolves.toEqual([])
    await expect(
      index.search("active plan", { includeContent: false })
    ).resolves.toMatchObject([{ path: "projects/active/Plan.md" }])
  })

  it("searches frontmatter aliases without searching document content", async () => {
    await writeFile(
      path.join(root, "projects", "active", "Plan.md"),
      ["---", "aliases: [Product Roadmap, 产品路线]", "---", "# Plan"].join(
        "\n"
      )
    )

    await expect(
      index.search("product roadmap", { includeContent: false })
    ).resolves.toMatchObject([
      {
        path: "projects/active/Plan.md",
        match: "alias",
        matchedAlias: "Product Roadmap",
        snippet: "Alias: Product Roadmap",
      },
    ])
    await expect(
      index.search("产品路线", { includeContent: false })
    ).resolves.toMatchObject([
      { path: "projects/active/Plan.md", matchedAlias: "产品路线" },
    ])
  })

  it("filters Markdown files with case-insensitive and nested tag queries", async () => {
    await writeFile(
      path.join(root, "Alpha.md"),
      "# Alpha\n#work #project/alpha\nA unique needle"
    )
    await writeFile(path.join(root, "Beta.md"), "# Beta\n#Work")

    const workResults = await index.search("tag:WORK")
    expect(new Set(workResults.map((result) => result.path))).toEqual(
      new Set(["Alpha.md", "Beta.md"])
    )
    await expect(index.search("tag:project")).resolves.toMatchObject([
      { path: "Alpha.md", snippet: "#project/alpha #work" },
    ])
    await expect(index.search("tag:work needle")).resolves.toMatchObject([
      { path: "Alpha.md", match: "content", line: 3 },
    ])
    await expect(index.search("tag:personal")).resolves.toEqual([])
  })

  it("refreshes after invalidation", async () => {
    await index.getStatus()
    await writeFile(path.join(root, "New note.md"), "A newly indexed phrase")
    expect(await index.search("newly indexed")).toEqual([])

    index.invalidate()
    await expect(index.search("newly indexed")).resolves.toMatchObject([
      { path: "New note.md", match: "content" },
    ])
  })

  it("refreshes a changed file incrementally", async () => {
    await index.getStatus()
    const listSpy = vi.spyOn(files, "list")
    await writeFile(
      path.join(root, "projects", "active", "Plan.md"),
      "# Product plan\nIncremental watcher phrase"
    )

    await index.handleFileChange("projects/active/Plan.md")

    await expect(index.search("incremental watcher")).resolves.toMatchObject([
      { path: "projects/active/Plan.md", match: "content" },
    ])
    expect(listSpy).toHaveBeenCalledTimes(1)
  })

  it("does not read oversized text content during incremental updates", async () => {
    index = new FileSpaceIndex(files, { maxIndexableFileBytes: 32 })
    await index.getStatus()
    const readSpy = vi.spyOn(files, "readText")
    readSpy.mockClear()
    await writeFile(
      path.join(root, "projects", "active", "Plan.md"),
      "oversized ".repeat(20)
    )

    await index.handleFileChange("projects/active/Plan.md")

    expect(readSpy).not.toHaveBeenCalled()
    await expect(index.search("oversized")).resolves.toEqual([])
    await expect(
      index.search("Plan", { includeContent: false })
    ).resolves.toMatchObject([
      { path: "projects/active/Plan.md" },
      { path: "archive/Plan.md" },
    ])
  })

  it("refreshes tag search after external file changes", async () => {
    await index.getStatus()
    await writeFile(
      path.join(root, "projects", "active", "Plan.md"),
      "# Product plan\n#fresh-tag"
    )

    await index.handleFileChange("projects/active/Plan.md")

    await expect(index.search("tag:fresh-tag")).resolves.toMatchObject([
      { path: "projects/active/Plan.md" },
    ])
  })

  it("indexes the settled content after an atomic external replacement", async () => {
    await index.getStatus()
    const watcher = files.watch((change) => {
      if (change.eventType === "rescan") {
        index.invalidate()
      } else {
        void index.handleFileChange(change.path)
      }
    })
    try {
      await writeFile(
        path.join(root, "projects", "active", ".Plan.md.tmp"),
        "# Product plan\nAtomic replacement marker"
      )
      await rename(
        path.join(root, "projects", "active", ".Plan.md.tmp"),
        path.join(root, "projects", "active", "Plan.md")
      )
      await waitForSearchResult(
        index,
        "atomic replacement",
        "projects/active/Plan.md"
      )
    } finally {
      watcher.close()
    }

    await expect(index.search("calm local-first")).resolves.toEqual([])
  })

  it("incrementally adds and removes ordinary files", async () => {
    await index.getStatus()
    await writeFile(path.join(root, "Fresh.md"), "Fresh external content")
    await index.handleFileChange("Fresh.md")
    await expect(index.search("fresh external")).resolves.toMatchObject([
      { path: "Fresh.md" },
    ])

    await rm(path.join(root, "Fresh.md"))
    await index.handleFileChange("Fresh.md")
    await expect(index.search("fresh external")).resolves.toEqual([])
  })

  it("falls back to a rebuild for directory-level changes", async () => {
    await index.getStatus()
    await mkdir(path.join(root, "incoming"))
    await writeFile(
      path.join(root, "incoming", "Nested.md"),
      "Nested directory phrase"
    )

    await index.handleFileChange("incoming")

    await expect(index.search("nested directory")).resolves.toMatchObject([
      { path: "incoming/Nested.md" },
    ])
  })

  it("updates indexed paths immediately after moves", async () => {
    await index.getStatus()
    await files.move("projects/active/Plan.md", "projects/Plan.md")
    expect(index.movePath("projects/active/Plan.md", "projects/Plan.md")).toBe(
      true
    )

    await expect(index.search("Product plan")).resolves.toMatchObject([
      { path: "projects/Plan.md" },
    ])
    await expect(
      index.resolveLink("Readme.txt", "projects/Plan")
    ).resolves.toMatchObject({ path: "projects/Plan.md" })
  })

  it("updates cached metadata paths immediately after moves", async () => {
    await writeFile(path.join(root, "Tagged.md"), "# Tagged\n#moving")
    await index.getStatus()
    await files.move("Tagged.md", "archive/Tagged.md")
    expect(index.movePath("Tagged.md", "archive/Tagged.md")).toBe(true)

    await expect(
      index.getDocumentMetadata("archive/Tagged.md")
    ).resolves.toMatchObject({ path: "archive/Tagged.md", tags: ["moving"] })
    await expect(index.listTags()).resolves.toContainEqual({
      name: "moving",
      count: 1,
      paths: ["archive/Tagged.md"],
    })
  })

  it("does not let an older asynchronous refresh replace newer content", async () => {
    await index.getStatus()
    const current = await files.readText("projects/active/Plan.md")
    expect(
      index.updateTextFile({
        ...current,
        content: "newer indexed content",
        mtimeMs: current.mtimeMs + 10,
      })
    ).toBe(true)
    expect(
      index.updateTextFile({
        ...current,
        content: "stale indexed content",
        mtimeMs: current.mtimeMs + 5,
      })
    ).toBe(true)

    await expect(index.search("newer indexed")).resolves.toHaveLength(1)
    await expect(index.search("stale indexed")).resolves.toEqual([])
  })

  it("resolves direct, root, and nearest global links", async () => {
    await writeFile(
      path.join(root, "projects", "active", "Today.md"),
      "[[Plan]]"
    )

    await expect(
      index.resolveLink("projects/active/Today.md", "Plan#Next")
    ).resolves.toEqual({
      path: "projects/active/Plan.md",
      fragment: "Next",
      ambiguous: false,
      alternatives: [],
    })
    await expect(
      index.resolveLink("Readme.txt", "projects/active/Plan")
    ).resolves.toMatchObject({ path: "projects/active/Plan.md" })
    await expect(
      index.resolveLink("projects/active/Today.md", "#下一步%20计划")
    ).resolves.toEqual({
      path: "projects/active/Today.md",
      fragment: "下一步 计划",
      ambiguous: false,
      alternatives: [],
    })
  })

  it("resolves extensionless Wiki links to .markdown files", async () => {
    await writeFile(path.join(root, "Guide.markdown"), "# Guide")

    await expect(index.resolveLink("Readme.txt", "Guide")).resolves.toEqual({
      path: "Guide.markdown",
      fragment: undefined,
      ambiguous: false,
      alternatives: [],
    })
    await expect(
      index.resolveLink("Readme.txt", "Guide.md#Start")
    ).resolves.toMatchObject({
      path: "Guide.markdown",
      fragment: "Start",
    })
  })

  it("prefers an exact .md file over a .markdown fallback", async () => {
    await writeFile(path.join(root, "Guide.md"), "# Short extension")
    await writeFile(path.join(root, "Guide.markdown"), "# Long extension")

    await expect(index.resolveLink("Readme.txt", "Guide")).resolves.toEqual({
      path: "Guide.md",
      fragment: undefined,
      ambiguous: false,
      alternatives: [],
    })
  })

  it("reports ambiguous global links and chooses the nearest match", async () => {
    const resolution = await index.resolveLink(
      "projects/notes/Today.md",
      "Plan"
    )
    expect(resolution).toEqual({
      path: "projects/active/Plan.md",
      fragment: undefined,
      ambiguous: true,
      alternatives: ["archive/Plan.md"],
    })
  })

  it("resolves frontmatter aliases and reports duplicate aliases", async () => {
    await mkdir(path.join(root, "projects", "notes"), { recursive: true })
    await writeFile(
      path.join(root, "projects", "active", "Plan.md"),
      ["---", "aliases: [Product Roadmap, Shared plan]", "---", "# Plan"].join(
        "\n"
      )
    )
    await writeFile(
      path.join(root, "archive", "Plan.md"),
      ["---", "aliases: [Shared plan]", "---", "# Archived"].join("\n")
    )
    await writeFile(
      path.join(root, "projects", "notes", "Today.md"),
      "See [[Product Roadmap]]."
    )

    await expect(
      index.resolveLink("projects/notes/Today.md", "Product Roadmap#Next")
    ).resolves.toEqual({
      path: "projects/active/Plan.md",
      fragment: "Next",
      ambiguous: false,
      alternatives: [],
    })
    await expect(
      index.resolveLink("projects/notes/Today.md", "Product Roadmap.md#Next")
    ).resolves.toMatchObject({
      path: "projects/active/Plan.md",
      fragment: "Next",
      ambiguous: false,
    })
    await expect(
      index.resolveLink("projects/notes/Today.md", "Shared plan")
    ).resolves.toEqual({
      path: "projects/active/Plan.md",
      fragment: undefined,
      ambiguous: true,
      alternatives: ["archive/Plan.md"],
    })
    await expect(
      index.getBacklinks("projects/active/Plan.md")
    ).resolves.toMatchObject([
      { sourcePath: "projects/notes/Today.md", count: 1 },
    ])
  })

  it("gives real filenames precedence over frontmatter aliases", async () => {
    await writeFile(
      path.join(root, "projects", "active", "Plan.md"),
      ["---", "aliases: [Roadmap]", "---", "# Plan"].join("\n")
    )
    await writeFile(path.join(root, "archive", "Roadmap.md"), "# Roadmap")

    await expect(
      index.resolveLink("projects/active/Today.md", "Roadmap")
    ).resolves.toMatchObject({
      path: "archive/Roadmap.md",
      ambiguous: false,
    })
  })

  it("does not resolve external or missing links", async () => {
    await expect(
      index.resolveLink("Readme.txt", "https://example.com/note.md")
    ).resolves.toMatchObject({ path: null })
    await expect(
      index.resolveLink("Readme.txt", "Missing")
    ).resolves.toMatchObject({ path: null })
  })

  it("builds backlinks from Markdown links while ignoring code", async () => {
    await mkdir(path.join(root, "projects", "notes"), { recursive: true })
    await writeFile(
      path.join(root, "projects", "notes", "Today.md"),
      [
        "See [[Plan]].",
        "Review [[Plan#Next|the next section]].",
        "`[[Plan]]` is an example, not a link.",
        "```md",
        "[[Plan]]",
        "```",
        "<!-- [[Plan]] -->",
        "%% [[Plan]] %%",
      ].join("\n")
    )
    await writeFile(
      path.join(root, "Overview.md"),
      "[Current plan](projects/active/Plan.md)"
    )

    const backlinks = await index.getBacklinks("projects/active/Plan.md")
    expect(backlinks).toHaveLength(2)
    expect(backlinks.find((item) => item.sourcePath === "Overview.md")).toEqual(
      {
        sourcePath: "Overview.md",
        sourceName: "Overview.md",
        count: 1,
        references: [
          {
            target: "projects/active/Plan.md",
            line: 1,
            snippet: "[Current plan](projects/active/Plan.md)",
          },
        ],
      }
    )
    expect(
      backlinks.find((item) => item.sourcePath === "projects/notes/Today.md")
    ).toMatchObject({
      count: 2,
      references: [{ line: 1 }, { line: 2 }],
    })
  })

  it("returns no backlinks for files outside the index", async () => {
    await expect(index.getBacklinks("Missing.md")).resolves.toEqual([])
  })

  it("derives document metadata from Markdown files", async () => {
    await writeFile(
      path.join(root, "Meta.md"),
      [
        "---",
        "title: Indexed metadata",
        "aliases: [Metadata note, 元数据]",
        "tags: [work, Important]",
        "---",
        "# Visible heading",
        "## Details",
        "Tagged with #important and #状态/进行中.",
      ].join("\n")
    )

    await expect(index.getDocumentMetadata("meta.md")).resolves.toEqual({
      path: "Meta.md",
      title: "Indexed metadata",
      aliases: ["Metadata note", "元数据"],
      headings: [
        {
          depth: 1,
          text: "Visible heading",
          line: 6,
          slug: "visible-heading",
        },
        { depth: 2, text: "Details", line: 7, slug: "details" },
      ],
      tags: ["Important", "work", "状态/进行中"],
      frontmatter: {
        title: "Indexed metadata",
        aliases: ["Metadata note", "元数据"],
        tags: ["Important", "work"],
      },
    })
    await expect(index.getDocumentMetadata("Readme.txt")).resolves.toBeNull()
  })

  it("aggregates tags case-insensitively across indexed Markdown files", async () => {
    await writeFile(path.join(root, "Alpha.md"), "#work #shared")
    await writeFile(path.join(root, "Beta.md"), "#Work #personal")

    await expect(index.listTags()).resolves.toEqual([
      { name: "work", count: 2, paths: ["Alpha.md", "Beta.md"] },
      { name: "personal", count: 1, paths: ["Beta.md"] },
      { name: "shared", count: 1, paths: ["Alpha.md"] },
    ])
  })

  it("does not parse document metadata beyond the per-file limit", async () => {
    const limited = new FileSpaceIndex(files, {
      maxIndexableFileBytes: 10,
    })

    await expect(
      limited.getDocumentMetadata("projects/active/Plan.md")
    ).resolves.toBeNull()
  })

  it("does not read content beyond configured limits", async () => {
    const limited = new FileSpaceIndex(files, {
      maxIndexableFileBytes: 10,
      maxIndexedContentBytes: 10,
    })
    await expect(limited.getStatus()).resolves.toMatchObject({
      fileCount: 4,
      contentFileCount: 0,
      skippedContentFileCount: 3,
    })
    await expect(limited.search("local-first")).resolves.toEqual([])
    await expect(limited.search("Plan")).resolves.toHaveLength(2)
  })
})
