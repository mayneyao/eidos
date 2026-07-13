// @vitest-environment node

import { execFile as execFileCallback } from "node:child_process"
import {
  chmod,
  link,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { SpaceFiles, uniqueSpaceEntryName } from "./space-files"

const execFile = promisify(execFileCallback)

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_500
): Promise<void> {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for a filesystem change")
    }
    await delay(10)
  }
}

describe("SpaceFiles", () => {
  let root: string
  let outside: string
  let files: SpaceFiles

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-space-"))
    outside = await mkdtemp(path.join(tmpdir(), "eidos-outside-"))
    files = new SpaceFiles(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })

  it("lists ordinary files while hiding private application state", async () => {
    await mkdir(path.join(root, "notes"))
    await mkdir(path.join(root, "notes", ".drafts"))
    await mkdir(path.join(root, ".eidos"))
    await mkdir(path.join(root, ".obsidian"))
    await mkdir(path.join(root, ".git"))
    await writeFile(path.join(root, "readme.md"), "hello")
    await writeFile(path.join(root, ".DS_Store"), "noise")

    await expect(files.list()).resolves.toMatchObject([
      { name: "notes", path: "notes", kind: "directory" },
      { name: "readme.md", path: "readme.md", kind: "file" },
    ])
    await expect(files.list("", { includeHidden: true })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: ".git" })])
    )
    expect(
      (await files.list("", { includeHidden: true })).map((entry) => entry.name)
    ).not.toContain(".obsidian")
    await expect(files.list("", { includeObsidian: true })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: ".obsidian" })])
    )
    expect(
      (await files.list("", { includeObsidian: true })).map(
        (entry) => entry.name
      )
    ).not.toContain(".git")
    await expect(files.list("notes")).resolves.toEqual([])
    await expect(files.list("notes", { includeHidden: true })).resolves.toEqual(
      [expect.objectContaining({ name: ".drafts", path: "notes/.drafts" })]
    )
  })

  it("hides case variants of compatibility settings by default", async () => {
    await mkdir(path.join(root, ".OBSIDIAN"))

    await expect(files.list()).resolves.toEqual([])
    await expect(files.list("", { includeHidden: true })).resolves.toEqual([])
    await expect(files.list("", { includeObsidian: true })).resolves.toEqual([
      expect.objectContaining({ name: ".OBSIDIAN" }),
    ])
  })

  it("reads and writes Markdown with external-change protection", async () => {
    await writeFile(path.join(root, "note.md"), "first")
    const original = await files.readText("note.md")
    const saved = await files.writeText("note.md", "second", original.mtimeMs)

    expect(saved.content).toBe("second")
    expect(await readFile(path.join(root, "note.md"), "utf8")).toBe("second")

    await new Promise((resolve) => setTimeout(resolve, 5))
    await writeFile(path.join(root, "note.md"), "external")
    await expect(
      files.writeText("note.md", "stale", saved.mtimeMs)
    ).rejects.toMatchObject({ code: "file-changed" })
  })

  it("rejects invalid UTF-8 text without changing its bytes", async () => {
    const filename = path.join(root, "legacy.md")
    const original = Buffer.from([0x66, 0x6f, 0x80])
    await writeFile(filename, original)

    await expect(files.readText("legacy.md")).rejects.toMatchObject({
      code: "invalid-encoding",
    })
    await expect(
      files.writeText("legacy.md", "replacement")
    ).rejects.toMatchObject({
      code: "invalid-encoding",
    })
    expect(await readFile(filename)).toEqual(original)
  })

  it("classifies UTF-8 files without known extensions as text previews", async () => {
    await writeFile(path.join(root, "Dockerfile"), "FROM node:22\n# 你好\n")

    await expect(files.readPreview("Dockerfile")).resolves.toMatchObject({
      kind: "text",
      path: "Dockerfile",
      content: "FROM node:22\n# 你好\n",
      encoding: "utf-8",
      previewBytes: 22,
      truncated: false,
    })
  })

  it("recognizes BOM-marked UTF-16 text previews", async () => {
    const content = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("hello\n", "utf16le"),
    ])
    await writeFile(path.join(root, "legacy.cfg"), content)

    await expect(files.readPreview("legacy.cfg")).resolves.toMatchObject({
      kind: "text",
      content: "hello\n",
      encoding: "utf-16le",
    })
  })

  it("classifies invalid UTF-8 and NUL-heavy files as binary", async () => {
    await writeFile(
      path.join(root, "archive.unknown"),
      Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0x10])
    )
    await writeFile(
      path.join(root, "database.unknown"),
      Buffer.from("SQLite format 3\u0000more bytes", "utf8")
    )

    await expect(files.readPreview("archive.unknown")).resolves.toMatchObject({
      kind: "binary",
      path: "archive.unknown",
    })
    await expect(files.readPreview("database.unknown")).resolves.toMatchObject({
      kind: "binary",
      path: "database.unknown",
    })
  })

  it("bounds large text previews and reports truncation", async () => {
    const content = "a".repeat(512 * 1024 + 32)
    await writeFile(path.join(root, "large.trace"), content)

    const preview = await files.readPreview("large.trace")

    expect(preview).toMatchObject({
      kind: "text",
      truncated: true,
      previewBytes: 512 * 1024,
      size: content.length,
    })
    expect(preview.kind === "text" ? preview.content.length : 0).toBe(
      512 * 1024
    )
  })

  it("does not classify UTF-8 text as binary when the preview splits a character", async () => {
    const prefix = "a".repeat(512 * 1024 - 1)
    await writeFile(path.join(root, "unicode.trace"), `${prefix}你tail`)

    const preview = await files.readPreview("unicode.trace")

    expect(preview).toMatchObject({
      kind: "text",
      encoding: "utf-8",
      truncated: true,
      previewBytes: 512 * 1024,
    })
    expect(preview.kind === "text" ? preview.content : "").toBe(prefix)
  })

  it.skipIf(process.platform === "win32")(
    "does not replace a read-only text file",
    async () => {
      const filename = path.join(root, "readonly.md")
      await writeFile(filename, "keep")
      await chmod(filename, 0o444)

      try {
        await expect(
          files.writeText("readonly.md", "replace")
        ).rejects.toMatchObject({
          code: "not-writable",
        })
        await expect(readFile(filename, "utf8")).resolves.toBe("keep")
      } finally {
        await chmod(filename, 0o644)
      }
    }
  )

  it("coalesces rapid watcher events for the same path", async () => {
    await writeFile(path.join(root, "note.md"), "initial")
    const changes: Array<{ eventType: string; path: string }> = []
    const watcher = files.watch((change) => changes.push(change), {
      debounceMs: 80,
    })
    try {
      await delay(25)
      await writeFile(path.join(root, "note.md"), "first")
      await writeFile(path.join(root, "note.md"), "second")
      await waitFor(() => changes.length > 0)
      await delay(120)
    } finally {
      watcher.close()
    }

    expect(
      changes.filter(
        (change) =>
          change.path === "note.md" ||
          (change.eventType === "rescan" && change.path === "")
      )
    ).toHaveLength(1)
    await expect(files.readText("note.md")).resolves.toMatchObject({
      content: "second",
    })
  })

  it("reports a settled target after an atomic external replacement", async () => {
    await writeFile(path.join(root, "note.md"), "old")
    const changes: Array<{ eventType: string; path: string }> = []
    const watcher = files.watch((change) => changes.push(change), {
      debounceMs: 80,
    })
    try {
      await delay(25)
      await writeFile(path.join(root, ".note.md.tmp"), "replacement")
      await rename(path.join(root, ".note.md.tmp"), path.join(root, "note.md"))
      await waitFor(() =>
        changes.some(
          (change) => change.eventType === "rescan" && change.path === ""
        )
      )
      await delay(120)
    } finally {
      watcher.close()
    }

    expect(changes).toContainEqual({ eventType: "rescan", path: "" })
    await expect(files.readText("note.md")).resolves.toMatchObject({
      content: "replacement",
      size: 11,
    })
  })

  it("refreshes the nearest existing ancestor after a directory is deleted", async () => {
    await mkdir(path.join(root, "scratch", "nested"), { recursive: true })
    await writeFile(path.join(root, "scratch", "nested", "note.md"), "draft")
    const changes: Array<{ eventType: string; path: string }> = []
    const watcher = files.watch((change) => changes.push(change), {
      debounceMs: 80,
    })
    try {
      await delay(25)
      await rm(path.join(root, "scratch"), { recursive: true })
      await waitFor(() =>
        changes.some((change) => change.eventType === "rescan")
      )
      await delay(120)
    } finally {
      watcher.close()
    }

    const rescans = changes.filter((change) => change.eventType === "rescan")
    expect(rescans.length).toBeGreaterThan(0)
    expect(rescans.every((change) => change.path === "")).toBe(true)
  })

  it("creates, moves, and removes files inside the Space", async () => {
    await files.createDirectory("notes")
    await files.createText("notes/new.md", "draft")
    await files.move("notes/new.md", "notes/final.md")

    await expect(files.readText("notes/final.md")).resolves.toMatchObject({
      content: "draft",
    })
    await files.remove("notes/final.md")
    await expect(files.readText("notes/final.md")).rejects.toMatchObject({
      code: "not-found",
    })
  })

  it.skipIf(process.platform === "win32")(
    "keeps literal POSIX backslashes distinct from directory separators",
    async () => {
      const literalName = "a\\b.md"
      const driveLikeName = "C:\\note.md"
      const rootedBackslashName = "\\server.md"
      await writeFile(path.join(root, literalName), "literal")
      await writeFile(path.join(root, driveLikeName), "drive-like")
      await writeFile(path.join(root, rootedBackslashName), "root-like")
      await mkdir(path.join(root, "a"))
      await writeFile(path.join(root, "a", "b.md"), "nested")

      const entries = await files.list()
      const literalEntry = entries.find((entry) => entry.name === literalName)
      expect(entries.map((entry) => entry.name)).toEqual(
        expect.arrayContaining([
          literalName,
          driveLikeName,
          rootedBackslashName,
          "a",
        ])
      )
      expect(literalEntry).toMatchObject({
        name: literalName,
        path: literalName,
        kind: "file",
      })
      await expect(files.readText(driveLikeName)).resolves.toMatchObject({
        content: "drive-like",
      })
      await expect(files.readText(rootedBackslashName)).resolves.toMatchObject({
        content: "root-like",
      })

      await files.remove(literalEntry!.path)

      await expect(
        readFile(path.join(root, literalName), "utf8")
      ).rejects.toMatchObject({
        code: "ENOENT",
      })
      await expect(
        readFile(path.join(root, "a", "b.md"), "utf8")
      ).resolves.toBe("nested")
    }
  )

  it("replaces text atomically while preserving file permissions", async () => {
    await writeFile(path.join(root, "note.md"), "before", { mode: 0o640 })
    const before = await stat(path.join(root, "note.md"))

    await files.writeText("note.md", "after", before.mtimeMs)

    const after = await stat(path.join(root, "note.md"))
    expect(await readFile(path.join(root, "note.md"), "utf8")).toBe("after")
    if (process.platform !== "win32") {
      expect(after.mode & 0o777).toBe(0o640)
      expect(after.ino).not.toBe(before.ino)
    }
  })

  it.skipIf(process.platform === "win32")(
    "rejects hard-linked text without changing either link",
    async () => {
      const note = path.join(root, "note.md")
      const alias = path.join(root, "alias.md")
      await writeFile(note, "before")
      await link(note, alias)
      const before = await stat(note)

      await expect(
        files.writeText("note.md", "after", before.mtimeMs)
      ).rejects.toMatchObject({ code: "unsupported-file-metadata" })

      const [noteStats, aliasStats] = await Promise.all([
        stat(note),
        stat(alias),
      ])
      await expect(readFile(note, "utf8")).resolves.toBe("before")
      await expect(readFile(alias, "utf8")).resolves.toBe("before")
      expect(noteStats.ino).toBe(before.ino)
      expect(aliasStats.ino).toBe(before.ino)
      expect(noteStats.nlink).toBe(2)
    }
  )

  it.skipIf(process.platform !== "darwin")(
    "preserves extended attributes when saving text",
    async () => {
      const note = path.join(root, "metadata.md")
      await writeFile(note, "before")
      await execFile("xattr", [
        "-w",
        "com.eidos.space-files-test",
        "keep",
        note,
      ])

      await files.writeText("metadata.md", "after")

      const { stdout } = await execFile("xattr", [
        "-p",
        "com.eidos.space-files-test",
        note,
      ])
      expect(stdout.trim()).toBe("keep")
    }
  )

  it("imports external files without overwriting Space files", async () => {
    const source = path.join(outside, "image.bin")
    await writeFile(source, new Uint8Array([1, 2, 3, 4]))
    await files.createDirectory("assets")

    await expect(
      files.importFile(source, "assets/image.bin")
    ).resolves.toMatchObject({
      name: "image.bin",
      path: "assets/image.bin",
      parentPath: "assets",
      kind: "file",
      size: 4,
    })
    await expect(files.readBinary("assets/image.bin")).resolves.toMatchObject({
      content: new Uint8Array([1, 2, 3, 4]),
    })
    await expect(
      files.importFile(source, "assets/image.bin")
    ).rejects.toMatchObject({ code: "file-exists" })
  })

  it("creates binary attachments without overwriting existing files", async () => {
    await files.createDirectory("assets")

    await expect(
      files.createBinary("assets/pasted.png", new Uint8Array([1, 2, 3, 4]))
    ).resolves.toMatchObject({
      path: "assets/pasted.png",
      content: new Uint8Array([1, 2, 3, 4]),
      size: 4,
    })
    await expect(
      files.createBinary("assets/pasted.png", new Uint8Array([5]))
    ).rejects.toMatchObject({ code: "file-exists" })
  })

  it("rejects relative and directory import sources", async () => {
    await expect(
      files.importFile("relative.md", "relative.md")
    ).rejects.toMatchObject({ code: "invalid-path" })
    await expect(files.importFile(outside, "outside")).rejects.toMatchObject({
      code: "not-a-file",
    })
  })

  it("creates case-insensitive unique names for imported files", () => {
    expect(
      uniqueSpaceEntryName(["Image.png", "image 2.png"], "image.png")
    ).toBe("image 3.png")
    expect(uniqueSpaceEntryName([".env"], ".env")).toBe(".env 2")
    expect(uniqueSpaceEntryName([], "archive.tar.gz")).toBe("archive.tar.gz")
  })

  it("never overwrites an existing path during a move", async () => {
    await files.createText("first.md", "first")
    await files.createText("second.md", "second")

    await expect(files.move("first.md", "second.md")).rejects.toMatchObject({
      code: "file-exists",
    })
    await expect(files.readText("first.md")).resolves.toMatchObject({
      content: "first",
    })
    await expect(files.readText("second.md")).resolves.toMatchObject({
      content: "second",
    })
  })

  it("supports case-only renames without weakening overwrite protection", async () => {
    await files.createText("Note.md", "keep")

    await files.move("Note.md", "note.md")

    await expect(files.readText("note.md")).resolves.toMatchObject({
      content: "keep",
    })
    await expect(files.list()).resolves.toEqual([
      expect.objectContaining({ name: "note.md", path: "note.md" }),
    ])
  })

  it("does not mistake separate hard links for the same directory entry", async () => {
    await files.createText("Note.md", "keep")
    await link(path.join(root, "Note.md"), path.join(root, "alias.md"))

    await expect(files.move("Note.md", "alias.md")).rejects.toMatchObject({
      code: "file-exists",
    })
    await expect(files.list()).resolves.toHaveLength(2)
  })

  it("rejects moving a folder inside itself", async () => {
    await files.createDirectory("notes")
    await files.createDirectory("notes/archive")

    await expect(
      files.move("notes", "notes/archive/notes")
    ).rejects.toMatchObject({ code: "invalid-path" })
    await expect(files.list("notes")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "notes/archive" }),
      ])
    )
  })

  it("does not treat a missing no-op move as successful", async () => {
    await expect(files.move("missing.md", "missing.md")).rejects.toMatchObject({
      code: "not-found",
    })
  })

  it("returns existing system paths without exposing private state", async () => {
    await files.createText("note.md", "hello")
    await mkdir(path.join(root, ".eidos"))

    await expect(files.getSystemPath()).resolves.toBe(files.root)
    await expect(files.getSystemPath("note.md")).resolves.toBe(
      path.join(files.root, "note.md")
    )
    await expect(
      files.getSystemPath(".eidos/state.json")
    ).rejects.toMatchObject({ code: "invalid-path" })
  })

  it("does not return a system path through a symbolic-link escape", async () => {
    await writeFile(path.join(outside, "secret.md"), "secret")
    await symlink(path.join(outside, "secret.md"), path.join(root, "alias.md"))

    await expect(files.getSystemPath("alias.md")).rejects.toMatchObject({
      code: "path-outside-space",
    })
  })

  it("maps absolute files back to safe Space-relative paths", async () => {
    await files.createDirectory("Notes")
    await files.createText("Notes/Today.md", "hello")
    await writeFile(path.join(outside, "outside.md"), "outside")

    await expect(
      files.getRelativeFilePath(path.join(root, "Notes", "Today.md"))
    ).resolves.toBe("Notes/Today.md")
    await expect(
      files.getRelativeFilePath(path.join(outside, "outside.md"))
    ).resolves.toBeNull()
    await expect(files.getRelativeFilePath(root)).resolves.toBeNull()
  })

  it("does not map private application state into public file paths", async () => {
    await mkdir(path.join(root, ".eidos"))
    const privateFile = path.join(root, ".eidos", "state.json")
    await writeFile(privateFile, "{}")

    await expect(files.getRelativeFilePath(privateFile)).rejects.toMatchObject({
      code: "invalid-path",
    })
  })

  it("rejects lexical and symbolic-link escapes", async () => {
    await writeFile(path.join(outside, "secret.md"), "secret")
    await symlink(outside, path.join(root, "escape"))

    await expect(files.readText("../secret.md")).rejects.toMatchObject({
      code: "path-outside-space",
    })
    await expect(files.readText("escape/secret.md")).rejects.toMatchObject({
      code: "path-outside-space",
    })
  })

  it("removes a symbolic link without removing its in-Space target", async () => {
    await writeFile(path.join(root, "target.md"), "keep")
    await symlink(path.join(root, "target.md"), path.join(root, "alias.md"))

    await files.remove("alias.md")

    await expect(files.readText("target.md")).resolves.toMatchObject({
      content: "keep",
    })
    await expect(files.readText("alias.md")).rejects.toMatchObject({
      code: "not-found",
    })
  })

  it("never exposes .eidos or .graft through the file API", async () => {
    await mkdir(path.join(root, ".eidos"))
    await writeFile(path.join(root, ".eidos", "state.json"), "{}")
    await symlink(path.join(root, ".eidos"), path.join(root, "private-alias"))

    await expect(files.readText(".eidos/state.json")).rejects.toMatchObject({
      code: "invalid-path",
    })
    await expect(
      files.readText("private-alias/state.json")
    ).rejects.toMatchObject({ code: "invalid-path" })
  })

  it.each([".EIDOS", ".GRAFT"])(
    "reserves the case variant %s",
    async (directory) => {
      await mkdir(path.join(root, directory))
      await writeFile(path.join(root, directory, "state.json"), "{}")

      await expect(files.list()).resolves.toEqual([])
      await expect(
        files.readText(`${directory}/state.json`)
      ).rejects.toMatchObject({ code: "invalid-path" })
    }
  )
})
