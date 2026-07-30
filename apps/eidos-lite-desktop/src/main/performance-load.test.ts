import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"

import {
  createEidosFile,
  openEidosFile,
} from "@eidos.space/eidos-file/node-sqlite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { flattenSpaceTree, listSpaceTree } from "./space/space-paths"
import { SpaceWatcher } from "./space/space-watcher"
import { createEidosLiteFileRuntime } from "../runtime/eidos-file-runtime"

const performanceEnabled = process.env.EIDOS_LITE_RUN_PERFORMANCE === "1"
const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)
const fixturePath = path.resolve(
  appRoot,
  "../eidos-file-web/fixtures/project-tracker.eidos"
)

describe.runIf(performanceEnabled)("Eidos Lite PRD performance load", () => {
  let root: string
  let explorerRoot: string
  let watcherRoot: string
  let tenMegabyteFile: string
  let hundredMegabyteFile: string
  let denseFile: string
  let densePreparationMs: number

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-performance-"))
    explorerRoot = path.join(root, "explorer-1000")
    watcherRoot = path.join(root, "watcher-10000")
    tenMegabyteFile = path.join(root, "ten-megabytes.eidos")
    hundredMegabyteFile = path.join(root, "hundred-megabytes.eidos")
    denseFile = path.join(root, "dense-100000.eidos")
    await Promise.all([
      fs.mkdir(explorerRoot),
      fs.mkdir(watcherRoot),
      fs.copyFile(fixturePath, tenMegabyteFile),
      fs.copyFile(fixturePath, hundredMegabyteFile),
    ])
    await Promise.all([
      fs.truncate(tenMegabyteFile, 10 * 1024 * 1024),
      fs.truncate(hundredMegabyteFile, 100 * 1024 * 1024),
      ...Array.from({ length: 10 }, async (_, directoryIndex) => {
        const directory = path.join(
          explorerRoot,
          `folder-${String(directoryIndex).padStart(2, "0")}`
        )
        await fs.mkdir(directory)
        await Promise.all(
          Array.from({ length: 99 }, (_, fileIndex) =>
            fs.writeFile(
              path.join(
                directory,
                `file-${String(fileIndex).padStart(3, "0")}.txt`
              ),
              ""
            )
          )
        )
      }),
      ...Array.from({ length: 100 }, async (_, directoryIndex) => {
        const directory = path.join(
          watcherRoot,
          `folder-${String(directoryIndex).padStart(3, "0")}`
        )
        await fs.mkdir(directory)
        await Promise.all(
          Array.from({ length: 99 }, (_, fileIndex) =>
            fs.writeFile(
              path.join(
                directory,
                `file-${String(fileIndex).padStart(3, "0")}.txt`
              ),
              ""
            )
          )
        )
      }),
    ])
    const denseStartedAt = performance.now()
    const denseRuntime = createEidosFile(denseFile, { title: "Dense Grid" })
    try {
      denseRuntime.importTable(
        {
          name: "Records",
          fields: [
            { name: "Name", type: "text", isRecordLabel: true },
            { name: "Score", type: "number" },
          ],
        },
        Array.from({ length: 100_000 }, (_, index) => ({
          Name: `Record ${String(index + 1).padStart(6, "0")}`,
          Score: index + 1,
        }))
      )
    } finally {
      denseRuntime.close()
    }
    densePreparationMs = performance.now() - denseStartedAt
  }, 60_000)

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("lists a 1,000-entry Space within the Explorer P95 budget", async () => {
    const startedAt = performance.now()
    const entries = flattenSpaceTree(await listSpaceTree(explorerRoot))
    const durationMs = performance.now() - startedAt

    console.info(
      JSON.stringify({ benchmark: "explorer-1000", durationMs, entries: 1000 })
    )
    expect(entries).toHaveLength(1_000)
    expect(durationMs).toBeLessThanOrEqual(2_000)
  })

  it("observes a stable change in a 10,000-entry watched Space", async () => {
    let resolveChange: (() => void) | undefined
    const changed = new Promise<void>((resolve) => {
      resolveChange = resolve
    })
    const startedAt = performance.now()
    const watcher = new SpaceWatcher(watcherRoot, () => resolveChange?.(), 25)
    watcher.start()
    const startupMs = performance.now() - startedAt
    const changeStartedAt = performance.now()
    await fs.writeFile(
      path.join(watcherRoot, "folder-000", "file-000.txt"),
      "x"
    )
    await Promise.race([
      changed,
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error("Watcher change timed out")), 2_000)
      ),
    ])
    const changeMs = performance.now() - changeStartedAt
    watcher.close()

    console.info(
      JSON.stringify({
        benchmark: "watcher-10000",
        startupMs,
        changeMs,
        entries: 10_000,
      })
    )
    expect(startupMs).toBeLessThanOrEqual(2_000)
    expect(changeMs).toBeLessThanOrEqual(2_000)
  })

  it("opens 10/100 MiB files within the native Runtime P95 budgets", async () => {
    const cases: Array<{
      benchmark: string
      filePath: string
      expectedBytes: number
      budgetMs: number
    }> = [
      {
        benchmark: "eidos-open-10-mib",
        filePath: tenMegabyteFile,
        expectedBytes: 10 * 1024 * 1024,
        budgetMs: 1_500,
      },
      {
        benchmark: "eidos-open-100-mib",
        filePath: hundredMegabyteFile,
        expectedBytes: 100 * 1024 * 1024,
        budgetMs: 4_000,
      },
    ]

    for (const { benchmark, filePath, expectedBytes, budgetMs } of cases) {
      expect((await fs.stat(filePath)).size).toBe(expectedBytes)
      const startedAt = performance.now()
      const runtime = openEidosFile(filePath)
      try {
        expect(runtime.inspect().valid).toBe(true)
        expect(runtime.listTables().length).toBeGreaterThan(0)
      } finally {
        runtime.close()
      }
      const durationMs = performance.now() - startedAt

      console.info(
        JSON.stringify({
          benchmark,
          durationMs,
          bytes: expectedBytes,
          fixture: "valid SQLite with padded file extent",
        })
      )
      expect(durationMs).toBeLessThanOrEqual(budgetMs)
    }
  })

  it("loads the first 100,000-row Grid page and commits cells within budget", async () => {
    const runtime = openEidosFile(denseFile)
    try {
      const table = runtime.listTables()[0]!
      const name = runtime
        .listFields(table.id)
        .find((field) => field.name === "Name")!
      const pageStartedAt = performance.now()
      const page = runtime.getRowPage(table.id, 0, 100, {})
      const firstPageMs = performance.now() - pageStartedAt
      const commitDurationsMs: number[] = []
      for (let index = 0; index < 5; index += 1) {
        const rowId = page.rows[index]!._id
        if (typeof rowId !== "string") {
          throw new Error("Dense Grid row is missing its canonical _id")
        }
        const commitStartedAt = performance.now()
        runtime.updateRow(table.id, rowId, {
          [name.id]: `Updated ${index + 1}`,
        })
        commitDurationsMs.push(performance.now() - commitStartedAt)
      }
      const sortedCommits = [...commitDurationsMs].sort(
        (left, right) => left - right
      )
      const commitP50Ms = sortedCommits[2]!
      const commitP95Ms = sortedCommits[4]!

      console.info(
        JSON.stringify({
          benchmark: "dense-grid-100000",
          preparationMs: densePreparationMs,
          fileBytes: (await fs.stat(denseFile)).size,
          firstPageMs,
          rows: page.total,
          commitP50Ms,
          commitP95Ms,
        })
      )
      expect(page.total).toBe(100_000)
      expect(page.rows).toHaveLength(100)
      expect(firstPageMs).toBeLessThanOrEqual(2_000)
      expect(commitP50Ms).toBeLessThanOrEqual(50)
      expect(commitP95Ms).toBeLessThanOrEqual(150)
    } finally {
      runtime.close()
    }
  })

  it("bulk imports 10,000 and 100,000 CSV rows within budget", async () => {
    const cases = [
      { rows: 10_000, budgetMs: 5_000 },
      { rows: 100_000, budgetMs: 30_000 },
    ] as const

    for (const { rows, budgetMs } of cases) {
      const filePath = path.join(root, `csv-${rows}.eidos`)
      const opened = await createEidosLiteFileRuntime(filePath, `CSV ${rows}`)
      try {
        const lines = ["name,category,score,enabled,note"]
        for (let index = 0; index < rows; index += 1) {
          lines.push(
            `Record ${index},Category ${index % 20},${index * 1.25},${index % 2 === 0},Note ${index}`
          )
        }
        const encoded = new TextEncoder().encode(lines.join("\n"))
        const csv = encoded.buffer.slice(
          encoded.byteOffset,
          encoded.byteOffset + encoded.byteLength
        ) as ArrayBuffer
        const startedAt = performance.now()
        const imported = await opened.source.importCsv(`csv-${rows}.csv`, csv)
        const durationMs = performance.now() - startedAt

        console.info(
          JSON.stringify({
            benchmark: `csv-import-${rows}`,
            durationMs,
            rows: imported.result.importedRowCount,
            csvBytes: encoded.byteLength,
            fileBytes: (await fs.stat(filePath)).size,
          })
        )
        expect(imported.result.importedRowCount).toBe(rows)
        expect(durationMs).toBeLessThanOrEqual(budgetMs)
      } finally {
        await opened.close()
      }
    }
  }, 45_000)
})
