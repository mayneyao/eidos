import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { SpaceSession } from "./space-session"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { createFsMetaEidosFile } from "../../runtime/fs-meta-file"
import { openEidosLiteFileRuntime } from "../../runtime/eidos-file-runtime"
import { SPACE_FILE_METADATA_PATH } from "../../shared/file-metadata"

it("browses a protected Space without catalog initialization, repository access or source mutations", async () => {
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-readonly-space-")
  )
  const root = path.join(temporary, "中文 Space")
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, "记录.md"), "# Read only\n")
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  const inspect = vi.spyOn(graft, "inspectSpace")
  const initialize = vi.spyOn(graft, "initialize")
  const session = await SpaceSession.create(
    root,
    path.join(temporary, "profile"),
    { graft, readOnly: true }
  )
  try {
    expect((await session.snapshot()).readOnly).toBe(true)
    expect(
      (await session.refreshExplorer()).entries.some(
        (entry) => entry.name === "记录.md"
      )
    ).toBe(true)
    expect(session.resolveUserPath("记录.md")).toBe(
      path.join(await fs.realpath(root), "记录.md")
    )
    expect(await session.previewTextFile("记录.md")).toMatchObject({
      content: "# Read only\n",
    })
    await expect(session.openFileMetadata(null)).rejects.toThrow()
    await expect(
      session.saveSpaceIgnoreRules({ graftignore: "x", gitignore: "" })
    ).rejects.toThrow(/read-only/)
    await expect(
      session.callRuntime("unused", "insertRow", ["table", {}])
    ).rejects.toThrow(/read-only/)
    await expect(session.enableVersioning()).rejects.toThrow(/read-only/)
    expect(inspect).not.toHaveBeenCalled()
    expect(initialize).not.toHaveBeenCalled()
    expect(await fs.readdir(root)).toEqual(["记录.md"])
    expect(await fs.readFile(path.join(root, "记录.md"), "utf8")).toBe(
      "# Read only\n"
    )
  } finally {
    await session.close()
    await fs.rm(temporary, { recursive: true, force: true })
  }
})

it.skipIf(process.env.EIDOS_LITE_RUN_READONLY_CATALOG !== "1")(
  "opens and refreshes an existing protected catalog with a real read-only Runtime",
  async () => {
    const temporary = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-readonly-catalog-")
    )
    const root = path.join(temporary, "中文 Space")
    await fs.mkdir(path.join(root, ".eidos"), { recursive: true })
    await fs.writeFile(path.join(root, "记录.md"), "# Read only\n")
    const catalog = path.join(root, SPACE_FILE_METADATA_PATH)
    createFsMetaEidosFile(catalog, { root: "..", customFields: [] })
    const bytes = await fs.readFile(catalog)
    const before = await fs.stat(catalog)
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const inspect = vi.spyOn(graft, "inspectSpace")
    const session = await SpaceSession.create(
      root,
      path.join(temporary, "profile"),
      { graft, readOnly: true }
    )
    let runtime:
      | Awaited<ReturnType<typeof openEidosLiteFileRuntime>>
      | undefined
    try {
      vi.spyOn(session.runtimePool, "open").mockImplementation(
        async (relativePath) => {
          runtime ??= await openEidosLiteFileRuntime(
            path.join(root, relativePath),
            { readOnly: true }
          )
          return {
            sessionId: "protected",
            relativePath,
            readOnly: true,
            snapshot: await runtime.source.getSnapshot(),
          }
        }
      )
      vi.spyOn(session.runtimePool, "call").mockImplementation(
        async (_session, method) => {
          if (method === "getExternalChangeProbe")
            return { connectionId: "protected", dataVersion: "1" } as never
          if (method === "getSnapshot")
            return (await runtime!.source.getSnapshot()) as never
          throw new Error(`Unexpected readonly method ${method}`)
        }
      )
      for (let attempt = 0; attempt < 2; attempt++) {
        const opened = await session.openFileMetadata(null)
        expect(opened.readOnly).toBe(true)
        const table = opened.snapshot.tables[0]!
        const page = await runtime!.source.getPage(table.table.id, 0, 20, {})
        expect(page.rows.some((row) => row._id === "记录.md")).toBe(true)
        expect(table.fields.every((field) => field.writable === false)).toBe(
          true
        )
        await expect(
          runtime!.source.insertRow(table.table.id, {})
        ).rejects.toBeDefined()
        await session.refreshExplorer()
      }
      expect(inspect).not.toHaveBeenCalled()
      expect(await fs.readFile(catalog)).toEqual(bytes)
      const after = await fs.stat(catalog)
      expect([after.size, after.mtimeMs, after.ctimeMs]).toEqual([
        before.size,
        before.mtimeMs,
        before.ctimeMs,
      ])
      expect(await fs.readdir(path.join(root, ".eidos"))).toEqual([
        "files.eidos",
      ])
    } finally {
      await runtime?.close()
      await session.close()
      await fs.rm(temporary, { recursive: true, force: true })
    }
  }
)
