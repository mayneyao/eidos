import { randomUUID } from "node:crypto"
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"

import { AdapterTransportRuntimeClient } from "@eidos.space/eidos-file"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(scriptDirectory, "../../..")
const workerPath = path.join(
  repositoryRoot,
  "apps/desktop/dist-electron/eidos-file-runtime-worker.js"
)
const fixturePath = path.join(
  repositoryRoot,
  "apps/eidos-file-web/fixtures/project-tracker.eidos"
)
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "eidos-runtime-worker-smoke-")
)

try {
  const workingPath = path.join(temporaryDirectory, "working.eidos")
  await copyFile(fixturePath, workingPath)
  const opened = await openWorkerRuntime(workingPath, "readwrite")
  try {
    const negotiated = await opened.runtime.negotiate(
      { protocol: "eidos-runtime", versions: ["1.0"] },
      context("negotiate")
    )
    assert(negotiated.version === "1.0", "Runtime 1.0 negotiation failed")
    const snapshot = await opened.runtime.getSnapshot({}, context("snapshot"))
    const schema = await readSchema(opened.runtime, snapshot.revision)
    const projects = schema.find(
      (object) => object.object === "table" && object.name === "Projects"
    )
    assert(projects, "Projects table is unavailable")
    const relation = schema.find(
      (object) =>
        object.object === "field" &&
        object.tableId === projects.id &&
        object.kind === "relation" &&
        object.name === "Team"
    )
    assert(relation, "Projects.Team Relation field is unavailable")
    const page = await opened.runtime.queryRows(
      {
        tableId: projects.id,
        query: {},
        projection: { fields: [relation.id], resolveRelations: [] },
        limit: 1,
      },
      context("query")
    )
    const row = page.rows[0]
    assert(row, "Project Tracker fixture has no project row")
    assert(
      Array.isArray(row.values[0]) && row.values[0].length > 0,
      "Project Tracker fixture Relation is empty"
    )
    const mutation = await opened.runtime.mutateRows(
      {
        tableId: projects.id,
        expectedRevision: snapshot.revision,
        changes: [
          { kind: "update", rowId: row.id, values: { [relation.id]: [] } },
        ],
      },
      context("clear-relation")
    )
    const changed = await opened.runtime.getRowsById(
      {
        tableId: projects.id,
        rowIds: [row.id],
        projection: { fields: [relation.id], resolveRelations: [] },
      },
      context("verify-relation")
    )
    assert(
      Array.isArray(changed.rows[0]?.values[0]) &&
        changed.rows[0]?.values[0].length === 0,
      "Clearing a Relation cell did not persist"
    )
    assert(
      BigInt(mutation.revision) > BigInt(snapshot.revision),
      "Relation mutation did not advance revision"
    )

    const candidate = await opened.exportCandidate()
    assert(candidate.byteLength > 0, "Publication candidate is empty")
    const publishedPath = path.join(temporaryDirectory, "published.eidos")
    await writeFile(publishedPath, candidate)
    const reopened = await openWorkerRuntime(publishedPath, "read")
    try {
      const validation = await reopened.runtime.validate(
        { level: "full", diagnosticsLimit: 100 },
        context("validate-publication")
      )
      assert(validation.valid, "Published Eidos File failed full validation")
      const persisted = await reopened.runtime.getRowsById(
        {
          tableId: projects.id,
          rowIds: [row.id],
          projection: { fields: [relation.id], resolveRelations: [] },
        },
        context("verify-publication")
      )
      assert(
        Array.isArray(persisted.rows[0]?.values[0]) &&
          persisted.rows[0]?.values[0].length === 0,
        "Published candidate lost the cleared Relation"
      )
    } finally {
      await reopened.close()
    }
  } finally {
    await opened.close()
  }
  process.stdout.write("Desktop Eidos File Runtime Worker smoke passed\n")
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}

async function readSchema(runtime, revision) {
  const objects = []
  let cursor
  do {
    const page = await runtime.getSchemaPage(
      { revision, limit: 1_000, ...(cursor ? { cursor } : {}) },
      context("schema")
    )
    objects.push(...page.objects)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return objects
}

async function openWorkerRuntime(workingPath, access) {
  const workingId = `smoke-${randomUUID()}`
  const listeners = new Set()
  const closeListeners = new Set()
  const controls = new Map()
  let readyResolve
  let readyReject
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })
  const worker = new Worker(workerPath, {
    workerData: {
      workingPath,
      workingId,
      access,
    },
  })
  worker.on("message", (message) => {
    if (message.type === "ready") readyResolve(message.snapshot)
    else if (message.type === "fatal") readyReject(workerError(message.error))
    else if (message.type === "transport") {
      for (const listener of listeners) listener(message.carrier)
    } else if (message.type === "control") {
      const pending = controls.get(message.id)
      if (!pending) return
      controls.delete(message.id)
      if (message.ok) pending.resolve(message.result)
      else pending.reject(workerError(message.error))
    }
  })
  worker.once("error", readyReject)
  worker.once("exit", (code) => {
    if (code !== 0) readyReject(new Error(`Runtime Worker exited with ${code}`))
    for (const listener of closeListeners) listener()
  })
  await ready
  const runtime = await new AdapterTransportRuntimeClient(
    {
      post(carrier, transfers = []) {
        worker.postMessage(
          { transport: carrier },
          transfers.filter((item) => item instanceof ArrayBuffer)
        )
      },
      subscribe(listener, onClose) {
        listeners.add(listener)
        if (onClose) closeListeners.add(onClose)
        return () => {
          listeners.delete(listener)
          if (onClose) closeListeners.delete(onClose)
        }
      },
      close() {},
    },
    {
      workingID: workingId,
      retainPreparedReceipt() {},
      settlePreparedReceipt() {},
    }
  ).connect()
  return {
    runtime,
    async exportCandidate() {
      const id = `export-${randomUUID()}`
      const result = await new Promise((resolve, reject) => {
        controls.set(id, { resolve, reject })
        worker.postMessage({
          control: { id, operation: "export", maxBytes: "268435456" },
        })
      })
      return result.bytes
    },
    async close() {
      await runtime.close(context("close")).catch(() => undefined)
      await worker.terminate()
    },
  }
}

function context(action) {
  return {
    requestId: `desktop-smoke-${action}-${randomUUID()}`,
    deadlineMilliseconds: 30_000,
  }
}

function assert(value, message) {
  if (!value) throw new Error(message)
}

function workerError(error) {
  return Object.assign(new Error(error.message), error)
}
