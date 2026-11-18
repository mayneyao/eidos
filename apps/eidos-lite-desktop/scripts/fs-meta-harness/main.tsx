import React from "react"
import { createRoot } from "react-dom/client"
import type {
  EidosFileRowPage,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import { EidosFileGrid } from "../../../../packages/eidos-file-ui/src/eidos-file-grid"
import { EidosFileUIProvider } from "../../../../packages/eidos-file-ui/src/context"
import "@glideapps/glide-data-grid/dist/index.css"

const api = new URLSearchParams(location.search).get("api") || "5187"
const table: EidosFileTableSnapshot = await fetch(
  `http://127.0.0.1:${api}/snapshot`
).then((r) => r.json())
const events: {
  offset: number
  start: number
  end: number
  backend: number
  rows: number
}[] = []
Object.assign(window, { measurements: events, total: table.rowCount })
let pendingLoads = 0
Object.defineProperty(window, "pendingLoads", {
  configurable: true,
  get: () => pendingLoads,
})
createRoot(document.getElementById("root")!).render(
  <EidosFileUIProvider>
    <div style={{ height: "90vh", width: "100vw" }}>
      <EidosFileGrid
        table={table}
        view={table.views.find((v: { name: string }) => v.name === "All Files")}
        disabled
        onCellEdit={async () => {
          throw new Error("Read-only fixture")
        }}
        loadPage={async (offset, limit) => {
          pendingLoads++
          try {
            const start = performance.now()
            const page: EidosFileRowPage & { measurement: { ms: number } } =
              await fetch(
                `http://127.0.0.1:${api}/page?offset=${offset}&limit=${limit}`
              ).then((r) => r.json())
            events.push({
              offset,
              start,
              end: performance.now(),
              backend: page.measurement.ms,
              rows: page.rows.length,
            })
            return page
          } finally {
            pendingLoads--
          }
        }}
      />
    </div>
  </EidosFileUIProvider>
)
