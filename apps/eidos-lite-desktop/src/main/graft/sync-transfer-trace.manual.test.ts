import path from "node:path"
import {
  assertBenchmarkDirectory,
  benchmarkDirectory,
  stagingAuth,
  editBenchmarkRow,
} from "./sync-benchmark"
import fs from "node:fs/promises"
import { describe, it } from "vitest"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"

describe.skipIf(process.env.EIDOS_SYNC_TRANSFER_TRACE !== "1")(
  "staging transfer trace",
  () => {
    it("traces one isolated row update and upload", async () => {
      await assertBenchmarkDirectory()
      const root = path.join(benchmarkDirectory, "local")
      const auth = await stagingAuth()
      const remote = auth.remote
      const samples: number[] = []
      const graft = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
        syncRemoteOrigin: "https://sync-staging.eidos.space",
      })
      try {
        await graft.open(root)
        await graft.configureOfficialRemote(root, remote, auth.token)
        await graft.fetch(root)
        for (let iteration = 0; iteration < 5; iteration++) {
          editBenchmarkRow(root, "PERF traced upload " + Date.now())
          await graft.stageAll(root)
          await graft.commit(root, "PERF traced single-row upload")
          const start = performance.now()
          await graft.push(root, auth.token)
          samples.push(performance.now() - start)
        }
      } finally {
        await graft.close()
        await fs.writeFile(
          path.join(benchmarkDirectory, "transfer-results.json"),
          JSON.stringify(
            {
              samples,
              medianMs: [...samples].sort((a, b) => a - b)[
                Math.floor(samples.length / 2)
              ],
            },
            null,
            2
          )
        )
      }
    }, 120_000)
  }
)
