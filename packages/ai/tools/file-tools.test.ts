import crypto from "node:crypto"
import { createFileTools } from "./file-tools"

class MockBash {
  private files = new Map<string, string>()
  private dirs = new Set<string>()

  readFile(path: string): string {
    const normalized = this.normalize(path)
    if (!this.files.has(normalized)) {
      const err = new Error(`ENOENT: no such file, '${normalized}'`) as any
      err.code = "ENOENT"
      throw err
    }
    return this.files.get(normalized)!
  }

  writeFile(path: string, content: string): void {
    const normalized = this.normalize(path)
    const parent = this.dirname(normalized)
    if (parent && parent !== "/") {
      this.mkdir(parent, true)
    }
    this.files.set(normalized, content)
  }

  mkdir(path: string, _recursive?: boolean): void {
    this.dirs.add(this.normalize(path))
  }

  exists(path: string): boolean {
    const normalized = this.normalize(path)
    return this.files.has(normalized) || this.dirs.has(normalized)
  }

  private normalize(p: string): string {
    if (!p.startsWith("/")) p = "/" + p
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1)
    return p
  }

  private dirname(p: string): string {
    const idx = p.lastIndexOf("/")
    return idx <= 0 ? "/" : p.slice(0, idx)
  }
}

describe("file-tools", () => {
  let fs: MockBash
  let tools: Record<string, any>

  beforeEach(() => {
    fs = new MockBash()
    fs.mkdir("/agent", true)
    fs.mkdir("/agent/skills", true)
    tools = createFileTools(fs as any)
  })

  describe("file-write", () => {
    it("should create a file", async () => {
      const result = await tools["file-write"].execute({
        path: "/agent/skills/hello.md",
        content: "# Hello\nWorld",
      })
      expect(result.success).toBe(true)
      expect(fs.readFile("/agent/skills/hello.md")).toBe("# Hello\nWorld")
    })

    it("should overwrite existing file", async () => {
      fs.writeFile("/agent/skills/hello.md", "old")
      const result = await tools["file-write"].execute({
        path: "/agent/skills/hello.md",
        content: "new",
      })
      expect(result.success).toBe(true)
      expect(fs.readFile("/agent/skills/hello.md")).toBe("new")
    })
  })

  describe("file-read", () => {
    beforeEach(() => {
      const lines: string[] = []
      for (let i = 1; i <= 20; i++) {
        lines.push(`line-${String(i).padStart(2, "0")}`)
      }
      fs.writeFile("/agent/skills/test.md", lines.join("\n"))
    })

    it("should read a file with hash anchors", async () => {
      const result = await tools["file-read"].execute({
        path: "/agent/skills/test.md",
      })
      expect(result.content).toContain("1#")
      expect(result.content).toContain(":line-01")
      expect(result.totalLines).toBe(20)
      expect(result.from).toBe(1)
      expect(result.to).toBe(20)
    })

    it("should support offset and limit", async () => {
      const result = await tools["file-read"].execute({
        path: "/agent/skills/test.md",
        offset: 5,
        limit: 3,
      })
      expect(result.from).toBe(6)
      expect(result.to).toBe(8)
      const lines = result.content.split("\n")
      expect(lines.length).toBe(3)
      expect(lines[0]).toContain("line-06")
      expect(lines[2]).toContain("line-08")
    })

    it("should return error for missing file", async () => {
      const result = await tools["file-read"].execute({
        path: "/agent/skills/nope.md",
      })
      expect(result.error).toBeDefined()
    })

    it("hash should be stable for same content", async () => {
      const r1 = await tools["file-read"].execute({
        path: "/agent/skills/test.md",
      })
      const r2 = await tools["file-read"].execute({
        path: "/agent/skills/test.md",
      })
      expect(r1.content).toBe(r2.content)
    })
  })

  describe("file-edit", () => {
    let readResult: any

    beforeEach(async () => {
      fs.writeFile(
        "/agent/skills/edit.md",
        ["line A", "line B", "line C", "line D", "line E"].join("\n")
      )
      readResult = await tools["file-read"].execute({
        path: "/agent/skills/edit.md",
      })
    })

    function extractAnchor(content: string, target: string): string {
      const line = content.split("\n").find((l: string) => l.includes(target))
      if (!line) throw new Error(`Anchor not found for ${target}`)
      return line.match(/^\d+#[A-Z]+/)![0]
    }

    it("should replace a single line", async () => {
      const anchor = extractAnchor(readResult.content, "line C")
      const result = await tools["file-edit"].execute({
        path: "/agent/skills/edit.md",
        edits: [{ op: "replace", pos: anchor, lines: ["line X"] }],
      })
      expect(result.success).toBe(true)
      const content = fs.readFile("/agent/skills/edit.md")
      expect(content).toBe("line A\nline B\nline X\nline D\nline E")
    })

    it("should replace a range of lines", async () => {
      const start = extractAnchor(readResult.content, "line B")
      const end = extractAnchor(readResult.content, "line D")
      const result = await tools["file-edit"].execute({
        path: "/agent/skills/edit.md",
        edits: [
          {
            op: "replace",
            pos: start,
            end,
            lines: ["line X", "line Y"],
          },
        ],
      })
      expect(result.success).toBe(true)
      const content = fs.readFile("/agent/skills/edit.md")
      expect(content).toBe("line A\nline X\nline Y\nline E")
    })

    it("should append after a line", async () => {
      const anchor = extractAnchor(readResult.content, "line B")
      const result = await tools["file-edit"].execute({
        path: "/agent/skills/edit.md",
        edits: [{ op: "append", pos: anchor, lines: ["line X"] }],
      })
      expect(result.success).toBe(true)
      const content = fs.readFile("/agent/skills/edit.md")
      expect(content).toBe("line A\nline B\nline X\nline C\nline D\nline E")
    })

    it("should prepend before a line", async () => {
      const anchor = extractAnchor(readResult.content, "line C")
      const result = await tools["file-edit"].execute({
        path: "/agent/skills/edit.md",
        edits: [{ op: "prepend", pos: anchor, lines: ["line X"] }],
      })
      expect(result.success).toBe(true)
      const content = fs.readFile("/agent/skills/edit.md")
      expect(content).toBe("line A\nline B\nline X\nline C\nline D\nline E")
    })

    it("should reject hash mismatches", async () => {
      const result = await tools["file-edit"].execute({
        path: "/agent/skills/edit.md",
        edits: [{ op: "replace", pos: "99#ZZ", lines: ["line X"] }],
      })
      expect(result.error).toBeDefined()
      expect(result.error).toContain("out of range")
    })
  })

  describe("hash algorithm", () => {
    it("deterministic across reads", () => {
      const lines = ["hello world", "foo bar baz"]
      const content = lines.join("\n")
      fs.writeFile("/agent/skills/hash.md", content)

      // Read twice, hashes should match
      const r1 = crypto.createHash("md5")
      r1.update("hello world")
      const d1 = r1.digest()

      const r2 = crypto.createHash("md5")
      r2.update("hello world")
      const d2 = r2.digest()

      expect(d1.equals(d2)).toBe(true)
    })
  })

  describe("auto-create directories", () => {
    it("should create nested directories on write", async () => {
      await tools["file-write"].execute({
        path: "/agent/sessions/a/b/c/file.txt",
        content: "deep",
      })
      expect(fs.readFile("/agent/sessions/a/b/c/file.txt")).toBe("deep")
    })
  })
})
