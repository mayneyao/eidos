import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import type { RuntimeWorkerRequest } from "../../shared/contracts"

const transport = vi.hoisted(() => ({
  bootstrap: "",
  requests: [] as RuntimeWorkerRequest[],
}))
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
          postMessage: (request: RuntimeWorkerRequest) => {
            transport.requests.push(structuredClone(request))
            child.send(request)
          },
        })
      },
    },
  }
})
import { SpaceSession } from "./space-session"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SPACE_FILE_METADATA_PATH } from "../../shared/file-metadata"

describe.skipIf(
  !process.env.EIDOS_LITE_READONLY_FIXTURE_ROOT ||
    !process.env.EIDOS_LITE_READONLY_EVIDENCE
)("protected built Runtime worker", () => {
  it("opens, filters, ranks and refreshes an existing catalog without source writes", async () => {
    const root = await fs.realpath(
      process.env.EIDOS_LITE_READONLY_FIXTURE_ROOT!
    )
    const evidence = process.env.EIDOS_LITE_READONLY_EVIDENCE!
    transport.bootstrap = path.join(evidence, "readonly-worker-bootstrap.mjs")
    const worker = path.resolve(
      process.cwd(),
      "dist-electron/runtime-worker.js"
    )
    await fs.writeFile(
      transport.bootstrap,
      `Object.defineProperty(process,"parentPort",{value:{on:(_event,listener)=>process.on("message",value=>listener({data:value})),postMessage:value=>process.send(value)}});await import(${JSON.stringify(worker)});`
    )
    const source = path.join(root, SPACE_FILE_METADATA_PATH)
    const bytes = await fs.readFile(source),
      before = await fs.stat(source)
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const inspect = vi.spyOn(graft, "inspectSpace")
    const session = await SpaceSession.create(
      root,
      path.join(evidence, "readonly-worker-profile"),
      { graft, workerPath: worker, readOnly: true }
    )
    try {
      expect((await session.snapshot()).readOnly).toBe(true)
      const opened = await session.openFileMetadata(null)
      expect(opened.readOnly).toBe(true)
      expect(
        transport.requests.find((request) => request.type === "open")
      ).toMatchObject({ readOnly: true })
      const table = opened.snapshot.tables[0]!
      expect(table.fields.every((field) => field.writable === false)).toBe(true)
      const id = table.fields.find((field) => field.systemRole === "row-id")!
      for (const role of ["created-time", "updated-time"] as const) {
        const field = table.fields.find((field) => field.systemRole === role)!
        const query = {
          sorts: [
            { field: field.id, direction: "desc" as const },
            { field: id.id, direction: "asc" as const },
          ],
        }
        const page = await session.callRuntime(opened.sessionId, "getPage", [
          table.table.id,
          0,
          20,
          query,
        ])
        expect(page.rows).toHaveLength(6)
        const ids = page.rows.map((row) => String(row._id))
        for (const [index, rowId] of ids.entries()) {
          expect(
            await session.callRuntime(opened.sessionId, "getRowIndex", [
              table.table.id,
              rowId,
              query,
            ])
          ).toBe(index)
          expect(
            await session.callRuntime(opened.sessionId, "getRecordNeighbors", [
              table.table.id,
              rowId,
              query,
            ])
          ).toEqual({
            found: true,
            previousId: ids[index - 1] ?? null,
            nextId: ids[index + 1] ?? null,
          })
        }
        const filtered = await session.callRuntime(
          opened.sessionId,
          "getPage",
          [
            table.table.id,
            0,
            20,
            {
              ...query,
              filter: {
                type: "group",
                conjunction: "and",
                children: [
                  {
                    type: "rule",
                    field: field.id,
                    operator: "greater-than",
                    value: "2023-11-15T06:13:20.124+08:00",
                  },
                ],
              },
            },
          ]
        )
        expect(filtered.rows.map((row) => row._id)).toEqual([
          "记录-5.md",
          "记录-4.md",
        ])
      }
      await expect(
        session.callRuntime(opened.sessionId, "insertRow", [table.table.id, {}])
      ).rejects.toThrow(/read-only/)
      await expect(
        session.saveSpaceIgnoreRules({ graftignore: "x", gitignore: "" })
      ).rejects.toThrow(/read-only/)
      await session.refreshExplorer()
      await session.openFileMetadata(null)
      expect(inspect).not.toHaveBeenCalled()
      expect(await fs.readFile(source)).toEqual(bytes)
      const after = await fs.stat(source)
      expect([after.size, after.mtimeMs, after.ctimeMs]).toEqual([
        before.size,
        before.mtimeMs,
        before.ctimeMs,
      ])
      expect(await fs.readdir(path.dirname(source))).toEqual(["files.eidos"])
      await fs.writeFile(
        path.join(evidence, "readonly-worker-proof.json"),
        JSON.stringify(
          {
            root,
            worker,
            readOnly: opened.readOnly,
            sourceBytes: bytes.length,
            unchanged: true,
            sourceSidecars: false,
            repositoryOpened: inspect.mock.calls.length,
            workerOpen: transport.requests.filter(
              (request) => request.type === "open"
            ),
          },
          null,
          2
        )
      )
    } finally {
      await session.close()
    }
  })
})
