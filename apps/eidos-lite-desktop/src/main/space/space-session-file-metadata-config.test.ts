import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SpaceSession } from "./space-session"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { createEidosLiteFileRuntime } from "../../runtime/eidos-file-runtime"
import { SPACE_FILE_METADATA_PATH } from "../../shared/file-metadata"
import type { EidosFileDataSource } from "@eidos.space/eidos-file"

it("reads basic file properties without Spark or a metadata catalog", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-basic-properties-")
  )
  const userData = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-basic-state-")
  )
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session: SpaceSession | undefined
  try {
    await fs.writeFile(path.join(root, "proof.md"), "proof")
    const requireSparkFeature = vi.fn(async () => {
      throw new Error("Spark required")
    })
    session = await SpaceSession.create(root, userData, {
      graft,
      requireSparkFeature,
    })
    const stats = await fs.stat(path.join(root, "proof.md"))
    expect(await session.getExplorerFilterFields()).toEqual([])
    expect(await session.statFile("proof.md")).toMatchObject({
      path: "proof.md",
      extension: ".md",
      size: 5,
      createdAtMs: stats.birthtimeMs,
      modifiedAtMs: stats.mtimeMs,
    })
    expect(requireSparkFeature).not.toHaveBeenCalled()
    await expect(
      fs.stat(path.join(root, SPACE_FILE_METADATA_PATH))
    ).rejects.toMatchObject({ code: "ENOENT" })
    expect(await session.statFile("missing.md")).toBeNull()
    await expect(session.statFile("../outside.md")).rejects.toThrow()
    if (process.platform !== "win32") {
      await fs.symlink(path.join(root, "proof.md"), path.join(root, "link.md"))
      expect(await session.statFile("link.md")).toBeNull()
    }
  } finally {
    await session?.close()
    await graft.close()
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(userData, { recursive: true, force: true })
  }
})

it("creates one Space catalog, shares fields and views, and leaves legacy catalogs untouched", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-properties-space-")
  )
  const userData = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-properties-state-")
  )
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session: SpaceSession | undefined
  let runtime:
    | Awaited<ReturnType<typeof createEidosLiteFileRuntime>>
    | undefined
  try {
    await fs.mkdir(path.join(root, "assets/nested"), { recursive: true })
    await fs.writeFile(path.join(root, "assets/nested/proof.txt"), "proof")
    const legacy = await createEidosLiteFileRuntime(
      path.join(root, "assets/files.eidos"),
      "Legacy"
    )
    await legacy.close()
    const original = await fs.readFile(path.join(root, "assets/files.eidos"))
    session = await SpaceSession.create(root, userData, { graft })
    vi.spyOn(session.runtimePool, "open").mockImplementation(
      async (relativePath) => {
        expect(relativePath).toBe(SPACE_FILE_METADATA_PATH)
        return {
          sessionId: "global",
          relativePath,
          readOnly: false,
          snapshot: await runtime!.source.getSnapshot(),
        }
      }
    )
    vi.spyOn(session.runtimePool, "call").mockImplementation(
      async (_sessionId, method, args) => {
        if (method === "getPage")
          return runtime!.source.getPage(
            ...(args as Parameters<EidosFileDataSource["getPage"]>)
          ) as never
        return { connectionId: "test", dataVersion: "1" } as never
      }
    )
    const create = vi
      .spyOn(session.runtimePool, "create")
      .mockImplementation(async (relativePath, title, options) => {
        runtime = await createEidosLiteFileRuntime(
          path.join(root, relativePath),
          title,
          options
        )
        return {
          sessionId: "global",
          relativePath,
          readOnly: false,
          snapshot: runtime.initialSnapshot,
        }
      })
    const [first, second] = await Promise.all([
      session.openFileMetadata("assets"),
      session.openFileMetadata(null),
    ])
    expect(create).toHaveBeenCalledOnce()
    expect(first.sessionId).toBe(second.sessionId)
    const { table } = first.snapshot.tables[0]!
    expect(table.settings?.vtabConfig).toMatchObject({ root: ".." })
    await runtime!.source.addField(table.id, { name: "Status", type: "text" })
    const opened = await session.openFileMetadata("assets/nested")
    const status = opened.snapshot.tables[0]!.fields.find(
      (field) => field.name === "Status"
    )!
    await runtime!.source.updateRow(table.id, "assets/nested/proof.txt", {
      [status.id]: "Active",
    })
    expect(
      (await session.getExplorerFilterFields()).map((field) => field.name)
    ).toContain("Status")
    const propertyFilter = {
      type: "group" as const,
      id: "root",
      conjunction: "and" as const,
      children: [
        {
          type: "rule" as const,
          id: "status",
          field: "property" as const,
          operator: "matches" as const,
          value: {
            type: "rule" as const,
            field: status.id,
            operator: "equals" as const,
            value: "Active",
          },
        },
      ],
    }
    const filtered = await session.filterFiles(propertyFilter, null)
    expect(filtered.map((entry) => entry.relativePath)).toEqual(["assets"])
    expect(
      filtered[0]!.children?.[0]?.children?.map((entry) => entry.relativePath)
    ).toEqual(["assets/nested/proof.txt"])
    expect(
      await session.filterFiles(
        {
          ...propertyFilter,
          children: [
            ...propertyFilter.children,
            {
              type: "rule",
              id: "suffix",
              field: "suffix",
              operator: "in",
              value: [".md"],
            },
          ],
        },
        null
      )
    ).toEqual([])
    const either = await session.filterFiles(
      {
        ...propertyFilter,
        conjunction: "or",
        children: [
          ...propertyFilter.children,
          {
            type: "rule",
            id: "suffix",
            field: "suffix",
            operator: "in",
            value: [".eidos"],
          },
        ],
      },
      null
    )
    expect(either[0]!.children?.map((entry) => entry.relativePath)).toEqual([
      "assets/nested",
      "assets/files.eidos",
    ])
    expect(
      await session.filterFiles(
        {
          ...propertyFilter,
          children: [
            {
              ...propertyFilter.children[0]!,
              value: { ...propertyFilter.children[0]!.value, value: "Done" },
            },
          ],
        },
        null
      )
    ).toEqual([])
    await expect(
      session.filterFiles(
        {
          ...propertyFilter,
          children: [
            {
              ...propertyFilter.children[0]!,
              value: {
                ...propertyFilter.children[0]!.value,
                field: "missing-field",
              },
            },
          ],
        },
        null
      )
    ).rejects.toThrow("no longer available")
    expect(
      opened.snapshot.tables[0]!.fields.some((field) => field.name === "Status")
    ).toBe(true)
    expect(opened.snapshot.tables[0]!.views.map((view) => view.id)).toEqual(
      first.snapshot.tables[0]!.views.map((view) => view.id)
    )
    const redirected = await session.createEidosFile(
      "assets",
      "unused.eidos",
      "files-index"
    )
    expect(redirected.relativePath).toBe(SPACE_FILE_METADATA_PATH)
    expect(create).toHaveBeenCalledOnce()
    expect(await fs.readFile(path.join(root, "assets/files.eidos"))).toEqual(
      original
    )
    expect(
      (await session.snapshot()).entries.some(
        (entry) => entry.name === ".eidos"
      )
    ).toBe(false)
    await expect(session.openFileMetadata("../outside")).rejects.toThrow()
    await expect(session.openFileMetadata("missing")).rejects.toThrow()
    await expect(session.openFileMetadata(".eidos")).rejects.toThrow()
    await runtime!.close()
    runtime = undefined
    await fs.rename(
      path.join(root, SPACE_FILE_METADATA_PATH),
      path.join(root, ".eidos/catalog-backup.eidos")
    )
    await fs.writeFile(
      path.join(root, SPACE_FILE_METADATA_PATH),
      "keep this conflicting file"
    )
    const open = vi.mocked(session.runtimePool.open)
    open.mockRejectedValueOnce(new Error("Not an Eidos File"))
    await expect(session.openFileMetadata(null)).rejects.toThrow(
      "Not an Eidos File"
    )
    expect(
      await fs.readFile(path.join(root, SPACE_FILE_METADATA_PATH), "utf8")
    ).toBe("keep this conflicting file")
    if (process.platform !== "win32") {
      await fs.rename(
        path.join(root, SPACE_FILE_METADATA_PATH),
        path.join(root, ".eidos/conflict.txt")
      )
      await fs.symlink(
        path.join(root, "assets/files.eidos"),
        path.join(root, SPACE_FILE_METADATA_PATH)
      )
      await expect(session.openFileMetadata(null)).rejects.toThrow(
        "ordinary file"
      )
      await fs.rename(
        path.join(root, ".eidos"),
        path.join(root, "private-backup")
      )
      await fs.symlink(
        path.join(root, "private-backup"),
        path.join(root, ".eidos")
      )
      await expect(session.openFileMetadata(null)).rejects.toThrow(
        "without symlinks"
      )
    }
  } finally {
    await session?.close()
    await graft.close()
    await runtime?.close()
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(userData, { recursive: true, force: true })
  }
})
