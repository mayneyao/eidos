import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"

import {
  createEidosFile,
  openEidosFile,
} from "../../../packages/eidos-file/dist/better-sqlite3.mjs"

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const root = await mkdtemp(path.join(tmpdir(), "eidos-csv-worker-"))

function runWorker(workerData) {
  const worker = new Worker(
    path.join(desktopRoot, "dist-electron", "eidos-file-csv-worker.js"),
    { workerData }
  )
  return new Promise((resolve, reject) => {
    const progress = []
    worker.on("message", (message) => {
      if (message.type === "progress") {
        progress.push(message.progress)
        return
      }
      resolve({ response: message, progress })
    })
    worker.once("error", reject)
  })
}

function cancelWorkerDuringImport(workerData) {
  const worker = new Worker(
    path.join(desktopRoot, "dist-electron", "eidos-file-csv-worker.js"),
    { workerData }
  )
  return new Promise((resolve, reject) => {
    let cancelRequested = false
    worker.on("message", (message) => {
      if (
        !cancelRequested &&
        message.type === "progress" &&
        message.progress.phase === "importing"
      ) {
        cancelRequested = true
        void worker.terminate()
      } else if (!message.type) {
        reject(new Error("Cancelable CSV worker finished before cancellation"))
      }
    })
    worker.once("error", reject)
    worker.once("exit", () => {
      if (!cancelRequested) {
        reject(new Error("Cancelable CSV worker exited before import started"))
        return
      }
      resolve()
    })
  })
}

try {
  const sourcePath = path.join(root, "inventory.csv")
  const targetPath = path.join(root, "inventory.eidos")
  await writeFile(
    sourcePath,
    "Item,Quantity,Available\nPortable stand,3,true\nDesk,1,false\n"
  )
  createEidosFile(targetPath, { title: "CSV Worker QA" }).close()
  const sourceStat = await stat(sourcePath)
  const fingerprint = {
    size: sourceStat.size,
    mtimeMs: sourceStat.mtimeMs,
  }
  const { response: stale } = await runWorker({
    operation: "plan",
    sourcePath,
    fileName: "inventory.csv",
    fingerprint: { ...fingerprint, mtimeMs: fingerprint.mtimeMs - 1 },
    options: {},
  })
  if (stale.ok || !stale.message.includes("changed")) {
    throw new Error("Eidos File CSV worker accepted a stale file fingerprint")
  }

  const { response, progress } = await runWorker({
    operation: "import",
    sourcePath,
    fileName: "inventory.csv",
    fingerprint,
    targetPath,
    options: {},
  })
  if (!response.ok) throw new Error(response.message)

  const base = openEidosFile(targetPath, { readonly: true })
  const table = base.listTables()[0]
  const rows = base.listRows(table.id)
  base.close()
  if (
    response.result.importedRowCount !== 2 ||
    rows.length !== 2 ||
    rows[0].quantity !== 3 ||
    !progress.some((entry) => entry.phase === "analyzing") ||
    !progress.some((entry) => entry.phase === "importing") ||
    !progress.some((entry) => entry.phase === "finalizing")
  ) {
    throw new Error("Eidos File CSV worker smoke verification failed")
  }

  const canceledSourcePath = path.join(root, "cancel.csv")
  const canceledTargetPath = path.join(root, "cancel.eidos")
  const canceledRows = Array.from(
    { length: 100_000 },
    (_, index) => `Task ${index + 1},${index + 1}`
  )
  await writeFile(
    canceledSourcePath,
    `Task,Priority\n${canceledRows.join("\n")}\n`
  )
  createEidosFile(canceledTargetPath, { title: "CSV Cancel QA" }).close()
  const canceledStat = await stat(canceledSourcePath)
  await cancelWorkerDuringImport({
    operation: "import",
    sourcePath: canceledSourcePath,
    fileName: "cancel.csv",
    fingerprint: {
      size: canceledStat.size,
      mtimeMs: canceledStat.mtimeMs,
    },
    targetPath: canceledTargetPath,
    options: {},
  })
  const canceledBase = openEidosFile(canceledTargetPath, { readonly: true })
  const canceledTables = canceledBase.listTables()
  canceledBase.close()
  if (canceledTables.length !== 0) {
    throw new Error("Canceled CSV import left a partial table behind")
  }
  console.log(
    JSON.stringify({
      imported: response.result.importedRowCount,
      fingerprint: "enforced",
      progress: [...new Set(progress.map((entry) => entry.phase))],
      cancellation: "rolled-back",
      first: rows[0],
    })
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
