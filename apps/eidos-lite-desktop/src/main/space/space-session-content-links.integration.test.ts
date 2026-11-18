import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { vi } from "vitest"
import type { RuntimeWorkerRequest } from "../../shared/contracts"

const transport = vi.hoisted(() => ({ bootstrap: "" }))
vi.mock("electron", async () => {
  const { fork } = await import("node:child_process")
  return {
    utilityProcess: {
      fork: () => {
        const child = fork(transport.bootstrap, [], {
          execPath: process.execPath,
          execArgv: [],
          serialization: "advanced",
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        })
        return Object.assign(child, {
          postMessage: (request: RuntimeWorkerRequest) => child.send(request),
        })
      },
    },
  }
})
import { SpaceSession } from "./space-session"
import { createEidosLiteFileRuntime } from "../../runtime/eidos-file-runtime"

const worker = path.resolve(process.cwd(), "dist-electron/runtime-worker.js")
it.skipIf(
  process.env.EIDOS_LITE_RUN_CONTENT_LINKS !== "1" || !existsSync(worker)
)(
  "maintains Markdown and formal Content owner/target links through the real Space gate and built Runtime worker",
  async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "eidos-content-worker-"))
    )
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0,
    ])
    let session: SpaceSession | undefined
    try {
      await fs.mkdir(path.join(root, "a/assets"), { recursive: true })
      await fs.mkdir(path.join(root, "deep/inner"), { recursive: true })
      await fs.mkdir(path.join(root, "assets"))
      await fs.writeFile(path.join(root, "assets/c.png"), png)
      await fs.writeFile(path.join(root, "assets/plan.txt"), "shared plan")
      await fs.writeFile(path.join(root, "a/assets/local.png"), png)
      await fs.writeFile(
        path.join(root, "a/a.md"),
        "![shared](../assets/c.png)\r\n"
      )
      await fs.writeFile(
        path.join(root, "a/b.markdown"),
        "![shared](../assets/c.png)\r\n"
      )
      const seed = await createEidosLiteFileRuntime(
        path.join(root, "a/data.eidos"),
        "Body fixture",
        { contentFieldName: "Body" }
      )
      const tableId = seed.initialSnapshot.tables[0]!.table.id
      let rowId: string,
        bodyColumn: string,
        otherColumn: string,
        fileColumn: string,
        originalFiles: unknown
      try {
        await seed.source.addField(tableId, { name: "Other", type: "text" })
        const snapshot = await seed.source.addField(tableId, {
          name: "Files",
          type: "file",
        })
        const field = (name: string) =>
          snapshot.tables[0]!.fields.find((f) => f.name === name)!
        bodyColumn = field("Body").tableColumnName
        otherColumn = field("Other").tableColumnName
        fileColumn = field("Files").tableColumnName
        const entry = await seed.allocateFileEntry({
          name: "local.png",
          uri: "assets/local.png",
          size: String(png.length),
          mediaType: "image/png",
        })
        const inserted = await seed.source.insertRow(tableId, {
          [field("Body").id]:
            "![shared](../assets/c.png)\n[plan](../assets/plan.txt?download=1#heading)",
          [field("Other").id]: "![not Content](../assets/c.png)",
          [field("Files").id]: [entry],
        })
        rowId = String(inserted.row._id)
        originalFiles = inserted.row[fileColumn]
      } finally {
        await seed.close()
      }
      transport.bootstrap = path.join(root, "worker.mjs")
      await fs.writeFile(
        transport.bootstrap,
        `Object.defineProperty(process,"parentPort",{value:{on:(_event,listener)=>process.on("message",value=>listener({data:value})),postMessage:value=>process.send(value)}});await import(${JSON.stringify(worker)});`
      )
      session = await SpaceSession.create(root, path.join(root, "state"), {
        workerPath: worker,
        graft: {
          backend: "sdk",
          expectedVersion: () => "test",
          hasOpenSession: () => false,
          close: async () => {},
        } as never,
      })
      const renamed = await session.renamePath("assets/c.png", "图 #%.png")
      expect(renamed.markdownLinks?.skippedPaths).toEqual([])
      const moved = await session.movePaths(
        ["a/data.eidos", "a/a.md"],
        "deep/inner"
      )
      expect(moved.failure).toBeUndefined()
      expect(moved.markdownLinks?.skippedPaths).toEqual([])
      const opened = await session.openEidosFile("deep/inner/data.eidos")
      const row = await session.callRuntime(opened.sessionId, "getRow", [
        tableId,
        rowId!,
      ])
      expect(row?.[bodyColumn!]).toBe(
        "![shared](../../assets/%E5%9B%BE%20%23%25.png)\n[plan](../../assets/plan.txt?download=1#heading)"
      )
      expect(row?.[otherColumn!]).toBe("![not Content](../assets/c.png)")
      expect(row?.[fileColumn!]).toBe(originalFiles)
      expect(
        await session.resolveMarkdownImage(
          "deep/inner/data.eidos",
          "../../assets/%E5%9B%BE%20%23%25.png"
        )
      ).toMatchObject({ relativePath: "assets/图 #%.png" })
      expect(
        await session.resolveMarkdownLink(
          "deep/inner/data.eidos",
          "../../assets/plan.txt?download=1#heading"
        )
      ).toMatchObject({ relativePath: "assets/plan.txt" })
      expect(
        await fs.readFile(path.join(root, "deep/inner/a.md"), "utf8")
      ).toBe("![shared](../../assets/%E5%9B%BE%20%23%25.png)\r\n")
      expect(await fs.readFile(path.join(root, "a/b.markdown"), "utf8")).toBe(
        "![shared](../assets/%E5%9B%BE%20%23%25.png)\r\n"
      )
      expect(await fs.readFile(path.join(root, "assets/图 #%.png"))).toEqual(
        Buffer.from(png)
      )
      expect(await fs.readFile(path.join(root, "a/assets/local.png"))).toEqual(
        Buffer.from(png)
      )
    } finally {
      await session?.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  },
  30000
)
