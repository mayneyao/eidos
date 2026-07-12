import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"

import {
  createBaseFile,
  openBaseFile,
} from "../../../packages/base/dist/better-sqlite3.mjs"

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const root = await mkdtemp(path.join(tmpdir(), "eidos-csv-worker-"))

function runWorker(workerData) {
  const worker = new Worker(
    path.join(desktopRoot, "dist-electron", "base-csv-worker.js"),
    { workerData }
  )
  return new Promise((resolve, reject) => {
    worker.once("message", resolve)
    worker.once("error", reject)
  })
}

try {
  const sourcePath = path.join(root, "inventory.csv")
  const targetPath = path.join(root, "inventory.base")
  await writeFile(
    sourcePath,
    "Item,Quantity,Available\nPortable stand,3,true\nDesk,1,false\n"
  )
  createBaseFile(targetPath, { title: "CSV Worker QA" }).close()
  const sourceStat = await stat(sourcePath)
  const fingerprint = {
    size: sourceStat.size,
    mtimeMs: sourceStat.mtimeMs,
  }
  const stale = await runWorker({
    operation: "plan",
    sourcePath,
    fileName: "inventory.csv",
    fingerprint: { ...fingerprint, mtimeMs: fingerprint.mtimeMs - 1 },
    options: {},
  })
  if (stale.ok || !stale.message.includes("changed")) {
    throw new Error("Base CSV worker accepted a stale file fingerprint")
  }

  const response = await runWorker({
    operation: "import",
    sourcePath,
    fileName: "inventory.csv",
    fingerprint,
    targetPath,
    options: {},
  })
  if (!response.ok) throw new Error(response.message)

  const base = openBaseFile(targetPath, { readonly: true })
  const table = base.listTables()[0]
  const rows = base.listRows(table.id)
  base.close()
  if (
    response.result.importedRowCount !== 2 ||
    rows.length !== 2 ||
    rows[0].quantity !== 3
  ) {
    throw new Error("Base CSV worker smoke verification failed")
  }
  console.log(
    JSON.stringify({
      imported: response.result.importedRowCount,
      fingerprint: "enforced",
      first: rows[0],
    })
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
