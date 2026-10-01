import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SpaceSession } from "./space-session"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import {
  createEidosLiteFileRuntime,
  type openEidosLiteFileRuntime,
} from "../../runtime/eidos-file-runtime"

it("inherits the nearest parent configuration and enforces one catalog per folder", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-properties-space-")
  )
  const userData = await fs.mkdtemp(
    path.join(os.tmpdir(), "eidos-properties-state-")
  )
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session: SpaceSession | undefined
  const runtimes = new Map<
    string,
    Awaited<ReturnType<typeof openEidosLiteFileRuntime>>
  >()
  try {
    await fs.mkdir(path.join(root, "assets"))
    await fs.writeFile(path.join(root, "assets/proof.txt"), "proof")
    const parent = await createEidosLiteFileRuntime(
      path.join(root, "files.eidos"),
      "Files"
    )
    runtimes.set("files.eidos", parent)
    const tableId = parent.initialSnapshot.tables[0]!.table.id
    await parent.source.addField(tableId, {
      name: "Status",
      type: "select",
      property: { options: [{ name: "Ready", color: "green" }] },
    })
    expect(
      (await parent.source.getSnapshot()).tables[0]!.fields.map(
        (field) => field.name
      )
    ).toContain("Status")
    session = await SpaceSession.create(root, userData, { graft })
    vi.spyOn(session.runtimePool, "open").mockImplementation(
      async (relativePath) => ({
        sessionId: relativePath,
        relativePath,
        readOnly: false,
        snapshot: await runtimes.get(relativePath)!.source.getSnapshot(),
      })
    )
    vi.spyOn(session.runtimePool, "call").mockImplementation(
      async (_id, method) => {
        if (method === "getExternalChangeProbe")
          return { connectionId: "test", dataVersion: "1" } as never
        return {} as never
      }
    )
    const create = vi
      .spyOn(session.runtimePool, "create")
      .mockImplementation(async (relativePath, title, options) => {
        const runtime = await createEidosLiteFileRuntime(
          path.join(root, relativePath),
          title,
          options
        )
        runtimes.set(relativePath, runtime)
        return {
          sessionId: relativePath,
          relativePath,
          readOnly: false,
          snapshot: runtime.initialSnapshot,
        }
      })
    const created = await session.createEidosFile(
      "assets",
      "custom-name.eidos",
      "files-index"
    )
    expect(created.relativePath).toBe("assets/files.eidos")
    expect(
      create.mock.calls[0]?.[2]?.metadataSchema?.fields.map(
        (field) => field.name
      )
    ).toContain("Status")
    await expect(
      session.createEidosFile("assets", "second.eidos", "files-index")
    ).rejects.toThrow()
  } finally {
    await session?.close()
    await graft.close()
    for (const runtime of runtimes.values()) await runtime.close()
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(userData, { recursive: true, force: true })
  }
})
