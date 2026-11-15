import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import type { RuntimeWorkerRequest } from "../../shared/contracts"
import type { ExplorerCalendarExecution } from "../../shared/explorer-calendar"
import type { ExplorerFilterGroup } from "../../shared/explorer-file-filter"

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
import { createEidosLiteFileRuntime } from "../../runtime/eidos-file-runtime"
import { SPACE_FILE_METADATA_PATH } from "../../shared/file-metadata"
import { flattenSpaceTree } from "./space-paths"

const worker = path.resolve(process.cwd(), "dist-electron/runtime-worker.js")
describe.skipIf(
  process.env.EIDOS_LITE_RUN_CALENDAR_BRIDGE !== "1" || !existsSync(worker)
)("built Explorer Runtime bridge", () => {
  it("runs local periods through SpaceSession and the actual worker without creating a catalog or persisting the query", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-explorer-calendar-")
    )
    const userData = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-explorer-calendar-state-")
    )
    const graft = new GraftClient({
      sdkTransport: new GraftInProcessTransport(),
    })
    const requireSparkFeature = vi.fn(async () => {
      throw new Error("Unexpected Spark activation")
    })
    let session: SpaceSession | undefined
    let seed: Awaited<ReturnType<typeof createEidosLiteFileRuntime>> | undefined
    try {
      transport.requests.length = 0
      transport.bootstrap = path.join(userData, "worker.mjs")
      await fs.writeFile(
        transport.bootstrap,
        `Object.defineProperty(process,"parentPort",{value:{on:(_event,listener)=>process.on("message",value=>listener({data:value})),postMessage:value=>process.send(value)}});await import(${JSON.stringify(worker)});`
      )
      session = await SpaceSession.create(root, userData, {
        graft,
        requireSparkFeature,
        workerPath: worker,
      })
      expect(
        await session.getExplorerFilterFields({ calendarQueryVersion: 2 })
      ).toEqual({ fields: [], queryCapabilities: undefined })
      await expect(
        fs.stat(path.join(root, SPACE_FILE_METADATA_PATH))
      ).rejects.toMatchObject({ code: "ENOENT" })
      await fs.mkdir(path.join(root, ".eidos"), { recursive: true })
      const names = [
        ...Array.from(
          { length: 605 },
          (_, i) => `p${String(i).padStart(4, "0")}.md`
        ),
        "last.md",
        "before.md",
        "boundary.md",
        "monday.md",
      ]
      await Promise.all(
        names.map((name) => fs.writeFile(path.join(root, name), "fixture"))
      )
      const file = path.join(root, SPACE_FILE_METADATA_PATH)
      seed = await createEidosLiteFileRuntime(file, "Calendar fixture", {
        template: "files-index",
      })
      const tableId = seed.initialSnapshot.tables[0]!.table.id
      await seed.source.addField(tableId, { name: "Day", type: "date" })
      await seed.source.addField(tableId, { name: "Instant", type: "datetime" })
      let snap = await seed.source.addField(tableId, {
        name: "Status",
        type: "text",
      })
      const field = (name: string) =>
        snap.tables[0]!.fields.find((field) => field.name === name)!.id
      const day = field("Day"),
        instant = field("Instant"),
        status = field("Status")
      let revision = String(snap.metadata.revision)
      for (let offset = 0; offset < names.length; offset += 100) {
        const result = await seed.source.runtime.mutateRows!(
          {
            tableId,
            expectedRevision: revision,
            changes: names.slice(offset, offset + 100).map((rowId) => ({
              kind: "update",
              rowId,
              values: {
                [day]: rowId === "monday.md" ? "2026-03-02" : "2026-03-08",
                [instant]:
                  rowId === "last.md"
                    ? "2026-03-09T03:59:59.999Z"
                    : rowId === "before.md"
                      ? "2026-03-08T04:59:59.999Z"
                      : rowId === "boundary.md"
                        ? "2026-03-09T04:00:00.000Z"
                        : "2026-03-08T07:30:00.123Z",
                [status]: "Ready",
              },
            })),
          },
          { requestId: `seed-${offset}` }
        )
        revision = result.revision
      }
      await seed.close()
      seed = undefined
      const before = createHash("sha256")
        .update(await fs.readFile(file))
        .digest("hex")
      const fields = await session.getExplorerFilterFields({
        calendarQueryVersion: 2,
      })
      expect(fields.queryCapabilities).toMatchObject({
        calendarQueryVersion: 2,
        calendarPeriodTimeZoneData: ["2026f"],
      })
      const execution: ExplorerCalendarExecution = {
        calendarQueryVersion: 2,
        calendar: {
          timeZone: "America/New_York",
          timeZoneData: "2026f",
          weekStartsOn: 1,
        },
        referenceInstant: "2026-03-08T12:00:00.000Z",
      }
      const filter: ExplorerFilterGroup = {
        type: "group",
        id: "root",
        conjunction: "and",
        children: [
          {
            type: "rule",
            id: "status",
            field: "property",
            operator: "matches",
            value: {
              type: "rule",
              field: status,
              operator: "equals",
              value: "Ready",
            },
          },
          {
            type: "group",
            id: "nested",
            conjunction: "or",
            children: [
              {
                type: "rule",
                id: "date",
                field: "property",
                operator: "matches",
                value: {
                  type: "rule",
                  field: instant,
                  operator: "is-in-calendar-period",
                  value: { unit: "day", offset: 0 },
                },
              },
            ],
          },
        ],
      }
      const leaves = (
        entries: Awaited<ReturnType<SpaceSession["filterFiles"]>>
      ) =>
        flattenSpaceTree(entries)
          .filter((entry) => entry.kind === "file")
          .map((entry) => entry.relativePath)
      const ny = leaves(
        await session.filterFiles(filter, null, false, execution)
      )
      expect(ny).toHaveLength(607)
      expect(ny).toContain("last.md")
      expect(ny).not.toContain("before.md")
      expect(ny).not.toContain("boundary.md")
      const requests = transport.requests.filter(
        (request) => request.type === "call" && request.method === "getPage"
      )
      expect(
        requests.map((request) =>
          request.type === "call" ? request.args[1] : undefined
        )
      ).toEqual([0, 500, 0, 500])
      for (const request of requests) {
        if (request.type !== "call") continue
        expect(request.calendarQueryVersion).toBe(2)
        expect(request.args[3]).toMatchObject({
          calendar: execution.calendar,
          referenceInstant: execution.referenceInstant,
        })
      }
      const sh = leaves(
        await session.filterFiles(filter, null, false, {
          ...execution,
          calendar: { ...execution.calendar, timeZone: "Asia/Shanghai" },
        })
      )
      expect(sh).toContain("before.md")
      expect(sh).not.toContain("last.md")
      const dateFilter: ExplorerFilterGroup = {
        ...filter,
        children: [
          {
            type: "rule",
            id: "day",
            field: "property",
            operator: "matches",
            value: {
              type: "rule",
              field: day,
              operator: "is-in-calendar-period",
              value: { unit: "day", offset: 0 },
            },
          },
        ],
      }
      const treeDates = leaves(
        await session.filterFiles(dateFilter, null, false, execution)
      )
      const galleryDates = await session.listExplorerFiles({
        directory: null,
        filter: dateFilter,
        sort: { by: "name", direction: "ascending" },
        sinceMs: 0,
        period: "recent",
        offset: 0,
        calendarExecution: execution,
      })
      expect(
        galleryDates.entries.map((entry) => entry.relativePath).sort()
      ).toEqual([...treeDates].sort())
      expect(
        leaves(await session.filterFiles(dateFilter, null, false, execution))
      ).toEqual(
        leaves(
          await session.filterFiles(dateFilter, null, false, {
            ...execution,
            calendar: { ...execution.calendar, timeZone: "Asia/Shanghai" },
          })
        )
      )
      const week: ExplorerFilterGroup = {
        ...dateFilter,
        children: [
          {
            type: "rule",
            id: "week",
            field: "property",
            operator: "matches",
            value: {
              type: "rule",
              field: day,
              operator: "is-in-calendar-period",
              value: { unit: "week", offset: 0 },
            },
          },
        ],
      }
      expect(
        leaves(await session.filterFiles(week, null, false, execution))
      ).toContain("monday.md")
      expect(
        leaves(
          await session.filterFiles(week, null, false, {
            ...execution,
            calendar: { ...execution.calendar, weekStartsOn: 0 },
          })
        )
      ).not.toContain("monday.md")
      const query = {
        directory: null,
        filter: dateFilter,
        sort: { by: "name" as const, direction: "ascending" as const },
        sinceMs: Date.now() + 86_400_000,
        period: "recent" as const,
        offset: 0,
        calendarExecution: {
          calendarQueryVersion: 2 as const,
          calendar: execution.calendar,
        },
      }
      const recent = await session.listExplorerFiles(query)
      expect(recent.referenceInstant).toMatch(/^\d{4}-/)
      const earlier = await session.listExplorerFiles({
        ...query,
        period: "earlier",
        calendarExecution: {
          ...query.calendarExecution,
          referenceInstant: recent.referenceInstant,
        },
      })
      expect(earlier.referenceInstant).toBe(recent.referenceInstant)
      const legacy: ExplorerFilterGroup = {
        ...dateFilter,
        children: [
          {
            type: "rule",
            id: "old",
            field: "property",
            operator: "matches",
            value: {
              type: "rule",
              field: instant,
              operator: "is-relative-to-today",
              value: { unit: "week", direction: "past" },
            },
          },
        ],
      }
      await expect(
        session.filterFiles(legacy, null, false, execution)
      ).rejects.toThrow(/Reset this date filter/)
      expect(JSON.stringify(filter)).not.toMatch(
        /timeZone|weekStartsOn|referenceInstant/
      )
      expect(requireSparkFeature).not.toHaveBeenCalled()
      const windowFields = await session.getExplorerFilterFields({
        calendarQueryVersion: 2,
        calendarWindowVersion: 1,
      })
      expect(windowFields.queryCapabilities?.calendarWindowVersion).toBe(1)
      for (const field of [day, instant])
        for (const direction of ["past", "next"] as const) {
          const window: ExplorerFilterGroup = {
            type: "group",
            id: "window",
            conjunction: "and",
            children: [
              {
                type: "rule",
                id: "window-date",
                field: "property",
                operator: "matches",
                value: {
                  type: "rule",
                  field,
                  operator: "is-in-calendar-window",
                  value: { direction, count: 1, unit: "day" },
                },
              },
            ],
          }
          const executionWithWindow = {
            ...execution,
            calendarWindowVersion: 1 as const,
          }
          const matches = leaves(
            await session.filterFiles(window, null, false, executionWithWindow)
          )
          if (field === day) expect(matches).toHaveLength(names.length - 1)
          else {
            expect(matches).toContain(
              direction === "past" ? "before.md" : "boundary.md"
            )
            expect(matches).not.toContain(
              direction === "past" ? "boundary.md" : "before.md"
            )
          }
          const page = await session.listExplorerFiles({
            directory: null,
            filter: window,
            sort: { by: "name", direction: "ascending" },
            sinceMs: 0,
            period: "recent",
            offset: 0,
            calendarExecution: executionWithWindow,
          })
          expect(page.entries.map((entry) => entry.relativePath)).toEqual(
            [...matches].sort().slice(0, page.entries.length)
          )
        }
      expect(
        transport.requests.some(
          (request) =>
            request.type === "call" && request.calendarWindowVersion === 1
        )
      ).toBe(true)
      await session.close()
      session = undefined
      expect(
        createHash("sha256")
          .update(await fs.readFile(file))
          .digest("hex")
      ).toBe(before)
    } finally {
      await seed?.close()
      await session?.close()
      await graft.close()
      await fs.rm(root, { recursive: true, force: true })
      await fs.rm(userData, { recursive: true, force: true })
    }
  }, 90_000)
})
