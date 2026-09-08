import { benchmarkDirectory, prepareBenchmarkWorker } from "./sync-benchmark"
import fs from "node:fs/promises"
import { describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { flattenSpaceTree, listSpaceTree } from "../space/space-paths"

vi.mock("electron", async () => {
  const { fork } = await import("node:child_process")
  return {
    utilityProcess: {
      fork: () => {
        const child = fork(
          `${process.env.EIDOS_SYNC_PERF_DIRECTORY}/runtime-bootstrap.cjs`,
          [],
          {
            serialization: "advanced",
            stdio: ["ignore", "pipe", "pipe", "ipc"],
          }
        )
        return Object.assign(child, {
          postMessage: (message: object) => child.send(message),
        })
      },
    },
  }
})

describe.skipIf(process.env.EIDOS_SYNC_POLICY_PERF !== "1")(
  "isolated merge policy performance",
  () => {
    it("measures complete policy discovery with real Runtime workers", async () => {
      const base = benchmarkDirectory
      await prepareBenchmarkWorker()
      const graft = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
      })
      await graft.open(base + "/local")
      const space = await SpaceSession.create(
        base + "/local",
        base + "/policy-user-data",
        { graft, automaticCheckpointsEnabled: false }
      )
      const inspect = space as unknown as {
        ensureEidosMergePolicy(signal: AbortSignal): Promise<void>
      }
      try {
        const samples: number[] = []
        for (let i = 0; i < 6; i++) {
          const start = performance.now()
          await inspect.ensureEidosMergePolicy(new AbortController().signal)
          const ms = performance.now() - start
          if (i > 0) samples.push(ms)
        }
        const result = {
          samples,
          medianMs: [...samples].sort((a, b) => a - b)[2],
        }
        console.log(JSON.stringify(result))
        await fs.writeFile(
          base + "/policy-results.json",
          JSON.stringify(result, null, 2)
        )
        const paths = flattenSpaceTree(await listSpaceTree(base + "/local"))
          .filter((entry) => entry.kind === "eidos")
          .map((entry) => entry.relativePath)
        const actual = await space.runtimePool.inspectMergeTables(
          paths,
          new AbortController().signal
        )
        const expected = new Set<string>()
        for (const relativePath of paths) {
          const opened = await space.runtimePool.open(relativePath)
          for (const { table } of opened.snapshot.tables)
            expected.add(table.physicalName ?? table.rawTableName ?? table.name)
        }
        expect(actual.sort()).toEqual([...expected].sort())
        const invalid = `policy-invalid-${randomUUID()}.eidos`
        await fs.writeFile(base + "/local/" + invalid, "invalid fixture", {
          flag: "wx",
        })
        try {
          await expect(
            space.runtimePool.inspectMergeTables(
              [...paths.slice(0, 1), invalid],
              new AbortController().signal
            )
          ).rejects.toThrow()
        } finally {
          await fs.unlink(base + "/local/" + invalid)
        }
      } finally {
        await space.close()
        await graft.close()
      }
    }, 120_000)
  }
)
