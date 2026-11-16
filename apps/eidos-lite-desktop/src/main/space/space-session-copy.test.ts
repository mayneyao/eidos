import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SpaceSession } from "./space-session"
import * as spacePaths from "./space-paths"
import {
  copyEidosFileSnapshot,
  createEidosLiteFileRuntime,
  openEidosLiteFileRuntime,
} from "../../runtime/eidos-file-runtime"

const graft = {
  backend: "sdk",
  expectedVersion: () => "test",
  hasOpenSession: () => false,
  close: async () => undefined,
}

async function fixture() {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "lite-copy-"))
  )
  const root = path.join(directory, "Space")
  await fs.mkdir(path.join(root, "source/nested"), { recursive: true })
  await fs.mkdir(path.join(root, "target"))
  await fs.mkdir(path.join(root, "again"))
  await fs.writeFile(
    path.join(root, "source/note.md"),
    "![image](assets/image.png)\n"
  )
  await fs.writeFile(path.join(root, "source/nested/中文 😀.txt"), "nested")
  const session = await SpaceSession.create(
    root,
    path.join(directory, "state"),
    { graft: graft as never }
  )
  await session.snapshot()
  vi.spyOn(session.runtimePool, "copyFileSnapshot").mockImplementation(
    copyEidosFileSnapshot
  )
  return {
    root,
    session,
    close: async () => {
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}

it("copies files and nested folders repeatedly, preserves originals and publishes the target tree", async () => {
  const f = await fixture()
  try {
    await f.session.copyPath("source", "target")
    await f.session.copyPath("source", "again")
    await f.session.loadDirectory("target/source/nested")
    expect(
      await fs.readFile(
        path.join(f.root, "target/source/nested/中文 😀.txt"),
        "utf8"
      )
    ).toBe("nested")
    expect(await fs.readFile(path.join(f.root, "source/note.md"), "utf8")).toBe(
      "![image](assets/image.png)\n"
    )
    expect(
      await fs.readFile(path.join(f.root, "again/source/note.md"), "utf8")
    ).toBe("![image](assets/image.png)\n")
    await expect(f.session.copyPath("source", "target")).rejects.toThrow(
      /exists/i
    )
  } finally {
    await f.close()
  }
})

it("rejects same-directory, self/descendant, invalid, protected and symlink sources or targets without overwriting", async () => {
  const f = await fixture()
  try {
    await fs.writeFile(path.join(f.root, "target/note.md"), "keep")
    await expect(
      f.session.copyPath("source/note.md", "target")
    ).rejects.toThrow(/exists/i)
    await expect(
      f.session.copyPath("source/note.md", "source")
    ).rejects.toThrow(/another destination/i)
    await expect(f.session.copyPath("source", "source/nested")).rejects.toThrow(
      /inside itself/i
    )
    await expect(f.session.copyPath("missing", "target")).rejects.toThrow()
    await expect(f.session.copyPath(".eidos/config", "target")).rejects.toThrow(
      /protected/i
    )
    await fs.symlink(path.join(f.root, "source"), path.join(f.root, "linked"))
    await expect(
      f.session.copyPath("linked/note.md", "target")
    ).rejects.toThrow(/exists|symlink/i)
    await expect(f.session.copyPath("source/nested", "linked")).rejects.toThrow(
      /symlink/i
    )
    expect(await fs.readFile(path.join(f.root, "target/note.md"), "utf8")).toBe(
      "keep"
    )
  } finally {
    await f.close()
  }
})

it("uses exclusive file creation when a destination appears after preflight", async () => {
  const f = await fixture()
  const original = fs.copyFile.bind(fs)
  const spy = vi
    .spyOn(fs, "copyFile")
    .mockImplementationOnce(async (from, to, mode) => {
      await fs.writeFile(to, "other process")
      return original(from, to, mode)
    })
  try {
    await expect(
      f.session.copyPath("source/note.md", "target")
    ).rejects.toThrow()
    expect(await fs.readFile(path.join(f.root, "target/note.md"), "utf8")).toBe(
      "other process"
    )
  } finally {
    spy.mockRestore()
    await f.close()
  }
})

it("cleans its incomplete directory after a nested copy failure", async () => {
  const f = await fixture()
  const spy = vi
    .spyOn(fs, "copyFile")
    .mockRejectedValueOnce(new Error("copy denied"))
  try {
    await expect(f.session.copyPath("source", "target")).rejects.toThrow(
      "copy denied"
    )
    expect(await fs.readdir(path.join(f.root, "target"))).toEqual([])
    expect(await fs.readdir(path.join(f.root, "source"))).toContain("note.md")
  } finally {
    spy.mockRestore()
    await f.close()
  }
})

it("revalidates clipboard source identity after edits, rename, replacement, deletion and Space changes", async () => {
  const f = await fixture()
  try {
    const clipboard = await f.session.preparePathClipboard(["source/note.md"])
    await fs.writeFile(path.join(f.root, "source/note.md"), "latest edit")
    await f.session.copyPath("source/note.md", "target", clipboard)
    expect(await fs.readFile(path.join(f.root, "target/note.md"), "utf8")).toBe(
      "latest edit"
    )
    await fs.rename(
      path.join(f.root, "source/note.md"),
      path.join(f.root, "source/renamed.md")
    )
    await expect(
      f.session.copyPath("source/note.md", "again", clipboard)
    ).rejects.toThrow()
    await fs.writeFile(path.join(f.root, "source/note.md"), "replacement")
    await expect(
      f.session.copyPath("source/note.md", "again", clipboard)
    ).rejects.toThrow(/clipboard source changed/)
    const move = await f.session.movePaths(
      ["source/note.md"],
      "again",
      clipboard
    )
    expect(move.moves).toEqual([])
    expect(move.failure?.message).toMatch(/clipboard source changed/)
    const fresh = await f.session.preparePathClipboard(["source/note.md"])
    await expect(
      f.session.copyPath("source/note.md", "again", {
        ...fresh,
        spaceId: "other",
      })
    ).rejects.toThrow(/Space changed/)
    await fs.unlink(path.join(f.root, "source/note.md"))
    const deleted = await f.session.movePaths(
      ["source/note.md"],
      "again",
      fresh
    )
    expect(deleted.moves).toEqual([])
    expect(deleted.failure).toBeTruthy()
  } finally {
    await f.close()
  }
})

it("keeps copy IO success separate from a failed tree refresh", async () => {
  const f = await fixture()
  const list = vi
    .spyOn(spacePaths, "listSpaceDirectory")
    .mockRejectedValueOnce(new Error("folder read unavailable"))
  try {
    const result = await f.session.copyPath("source/note.md", "target")
    expect(result.relativePath).toBe("target/note.md")
    expect(result.refreshError).toBe("folder read unavailable")
    expect(result.snapshot.entries.length).toBeGreaterThan(0)
    expect(
      await fs.readFile(path.join(f.root, "target/note.md"), "utf8")
    ).toContain("![image]")
  } finally {
    list.mockRestore()
    await f.close()
  }
})

it("fences tree reads while a copy is incomplete", async () => {
  const f = await fixture()
  const original = fs.copyFile.bind(fs)
  let release!: () => void
  let entered!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const copy = vi
    .spyOn(fs, "copyFile")
    .mockImplementationOnce(async (...args) => {
      entered()
      await pending
      await original(...args)
    })
  try {
    const copying = f.session.copyPath("source/note.md", "target")
    await started
    let readFinished = false
    const reading = f.session.snapshot().then((snapshot) => {
      readFinished = true
      return snapshot
    })
    await Promise.resolve()
    expect(readFinished).toBe(false)
    release()
    const result = await copying
    expect((await reading).entries).toEqual(result.snapshot.entries)
  } finally {
    release()
    copy.mockRestore()
    await f.close()
  }
})

it("reports a cross-device cut failure without moving the source", async () => {
  const f = await fixture()
  const clipboard = await f.session.preparePathClipboard(["source/note.md"])
  const rename = vi
    .spyOn(fs, "rename")
    .mockRejectedValueOnce(
      Object.assign(new Error("cross-device move"), { code: "EXDEV" })
    )
  try {
    const result = await f.session.movePaths(
      ["source/note.md"],
      "target",
      clipboard
    )
    expect(result.moves).toEqual([])
    expect(result.failure?.message).toBe("cross-device move")
    expect(
      await fs.readFile(path.join(f.root, "source/note.md"), "utf8")
    ).toContain("![image]")
  } finally {
    rename.mockRestore()
    await f.close()
  }
})

it("copies an open Eidos File using the canonical snapshot and keeps its identity and rows", async () => {
  const f = await fixture()
  const source = path.join(f.root, "source/active.eidos")
  const opened = await createEidosLiteFileRuntime(source, "Active", {
    template: "blank",
  })
  try {
    const table = opened.initialSnapshot.tables[0]!
    const field = table.fields.find((entry) => entry.type === "text")!
    const inserted = await opened.source.insertRow(table.table.id, {
      [field.id]: "committed while open",
    })
    const identity = opened.initialSnapshot.metadata.fileId
    await f.session.copyPath("source", "target")
    const copied = await openEidosLiteFileRuntime(
      path.join(f.root, "target/source/active.eidos")
    )
    try {
      expect(copied.initialSnapshot.metadata.fileId).toBe(identity)
      expect(
        (await copied.source.getRow(table.table.id, String(inserted.row._id)))![
          field.id
        ]
      ).toBe("committed while open")
      expect(
        await fs.readdir(path.join(f.root, "target/source"))
      ).not.toContain("active.eidos-wal")
    } finally {
      await copied.close()
    }
    expect(
      await opened.source.getRow(table.table.id, String(inserted.row._id))
    ).toBeTruthy()
  } finally {
    await opened.close()
    await f.close()
  }
})
