import { assertBenchmarkDirectory, benchmarkDirectory } from "./sync-benchmark"
import fs from "node:fs/promises"
import path from "node:path"
import { describe, it } from "vitest"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"

// Explicitly opt in and use an isolated copy, never the original Space.
const root = path.join(benchmarkDirectory, "local")
describe.skipIf(process.env.EIDOS_SYNC_PERF_BASELINE !== "1")(
  "isolated Space performance baseline",
  () => {
    it("records cold and warm repository reads without remote access", async () => {
      await assertBenchmarkDirectory()
      const graft = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
        syncRemoteOrigin: "https://sync-staging.eidos.space",
      })
      const samples: { operation: string; ms: number; details?: unknown }[] = []
      const measure = async <T>(operation: string, run: () => Promise<T>) => {
        const start = performance.now()
        const value = await run()
        const sample = {
          operation,
          ms: Math.round((performance.now() - start) * 100) / 100,
        }
        samples.push(sample)
        console.log(JSON.stringify(sample))
        return value
      }
      try {
        await measure("open", () => graft.open(root))
        for (let i = 0; i < 5; i++) {
          const status = await measure(`status.${i}`, () => graft.status(root))
          samples.at(-1)!.details = {
            dirty: status.dirty,
            changedPaths: status.changedPaths,
            ahead: status.ahead,
            behind: status.behind,
          }
          await measure(`workingChanges.${i}`, () =>
            graft.workingChanges(root, { limit: 100 })
          )
          await measure(`history50.${i}`, () => graft.history(root, 50))
        }
      } finally {
        await graft.close()
        await fs.writeFile(
          path.join(path.dirname(root), "baseline.json"),
          JSON.stringify(
            {
              date: new Date().toISOString(),
              sdk: graft.expectedVersion(),
              root,
              samples,
            },
            null,
            2
          )
        )
      }
    }, 180_000)
  }
)
