import assert from "node:assert/strict"
import { mkdtemp, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"

import { createEidosFile } from "../../../packages/eidos-file/dist/better-sqlite3.mjs"

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const root = await mkdtemp(path.join(tmpdir(), "eidos-file-query-worker-"))
const eidosFilePath = path.join(root, "tasks.eidos")
const replacementPath = path.join(root, "replacement.eidos")
const worker = new Worker(
  path.join(desktopRoot, "dist-electron", "eidos-file-query-worker.js")
)
const pending = new Map()
let sequence = 0

worker.on("message", (response) => {
  const operation = pending.get(response.id)
  if (!operation) return
  pending.delete(response.id)
  if (response.ok) operation.resolve(response)
  else {
    const error = new Error(response.message)
    error.name = response.name
    operation.reject(error)
  }
})
worker.once("error", (error) => {
  for (const operation of pending.values()) operation.reject(error)
  pending.clear()
})

function request(message) {
  const id = `smoke-${++sequence}`
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    worker.postMessage({ ...message, id })
  })
}

function createTasks(filePath, count, titlePrefix) {
  const base = createEidosFile(filePath, {
    title: "Query worker smoke",
    defaultTable: {
      id: "tasks",
      name: "Tasks",
      fields: [
        {
          name: "Status",
          columnName: "status",
          type: "select",
          property: {
            options: [{ value: "todo" }, { value: "done" }],
          },
        },
        {
          name: "Points",
          columnName: "points",
          type: "number",
        },
      ],
    },
  })
  base.connection.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      base.insertRow("tasks", {
        title: `${titlePrefix} ${index + 1}`,
        status: index % 2 === 0 ? "todo" : "done",
        points: index + 1,
      })
    }
  })
  base.close()
}

try {
  createTasks(eidosFilePath, 2_000, "Task")
  const firstPage = await request({
    operation: "page",
    filePath: eidosFilePath,
    tableId: "tasks",
    options: { offset: 1_000, limit: 25 },
  })
  assert.equal(firstPage.page.total, 2_000)
  assert.equal(firstPage.page.rows.length, 25)
  assert.equal(firstPage.page.rows[0].title, "Task 1001")

  const counts = await request({
    operation: "group-counts",
    filePath: eidosFilePath,
    tableId: "tasks",
    columnName: "status",
    query: {},
  })
  assert.deepEqual(
    counts.counts.sort((left, right) =>
      String(left.value).localeCompare(right.value)
    ),
    [
      { value: "done", total: 1_000 },
      { value: "todo", total: 1_000 },
    ]
  )

  const stats = await request({
    operation: "column-stats",
    filePath: eidosFilePath,
    tableId: "tasks",
    configs: [
      { columnName: "points", type: "sum" },
      { columnName: "points", type: "average" },
    ],
    query: {
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "status",
            operator: "equals",
            value: "todo",
          },
        ],
      },
    },
  })
  assert.deepEqual(stats.stats, [
    { columnName: "points", type: "sum", value: 1_000_000 },
    { columnName: "points", type: "average", value: 1_000 },
  ])

  createTasks(replacementPath, 1, "Replacement")
  await rename(replacementPath, eidosFilePath)
  const replacedPage = await request({
    operation: "page",
    filePath: eidosFilePath,
    tableId: "tasks",
    options: { offset: 0, limit: 25 },
  })
  assert.equal(replacedPage.page.total, 1)
  assert.equal(replacedPage.page.rows[0].title, "Replacement 1")

  console.log(
    JSON.stringify({
      pageTotal: firstPage.page.total,
      groupedTotal: counts.counts.reduce(
        (total, group) => total + group.total,
        0
      ),
      filteredSum: stats.stats[0].value,
      replacementInvalidation: replacedPage.page.rows[0].title,
    })
  )
} finally {
  await worker.terminate()
  await rm(root, { recursive: true, force: true })
}
