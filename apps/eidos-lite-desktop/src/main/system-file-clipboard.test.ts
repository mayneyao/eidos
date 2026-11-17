import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import {
  SystemFileClipboard,
  runFileClipboardHelper,
  type SystemClipboardFiles,
} from "./system-file-clipboard"
import { SpaceSession } from "./space/space-session"

const executable = path.resolve("resources/file-clipboard/eidos-file-clipboard")
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAcAAAAFCAYAAACJmvbYAAAAKUlEQVR4nGOQZ6j/jwszyGsCGTgwg3wQkIEDM8hXAxk4MIP8EiADBwYAte1DroUHza8AAAAASUVORK5CYII=",
  "base64"
)

it("serializes copies, rejects superseded work and checks ownership without reading clipboard contents", async () => {
  let count = 1
  const run = vi.fn(
    async (_executable: string, request: Record<string, unknown>) => {
      if (request.action === "write") {
        if (request.expected !== count) throw new Error("Clipboard changed")
        count += 1
      }
      return { changeCount: count }
    }
  )
  const board = new SystemFileClipboard("helper", true, run)
  const first = board.reserve()
  const second = board.reserve()
  await expect(
    board.write(first, { paths: ["/old"] }, () => {}, 1)
  ).rejects.toThrow("superseded")
  const result = await board.write(second, { paths: ["/current"] }, () => {}, 1)
  expect(await board.isCurrent(result.systemClipboardToken)).toBe(true)
  count += 1 // another application copied something
  expect(await board.isCurrent(result.systemClipboardToken)).toBe(false)
  await expect(
    board.write(board.reserve(), { paths: ["/next"] }, () => {}, 2)
  ).rejects.toThrow("changed")
  expect(
    run.mock.calls
      .filter(([, request]) => request.action === "state")
      .every(([, request]) => Object.keys(request).length === 1)
  ).toBe(true)
  expect(await board.isCurrent("not-a-token")).toBe(false)
})

async function fixture(readOnly = false) {
  const temporary = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-system-clipboard-"))
  )
  const root = path.join(temporary, "Space 中文")
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, "图片 original.png"), png)
  await fs.writeFile(
    path.join(root, "note with 空格.txt"),
    "original attachment"
  )
  await fs.writeFile(
    path.join(root, "active.eidos"),
    "do not export a raw database"
  )
  await fs.mkdir(path.join(root, "folder"))
  const session = await SpaceSession.create(
    root,
    path.join(temporary, "state"),
    {
      readOnly,
      graft: {
        backend: "sdk",
        expectedVersion: () => "test",
        hasOpenSession: () => false,
        close: async () => undefined,
      } as never,
    }
  )
  await session.searchPaths("note")
  return {
    root,
    temporary,
    session,
    close: async () => {
      await session.close()
      await fs.rm(temporary, { recursive: true, force: true })
    },
  }
}

it("keeps host identity, root, symlink and read-only boundaries and does not traverse directories on Copy", async () => {
  const f = await fixture(true)
  try {
    const before = await fs.readdir(f.root)
    const sources = await f.session.preparePathClipboard(["图片 original.png"])
    const publish = vi.fn(async (files: SystemClipboardFiles) => files)
    const result = await f.session.withSystemClipboardFiles(
      sources,
      "copy",
      publish
    )
    expect(result.paths).toEqual([path.join(f.root, "图片 original.png")])
    expect(Buffer.from(result.image!, "base64")).toEqual(png)
    const readdir = vi.spyOn(fs, "readdir")
    const directory = await f.session.preparePathClipboard(["folder"])
    expect(
      await f.session.withSystemClipboardFiles(directory, "copy", publish)
    ).toMatchObject({ paths: [], internalOnly: true })
    expect(readdir).not.toHaveBeenCalled()
    readdir.mockRestore()
    const database = await f.session.preparePathClipboard(["active.eidos"])
    expect(
      await f.session.withSystemClipboardFiles(database, "copy", publish)
    ).toMatchObject({ paths: [], internalOnly: true })
    expect(
      await f.session.withSystemClipboardFiles(sources, "cut", publish)
    ).toMatchObject({ paths: [], image: undefined })
    await fs.symlink(
      path.join(f.root, "note with 空格.txt"),
      path.join(f.root, "linked.txt")
    )
    await expect(
      f.session.preparePathClipboard(["linked.txt"])
    ).rejects.toThrow("symlink")
    await expect(
      f.session.preparePathClipboard(["../escape"])
    ).rejects.toThrow()
    await expect(
      f.session.preparePathClipboard([".eidos/config"])
    ).rejects.toThrow()
    await expect(
      f.session.withSystemClipboardFiles(
        { ...sources, spaceId: "another" },
        "copy",
        publish
      )
    ).rejects.toThrow("Space changed")
    await fs.rename(
      path.join(f.root, "图片 original.png"),
      path.join(f.root, "preserved.png")
    )
    await fs.writeFile(path.join(f.root, "图片 original.png"), png)
    await expect(
      f.session.withSystemClipboardFiles(sources, "copy", publish)
    ).rejects.toThrow("source changed")
    await expect(f.session.createFolder(null, "blocked")).rejects.toThrow(
      "read-only"
    )
    expect(before).toEqual([
      "active.eidos",
      "folder",
      "note with 空格.txt",
      "图片 original.png",
    ])
  } finally {
    await f.close()
  }
})

it.skipIf(process.platform !== "darwin" || !existsSync(executable))(
  "publishes real macOS file items and original PNG/TIFF on an isolated pasteboard",
  async () => {
    const f = await fixture()
    const name = `eidos-test-${randomUUID()}`
    const run = (binary: string, request: Record<string, unknown>) =>
      runFileClipboardHelper(binary, request, name)
    const board = new SystemFileClipboard(executable, true, run)
    const inspect = async () =>
      (await run(executable, { action: "inspect" })) as Awaited<
        ReturnType<typeof run>
      > & {
        paths: string[]
        types: string[][]
        imageSize: number[]
        png: string
      }
    const evidence: Record<string, unknown> = { isolatedPasteboard: true }
    try {
      const copy = async (paths: string[], mode: "copy" | "cut" = "copy") => {
        const generation = board.reserve()
        const count = await board.changeCount()
        const sources = await f.session.preparePathClipboard(paths)
        return f.session.withSystemClipboardFiles(sources, mode, (files) =>
          board.write(generation, files, () => {}, count)
        )
      }
      const first = await copy(["图片 original.png"])
      const image = await inspect()
      expect(image.paths).toEqual([path.join(f.root, "图片 original.png")])
      expect(image.types[0]).toEqual(
        expect.arrayContaining(["public.file-url", "public.png", "public.tiff"])
      )
      expect(image.imageSize).toEqual([7, 5])
      expect(Buffer.from(image.png, "base64")).toEqual(png)
      expect(await board.isCurrent(first.systemClipboardToken)).toBe(true)
      evidence.image = {
        types: image.types,
        size: image.imageSize,
        pngOriginalBytesEqual: true,
      }
      const oldCount = await board.changeCount()
      await copy(["note with 空格.txt", "图片 original.png"])
      const multiple = await inspect()
      expect(multiple.paths).toEqual(
        ["note with 空格.txt", "图片 original.png"].map((p) =>
          path.join(f.root, p)
        )
      )
      expect(multiple.types).toHaveLength(2)
      expect(await board.isCurrent(first.systemClipboardToken)).toBe(false)
      await expect(
        run(executable, {
          action: "write",
          paths: [path.join(f.root, "active.eidos")],
          expected: oldCount,
        })
      ).rejects.toThrow("unavailable")
      expect((await inspect()).paths).toEqual(multiple.paths)
      const limited = await copy(["active.eidos"])
      expect(limited.systemClipboardWarning).toContain("only within Eidos Lite")
      expect((await inspect()).paths).toEqual([])
      await copy(["folder"])
      expect((await inspect()).paths).toEqual([])
      await copy(["图片 original.png"], "cut")
      expect((await inspect()).paths).toEqual([])
      expect(await fs.readFile(path.join(f.root, "图片 original.png"))).toEqual(
        png
      )
      expect(
        await fs.readFile(path.join(f.root, "note with 空格.txt"), "utf8")
      ).toBe("original attachment")
      evidence.multiple = {
        itemCount: multiple.types.length,
        types: multiple.types,
        unicodeAndSpacesPreserved: true,
      }
      evidence.guards = {
        changedOwnershipInvalidates: true,
        staleWritePreservesNewerClipboard: true,
        internalOnlyClearsOldFileItems: true,
        cutDoesNotExportMove: true,
        sourceBytesUnchanged: true,
      }
      const output = process.env.EIDOS_LITE_SYSTEM_CLIPBOARD_EVIDENCE
      if (output)
        await fs.writeFile(output, JSON.stringify(evidence, null, 2) + "\n")
    } finally {
      await run(executable, { action: "release" })
      await f.close()
    }
  }
)
