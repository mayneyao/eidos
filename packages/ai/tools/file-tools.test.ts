import type { IFileSystem, FsStat, FileContent } from "just-bash"

import { createFileTools } from "./file-tools"

/**
 * Simple string-based in-memory filesystem for testing.
 * Avoids Uint8Array encoding issues with InMemoryFs in jsdom environment.
 */
class TestFs implements IFileSystem {
  private files = new Map<string, string>()

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initialFiles)) {
      this.files.set(path, content)
    }
  }

  async readFile(path: string): Promise<string> {
    if (!this.files.has(path)) {
      const err = new Error(
        `ENOENT: no such file or directory, open '${path}'`
      ) as any
      err.code = "ENOENT"
      throw err
    }
    return this.files.get(path)!
  }
  async readFileBuffer(path: string): Promise<Uint8Array> {
    return new TextEncoder().encode(await this.readFile(path))
  }
  async writeFile(path: string, content: FileContent): Promise<void> {
    this.files.set(
      path,
      typeof content === "string" ? content : new TextDecoder().decode(content)
    )
  }
  async appendFile(path: string, content: FileContent): Promise<void> {
    const text =
      typeof content === "string" ? content : new TextDecoder().decode(content)
    this.files.set(path, (this.files.get(path) ?? "") + text)
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path)
  }
  async stat(path: string): Promise<FsStat> {
    if (!this.files.has(path)) {
      const err = new Error(`ENOENT`) as any
      err.code = "ENOENT"
      throw err
    }
    return {
      isFile: true,
      isDirectory: false,
      isSymbolicLink: false,
      mode: 0o644,
      size: 0,
      mtime: new Date(),
    }
  }
  async lstat(path: string): Promise<FsStat> {
    return this.stat(path)
  }
  async readdir(_path: string): Promise<string[]> {
    return []
  }
  async readdirWithFileTypes(_path: string): Promise<any[]> {
    return []
  }
  async mkdir(): Promise<void> {}
  async rm(): Promise<void> {}
  async cp(): Promise<void> {}
  async mv(): Promise<void> {}
  async chmod(): Promise<void> {}
  async symlink(): Promise<void> {}
  async link(): Promise<void> {}
  async readlink(): Promise<string> {
    return ""
  }
  async realpath(path: string): Promise<string> {
    return path
  }
  async utimes(): Promise<void> {}
  resolvePath(_base: string, path: string): string {
    return path
  }
  getAllPaths(): string[] {
    return []
  }
}

function lineHash(line: string): string {
  let h = 0
  for (let i = 0; i < line.length; i++) {
    h = (h * 31 + line.charCodeAt(i)) | 0
  }
  const n = h >>> 0
  return n.toString(36).slice(-2).padStart(2, "0")
}

describe("file-tools", () => {
  function createTestFs(initialFiles: Record<string, string> = {}) {
    return new TestFs(initialFiles)
  }

  // ── read ──────────────────────────────────────────────────────────

  describe("read", () => {
    test("returns file content with hashline tags", async () => {
      const fs = createTestFs({ "/test.txt": "hello\nworld" })
      const { "file-read": read } = createFileTools(fs)

      const result = await read.execute!({ path: "/test.txt" }, {} as any)

      expect(result).toMatchObject({
        totalLines: 2,
        from: 0,
        to: 2,
      })
      // Each line should have hash>linenumber|content format
      const lines = (result as any).content.split("\n")
      expect(lines[0]).toBe(`${lineHash("hello")}>1|hello`)
      expect(lines[1]).toBe(`${lineHash("world")}>2|world`)
    })

    test("reads empty file", async () => {
      const fs = createTestFs({ "/empty.txt": "" })
      const { "file-read": read } = createFileTools(fs)

      const result = await read.execute!({ path: "/empty.txt" }, {} as any)

      expect(result).toMatchObject({
        content: `${lineHash("")}>1|`,
        totalLines: 1,
        from: 0,
        to: 1,
      })
    })

    test("reads file with offset", async () => {
      const fs = createTestFs({ "/test.txt": "a\nb\nc\nd" })
      const { "file-read": read } = createFileTools(fs)

      const result = await read.execute!(
        { path: "/test.txt", offset: 2 },
        {} as any
      )

      expect(result).toMatchObject({ from: 2, to: 4 })
      const lines = (result as any).content.split("\n")
      expect(lines[0]).toBe(`${lineHash("c")}>3|c`)
      expect(lines[1]).toBe(`${lineHash("d")}>4|d`)
    })

    test("reads file with offset and limit", async () => {
      const fs = createTestFs({ "/test.txt": "a\nb\nc\nd\ne" })
      const { "file-read": read } = createFileTools(fs)

      const result = await read.execute!(
        { path: "/test.txt", offset: 1, limit: 2 },
        {} as any
      )

      expect(result).toMatchObject({ from: 1, to: 3 })
      const lines = (result as any).content.split("\n")
      expect(lines).toHaveLength(2)
      expect(lines[0]).toBe(`${lineHash("b")}>2|b`)
      expect(lines[1]).toBe(`${lineHash("c")}>3|c`)
    })

    test("returns error for non-existent file", async () => {
      const fs = createTestFs()
      const { "file-read": read } = createFileTools(fs)

      const result = await read.execute!({ path: "/nope.txt" }, {} as any)

      expect(result).toMatchObject({
        error: expect.stringContaining("File not found"),
      })
    })
  })

  // ── write ─────────────────────────────────────────────────────────

  describe("write", () => {
    test("creates a new file", async () => {
      const fs = createTestFs()
      const { "file-write": write, "file-read": read } = createFileTools(fs)

      const result = await write.execute!(
        { path: "/new.txt", content: "hello" },
        {} as any
      )

      expect(result).toMatchObject({ success: true, path: "/new.txt" })
      // Verify content is readable
      const content = await fs.readFile("/new.txt")
      expect(content).toBe("hello")
    })

    test("overwrites an existing file", async () => {
      const fs = createTestFs({ "/test.txt": "old content" })
      const { "file-write": write } = createFileTools(fs)

      await write.execute!(
        { path: "/test.txt", content: "new content" },
        {} as any
      )

      const content = await fs.readFile("/test.txt")
      expect(content).toBe("new content")
    })

    test("creates file with multiline content", async () => {
      const fs = createTestFs()
      const { "file-write": write } = createFileTools(fs)

      await write.execute!(
        { path: "/multi.txt", content: "line1\nline2\nline3" },
        {} as any
      )

      const content = await fs.readFile("/multi.txt")
      expect(content).toBe("line1\nline2\nline3")
    })
  })

  // ── edit ──────────────────────────────────────────────────────────

  describe("edit", () => {
    test("replaces a single line range", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb\nccc" })
      const { "file-edit": edit } = createFileTools(fs)

      const result = await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 2,
              end_line: 2,
              hashes: lineHash("bbb"),
              new_content: "BBB",
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({ success: true })
      expect(await fs.readFile("/test.txt")).toBe("aaa\nBBB\nccc")
    })

    test("replaces multiple lines", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb\nccc\nddd" })
      const { "file-edit": edit } = createFileTools(fs)

      const result = await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 2,
              end_line: 3,
              hashes: lineHash("bbb") + lineHash("ccc"),
              new_content: "BBB\nCCC",
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({ success: true })
      expect(await fs.readFile("/test.txt")).toBe("aaa\nBBB\nCCC\nddd")
    })

    test("replaces with fewer lines (shrinking edit)", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb\nccc\nddd" })
      const { "file-edit": edit } = createFileTools(fs)

      await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 1,
              end_line: 3,
              hashes: lineHash("aaa") + lineHash("bbb") + lineHash("ccc"),
              new_content: "ONLY_ONE",
            },
          ],
        },
        {} as any
      )

      expect(await fs.readFile("/test.txt")).toBe("ONLY_ONE\nddd")
    })

    test("replaces with more lines (expanding edit)", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb" })
      const { "file-edit": edit } = createFileTools(fs)

      await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 2,
              end_line: 2,
              hashes: lineHash("bbb"),
              new_content: "BBB1\nBBB2\nBBB3",
            },
          ],
        },
        {} as any
      )

      expect(await fs.readFile("/test.txt")).toBe("aaa\nBBB1\nBBB2\nBBB3")
    })

    test("applies multiple edits in one call", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb\nccc\nddd\neee" })
      const { "file-edit": edit } = createFileTools(fs)

      const result = await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 1,
              end_line: 1,
              hashes: lineHash("aaa"),
              new_content: "AAA",
            },
            {
              start_line: 4,
              end_line: 5,
              hashes: lineHash("ddd") + lineHash("eee"),
              new_content: "DDD\nEEE",
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({ success: true })
      expect(await fs.readFile("/test.txt")).toBe("AAA\nbbb\nccc\nDDD\nEEE")
    })

    test("rejects stale edit with hash mismatch", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb\nccc" })
      const { "file-edit": edit } = createFileTools(fs)

      // Modify the file after "reading" (simulating a stale edit)
      await fs.writeFile("/test.txt", "aaa\nXXX\nccc")

      const result = await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 2,
              end_line: 2,
              hashes: lineHash("bbb"), // stale hash — file now has "XXX"
              new_content: "BBB",
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({
        error: expect.stringContaining("Hash mismatch"),
      })
      // File should remain unchanged
      expect(await fs.readFile("/test.txt")).toBe("aaa\nXXX\nccc")
    })

    test("rejects invalid line range (out of bounds)", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb" })
      const { "file-edit": edit } = createFileTools(fs)

      const result = await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 1,
              end_line: 5,
              hashes: "xxxx",
              new_content: "new",
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({
        error: expect.stringContaining("Invalid line range"),
      })
    })

    test("rejects invalid line range (start > end)", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb" })
      const { "file-edit": edit } = createFileTools(fs)

      const result = await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 3,
              end_line: 1,
              hashes: "xx",
              new_content: "new",
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({
        error: expect.stringContaining("Invalid line range"),
      })
    })

    test("rejects edit on non-existent file", async () => {
      const fs = createTestFs()
      const { "file-edit": edit } = createFileTools(fs)

      const result = await edit.execute!(
        {
          path: "/nope.txt",
          edits: [
            {
              start_line: 1,
              end_line: 1,
              hashes: "xx",
              new_content: "new",
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({
        error: expect.stringContaining("File not found"),
      })
    })

    test("replaces entire file content", async () => {
      const fs = createTestFs({ "/test.txt": "line1\nline2\nline3" })
      const { "file-edit": edit } = createFileTools(fs)

      await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 1,
              end_line: 3,
              hashes: lineHash("line1") + lineHash("line2") + lineHash("line3"),
              new_content: "completely\nnew\ncontent",
            },
          ],
        },
        {} as any
      )

      expect(await fs.readFile("/test.txt")).toBe("completely\nnew\ncontent")
    })

    test("edit at the beginning of file", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb\nccc" })
      const { "file-edit": edit } = createFileTools(fs)

      await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 1,
              end_line: 1,
              hashes: lineHash("aaa"),
              new_content: "AAA",
            },
          ],
        },
        {} as any
      )

      expect(await fs.readFile("/test.txt")).toBe("AAA\nbbb\nccc")
    })

    test("edit at the end of file", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb\nccc" })
      const { "file-edit": edit } = createFileTools(fs)

      await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              start_line: 3,
              end_line: 3,
              hashes: lineHash("ccc"),
              new_content: "CCC",
            },
          ],
        },
        {} as any
      )

      expect(await fs.readFile("/test.txt")).toBe("aaa\nbbb\nCCC")
    })
  })
})
