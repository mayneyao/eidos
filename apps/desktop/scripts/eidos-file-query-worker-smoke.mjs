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
const TABLE_ID = "019f8ba0-0000-7000-8000-000000000001"
const TITLE_FIELD_ID = "019f8ba0-0000-7000-8000-000000000011"
const STATUS_FIELD_ID = "019f8ba0-0000-7000-8000-000000000012"
const POINTS_FIELD_ID = "019f8ba0-0000-7000-8000-000000000013"

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
      id: TABLE_ID,
      name: "Tasks",
      fields: [
        {
          id: TITLE_FIELD_ID,
          name: "Title",
          type: "text",
          isRecordLabel: true,
        },
        {
          id: STATUS_FIELD_ID,
          name: "Status",
          type: "select",
          property: {
            options: [
              { name: "To do", value: "todo" },
              { name: "Done", value: "done" },
            ],
          },
        },
        {
          id: POINTS_FIELD_ID,
          name: "Points",
          type: "number",
        },
      ],
    },
  })
  const fields = base.listFields(TABLE_ID)
  const title = fields.find((field) => field.id === TITLE_FIELD_ID)
  const status = fields.find((field) => field.id === STATUS_FIELD_ID)
  const points = fields.find((field) => field.id === POINTS_FIELD_ID)
  assert.ok(title && status && points)
  base.connection.transaction(() => {
    for (let index = 0; index < count; index += 1) {
      base.insertRow(TABLE_ID, {
        [title.tableColumnName]: `${titlePrefix} ${index + 1}`,
        [status.tableColumnName]: index % 2 === 0 ? "todo" : "done",
        [points.tableColumnName]: index + 1,
      })
    }
  })
  base.close()
  return {
    titleColumnName: title.tableColumnName,
  }
}

try {
  const schema = createTasks(eidosFilePath, 2_000, "Task")
  const firstPage = await request({
    operation: "page",
    filePath: eidosFilePath,
    tableId: TABLE_ID,
    options: { offset: 1_000, limit: 25 },
  })
  assert.equal(firstPage.page.total, 2_000)
  assert.equal(firstPage.page.rows.length, 25)
  assert.equal(firstPage.page.rows[0][schema.titleColumnName], "Task 1001")

  const counts = await request({
    operation: "group-counts",
    filePath: eidosFilePath,
    tableId: TABLE_ID,
    fieldId: STATUS_FIELD_ID,
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
    tableId: TABLE_ID,
    configs: [
      { fieldId: POINTS_FIELD_ID, type: "sum" },
      { fieldId: POINTS_FIELD_ID, type: "average" },
    ],
    query: {
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: STATUS_FIELD_ID,
            operator: "equals",
            value: "todo",
          },
        ],
      },
    },
  })
  assert.deepEqual(stats.stats, [
    { fieldId: POINTS_FIELD_ID, type: "sum", value: 1_000_000 },
    { fieldId: POINTS_FIELD_ID, type: "average", value: 1_000 },
  ])

  createTasks(replacementPath, 1, "Replacement")
  await rename(replacementPath, eidosFilePath)
  const replacedPage = await request({
    operation: "page",
    filePath: eidosFilePath,
    tableId: TABLE_ID,
    options: { offset: 0, limit: 25 },
  })
  assert.equal(replacedPage.page.total, 1)
  assert.equal(
    replacedPage.page.rows[0][schema.titleColumnName],
    "Replacement 1"
  )

  console.log(
    JSON.stringify({
      pageTotal: firstPage.page.total,
      groupedTotal: counts.counts.reduce(
        (total, group) => total + group.total,
        0
      ),
      filteredSum: stats.stats[0].value,
      replacementInvalidation:
        replacedPage.page.rows[0][schema.titleColumnName],
    })
  )
} finally {
  await worker.terminate()
  await rm(root, { recursive: true, force: true })
}
