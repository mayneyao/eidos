import type { IFileSystem, FsStat, FileContent } from "@eidos.space/just-bash"
import crypto from "node:crypto"

import { createFileTools } from "./file-tools"

/**
 * Simple string-based in-memory filesystem for testing.
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

const HASH_ALPHABET = "ZPMQVRWSNKTXJBYH"
const RE_SIGNIFICANT = /[\p{L}\p{N}]/u

function computeLineHash(index: number, line: string): string {
  const content = line.replace(/\r/g, "").trimEnd()
  const isSignificant = RE_SIGNIFICANT.test(content)

  const hash = crypto.createHash("md5")
  hash.update(content)
  if (!isSignificant) {
    hash.update(index.toString())
  }

  const digest = hash.digest()
  const h1 = digest[0]! % 16
  const h2 = digest[1]! % 16

  return HASH_ALPHABET[h1]! + HASH_ALPHABET[h2]!
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
        from: 1,
        to: 2,
      })
      const lines = (result as any).content.split("\n")
      expect(lines[0]).toBe(`1#${computeLineHash(1, "hello")}:hello`)
      expect(lines[1]).toBe(`2#${computeLineHash(2, "world")}:world`)
    })

    test("reads file with offset", async () => {
      const fs = createTestFs({ "/test.txt": "a\nb\nc\nd" })
      const { "file-read": read } = createFileTools(fs)

      const result = await read.execute!(
        { path: "/test.txt", offset: 2 },
        {} as any
      )

      expect(result).toMatchObject({ from: 3, to: 4 })
      const lines = (result as any).content.split("\n")
      expect(lines[0]).toBe(`3#${computeLineHash(3, "c")}:c`)
      expect(lines[1]).toBe(`4#${computeLineHash(4, "d")}:d`)
    })
  })

  // ── write ─────────────────────────────────────────────────────────

  describe("write", () => {
    test("creates a new file", async () => {
      const fs = createTestFs()
      const { "file-write": write } = createFileTools(fs)

      const result = await write.execute!(
        { path: "/new.txt", content: "hello" },
        {} as any
      )

      expect(result).toMatchObject({ success: true, path: "/new.txt" })
      expect(await fs.readFile("/new.txt")).toBe("hello")
    })
  })

  // ── edit ──────────────────────────────────────────────────────────

  describe("edit", () => {
    test("replaces a single line", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb\nccc" })
      const { "file-edit": edit } = createFileTools(fs)

      const result = await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              op: "replace",
              pos: `2#${computeLineHash(2, "bbb")}`,
              lines: ["BBB"],
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({ success: true })
      expect(await fs.readFile("/test.txt")).toBe("aaa\nBBB\nccc")
    })

    test("replaces a range of lines", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb\nccc\nddd" })
      const { "file-edit": edit } = createFileTools(fs)

      const result = await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              op: "replace",
              pos: `2#${computeLineHash(2, "bbb")}`,
              end: `3#${computeLineHash(3, "ccc")}`,
              lines: ["BBB", "CCC"],
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({ success: true })
      expect(await fs.readFile("/test.txt")).toBe("aaa\nBBB\nCCC\nddd")
    })

    test("appends after an anchor", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb" })
      const { "file-edit": edit } = createFileTools(fs)

      await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              op: "append",
              pos: `1#${computeLineHash(1, "aaa")}`,
              lines: ["AAA_EXTRA"],
            },
          ],
        },
        {} as any
      )

      expect(await fs.readFile("/test.txt")).toBe("aaa\nAAA_EXTRA\nbbb")
    })

    test("prepends before an anchor", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb" })
      const { "file-edit": edit } = createFileTools(fs)

      await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              op: "prepend",
              pos: `2#${computeLineHash(2, "bbb")}`,
              lines: ["BBB_PRE"],
            },
          ],
        },
        {} as any
      )

      expect(await fs.readFile("/test.txt")).toBe("aaa\nBBB_PRE\nbbb")
    })

    test("multi-edits that shift lines work correctly", async () => {
      const fs = createTestFs({ "/test.txt": "line1\nline2\nline3\nline4" })
      const { "file-edit": edit } = createFileTools(fs)

      // This test specifically reproduces the bug where an early append shifts later lines.
      // 1. Append 2 lines after line 1.
      // 2. Replace line 3.
      // 3. Prepend 1 line before line 4.
      // All anchors refer to the ORIGINAL file content.
      const result = await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              op: "append",
              pos: `1#${computeLineHash(1, "line1")}`,
              lines: ["line1.1", "line1.2"],
            },
            {
              op: "replace",
              pos: `3#${computeLineHash(3, "line3")}`,
              lines: ["NEW_LINE3"],
            },
            {
              op: "prepend",
              pos: `4#${computeLineHash(4, "line4")}`,
              lines: ["line3.9"],
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({ success: true })
      expect(await fs.readFile("/test.txt")).toBe(
        "line1\nline1.1\nline1.2\nline2\nNEW_LINE3\nline3.9\nline4"
      )
    })

    test("rejects stale edit with hash mismatch", async () => {
      const fs = createTestFs({ "/test.txt": "aaa\nbbb\nccc" })
      const { "file-edit": edit } = createFileTools(fs)

      const result = await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              op: "replace",
              pos: "2#XX", // Wrong hash
              lines: ["BBB"],
            },
          ],
        },
        {} as any
      )

      expect(result).toMatchObject({
        error: expect.stringContaining("Hash mismatch"),
      })
    })

    test("handles non-alphanumeric lines with index salting", async () => {
      const fs = createTestFs({ "/test.txt": "}\n}\n}" })
      const { "file-read": read, "file-edit": edit } = createFileTools(fs)

      const readResult = (await read.execute!(
        { path: "/test.txt" },
        {} as any
      )) as any
      const lines = readResult.content.split("\n")

      // Each "}" should have a DIFFERENT hash because of index salting
      const hash1 = lines[0].split("#")[1].split(":")[0]
      const hash2 = lines[1].split("#")[1].split(":")[0]
      const hash3 = lines[2].split("#")[1].split(":")[0]

      expect(hash1).not.toBe(hash2)
      expect(hash2).not.toBe(hash3)

      // Verify we can edit the second "}" specifically
      await edit.execute!(
        {
          path: "/test.txt",
          edits: [
            {
              op: "replace",
              pos: `2#${hash2}`,
              lines: ["]"],
            },
          ],
        },
        {} as any
      )

      expect(await fs.readFile("/test.txt")).toBe("}\n]\n}")
    })
  })
})
