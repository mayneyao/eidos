import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SpaceSession } from "./space-session"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { createEidosLiteFileRuntime } from "../../runtime/eidos-file-runtime"
import {
  RUNTIME_METHODS,
  RUNTIME_MUTATION_METHODS,
  RUNTIME_READ_METHODS,
} from "../../shared/contracts"
import { SPACE_FILE_METADATA_PATH } from "../../shared/file-metadata"

it("classifies every Runtime method as read or mutation", () => {
  const read = new Set<string>(RUNTIME_READ_METHODS)
  const mutation = new Set<string>(RUNTIME_MUTATION_METHODS)
  for (const method of RUNTIME_METHODS)
    expect(read.has(method) || mutation.has(method)).toBe(true)
  for (const method of mutation) expect(read.has(method)).toBe(false)
})

it("protects metadata creation, runtime edits and plugin patches while preserving reads and ordinary files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "spark-space-"))
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "spark-state-"))
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let allowed = false
  const guard = vi.fn(async () => {
    if (!allowed) throw new Error("Activate Spark")
  })
  const session = await SpaceSession.create(root, state, {
    graft,
    requireSparkFeature: guard,
  })
  const filePath = path.join(root, "files.eidos")
  let runtime:
    | Awaited<ReturnType<typeof createEidosLiteFileRuntime>>
    | undefined
  try {
    await fs.writeFile(path.join(root, "note.txt"), "ordinary local data")
    await expect(session.openFileMetadata(null)).rejects.toThrow(
      "Activate Spark"
    )
    await expect(
      fs.stat(path.join(root, SPACE_FILE_METADATA_PATH))
    ).rejects.toMatchObject({
      code: "ENOENT",
    })
    await expect(
      session.createEidosFile(null, "custom", "files-index")
    ).rejects.toThrow("Activate Spark")
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(session.patchFileMeta("note.txt", "test", {})).rejects.toThrow(
      "Activate Spark"
    )
    runtime = await createEidosLiteFileRuntime(filePath, "Files")
    const before = await fs.readFile(filePath)
    const call = vi
      .spyOn(session.runtimePool, "call")
      .mockImplementation(async (_id, method) =>
        method === "getExternalChangeProbe"
          ? ({ connectionId: "fixture", dataVersion: "1" } as never)
          : (runtime!.initialSnapshot as never)
      )
    await expect(
      session.callRuntime("fixture", "insertRow", [
        runtime.initialSnapshot.tables[0]!.table.id,
        {},
      ])
    ).rejects.toThrow("Activate Spark")
    expect(call.mock.calls.map((args) => args[1])).toEqual([
      "getExternalChangeProbe",
      "getSnapshot",
    ])
    await expect(
      session.callRuntime("fixture", "insertRow", [
        runtime.initialSnapshot.tables[0]!.table.id,
        {},
      ])
    ).rejects.toThrow("Activate Spark")
    expect(
      call.mock.calls.filter((args) => args[1] === "getSnapshot")
    ).toHaveLength(1)
    expect(await fs.readFile(filePath)).toEqual(before)
    expect(await fs.readFile(path.join(root, "note.txt"), "utf8")).toBe(
      "ordinary local data"
    )
    await expect(session.readTextFile("note.txt")).resolves.toBe(
      "ordinary local data"
    )
    const read = vi.spyOn(session.runtimePool, "filemeta").mockResolvedValue({})
    await expect(session.readFileMeta("note.txt", "test")).resolves.toEqual({})
    expect(read).toHaveBeenCalledWith("note.txt", "test")
    allowed = true
    await expect(
      session.patchFileMeta("note.txt", "test", {})
    ).resolves.toEqual({})
  } finally {
    await runtime?.close()
    await session.close()
    await graft.close()
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(state, { recursive: true, force: true })
  }
})
