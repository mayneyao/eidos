// Run through scripts/run-electron-node.mjs under an OS write-denial sandbox.
// This opens only a read-only SQLite connection, never a SpaceSession.
import fs from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { createHash } from "node:crypto"
import { performance } from "node:perf_hooks"
import http from "node:http"
import {
  ConnectionPortEidosFileConnection,
  EidosFileRuntime,
} from "../../../packages/eidos-file/dist/index.mjs"
import { SpaceMetadataConnectionPort } from "../src/runtime/space-metadata-connection.ts"

const [file, extension, roundsArg = "5"] = process.argv.slice(2)
if (!file || !extension) throw new Error("Usage: <file> <extension> [rounds]")
const db = new DatabaseSync(file, { readOnly: true, allowExtension: true })
db.loadExtension(extension)
db.enableLoadExtension(false)
db.exec("PRAGMA temp_store=MEMORY")
const port = new SpaceMetadataConnectionPort(db, true)
// Mandatory adapter probes use a memory-only TEMP table; the readOnly
// adapter enables query_only itself immediately after those probes.
const traces = []
const original = port.query.bind(port)
port.query = (sql, bindings) => {
  const start = performance.now()
  const result = original(sql, bindings)
  traces.push({ sql, ms: performance.now() - start, rows: result.rows.length })
  return result
}
const runtime = new EidosFileRuntime(
  new ConnectionPortEidosFileConnection(port)
)
const table = runtime.listTables()[0]
const view = runtime.listViews(table.id).find((v) => v.name === "All Files")
const query = { sorts: view.sorts }
const total = runtime.countRows(table.id, query)
const positions = [
  ["top", 0],
  ["25%", Math.floor((total * 0.25) / 100) * 100],
  ["50%", Math.floor((total * 0.5) / 100) * 100],
  ["95%", Math.floor((total * 0.95) / 100) * 100],
  ["last", Math.floor((total - 1) / 100) * 100],
  ["reverse", 0],
]
if (roundsArg.startsWith("--serve=")) {
  const server = http.createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "http://localhost:5186")
    response.setHeader("Content-Type", "application/json")
    const url = new URL(request.url, "http://localhost")
    if (request.method !== "GET") {
      response.writeHead(405).end()
      return
    }
    if (url.pathname === "/snapshot") {
      response.end(
        JSON.stringify({
          table,
          fields: runtime.listFields(table.id),
          views: runtime.listViews(table.id),
          rowCount: total,
        })
      )
    } else if (url.pathname === "/page") {
      traces.length = 0
      const started = performance.now()
      const page = runtime.getRowPage(
        table.id,
        Number(url.searchParams.get("offset")),
        Number(url.searchParams.get("limit")),
        query,
        total
      )
      response.end(
        JSON.stringify({
          ...page,
          measurement: { ms: performance.now() - started, traces },
        })
      )
    } else {
      response.writeHead(404).end()
    }
  })
  server.listen(Number(roundsArg.slice(8)), "127.0.0.1")
  await new Promise((resolve) => server.on("close", resolve))
  db.close()
  process.exit(0)
}
const results = []
for (let round = 0; round < Number(roundsArg); round++) {
  for (const [name, offset] of positions) {
    traces.length = 0
    const cpu = process.cpuUsage()
    const start = performance.now()
    const page = runtime.getRowPage(table.id, offset, 100, query, total)
    const end = performance.now()
    const encoded = JSON.stringify(page.rows)
    results.push({
      name,
      round,
      offset,
      rows: page.rows.length,
      ms: end - start,
      cpu: process.cpuUsage(cpu),
      rss: process.memoryUsage().rss,
      digest: createHash("sha256").update(encoded).digest("hex"),
      bytes: Buffer.byteLength(encoded),
      traces: [...traces],
    })
  }
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      sqlite: db.prepare("select sqlite_version() as version").get().version,
      total,
      query,
      extensionSha256: createHash("sha256")
        .update(fs.readFileSync(extension))
        .digest("hex"),
      results,
    },
    null,
    2
  )
)
db.close()
