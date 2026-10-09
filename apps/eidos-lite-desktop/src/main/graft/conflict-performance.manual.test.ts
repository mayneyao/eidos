import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"
import { SpaceSession } from "../space/space-session"

vi.mock("electron", async (original) => {
  if (!process.env.EIDOS_CONFLICT_PERF_WORKER) return original()
  const { fork } = await import("node:child_process")
  return {
    utilityProcess: {
      fork: () => {
        const child = fork(process.env.EIDOS_CONFLICT_PERF_WORKER!, [], {
          serialization: "advanced",
          stdio: ["ignore", "pipe", "pipe", "ipc"],
        })
        return Object.assign(child, {
          postMessage: (message: object) => child.send(message),
        })
      },
    },
  }
})

describe.skipIf(process.env.EIDOS_CONFLICT_PERF !== "1")(
  "captured Space conflict inspection performance",
  () => {
    it("measures existing conflicts without changing databases or merge state", async () => {
      const snapshot = process.env.EIDOS_CONFLICT_SPACE_SNAPSHOT
      if (!snapshot || !snapshot.startsWith("/private/tmp/"))
        throw new Error("Provide an isolated captured Space snapshot")
      const base = await fs.mkdtemp(
        path.join(os.tmpdir(), "eidos-conflict-perf-")
      )
      const local = path.join(base, "space")
      execFileSync("cp", ["-cR", snapshot, local])
      const graft = new GraftClient({
        sdkTransport: new GraftInProcessTransport(),
      })
      let session: SpaceSession | undefined
      const relativePath = "eidos-project.eidos"
      const protectedPaths = [
        relativePath,
        ".graft/index/state.toml",
        ".graft/merge-resolution-session.json",
        ".graft/refs/heads/main",
      ]
      const hashes = async () =>
        Promise.all(
          protectedPaths.map(async (file) =>
            createHash("sha256")
              .update(await fs.readFile(path.join(local, file)))
              .digest("hex")
          )
        )
      const before = await hashes()
      try {
        await graft.open(local)
        session = await SpaceSession.create(
          local,
          path.join(base, "user-data"),
          { graft }
        )
        const calls = { status: 0, paths: 0, conflicts: 0, semantic: 0 }
        const methods = [
          "getMergeStatus",
          "listMergePaths",
          "listMergeConflicts",
          "prepareSemanticMerge",
        ] as const
        const keys = ["status", "paths", "conflicts", "semantic"] as const
        methods.forEach((method, i) => {
          const original = graft[method].bind(graft)
          vi.spyOn(graft, method).mockImplementation((...args: unknown[]) => {
            calls[keys[i]]++
            return Reflect.apply(original, graft, args)
          })
        })
        const samples: {
          totalMs: number
          statusMs: number
          pathsMs: number
          detailsMs: number
        }[] = []
        let expectedIds: string[] | undefined
        for (let i = 0; i < 6; i++) {
          const start = performance.now()
          const status = await session.getSyncMergeStatus()
          expect(status).toMatchObject({ state: "merging", unmergedCount: 1 })
          if (status.state !== "merging")
            throw new Error("Missing captured merge")
          const statusEnd = performance.now()
          const paths = await session.listSyncMergePaths(status.stateToken)
          expect(
            paths.items.find((item) => item.path === relativePath)?.state
          ).toBe("unmerged")
          const pathsEnd = performance.now()
          const details = await session.listSyncMergeConflicts(
            status.stateToken,
            relativePath
          )
          const end = performance.now()
          expect(
            details.items.some(
              (item) => item.status === "unresolved" && item.kind === "row"
            )
          ).toBe(true)
          if (process.env.EIDOS_CONFLICT_PERF_WORKER) {
            const opened = await session.runtimePool.open(relativePath)
            expect(opened.snapshot.tables.length).toBeGreaterThan(0)
          }
          const ids = details.items.map((item) => item.id)
          expectedIds ??= ids
          expect(ids).toEqual(expectedIds)
          samples.push({
            totalMs: end - start,
            statusMs: statusEnd - start,
            pathsMs: pathsEnd - statusEnd,
            detailsMs: end - pathsEnd,
          })
        }
        const warm = samples.slice(1)
        const median = (values: number[]) =>
          [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
        const result = {
          source: "captured-existing-space",
          coldMs: samples[0].totalMs,
          medianMs: median(warm.map((item) => item.totalMs)),
          statusMs: median(warm.map((item) => item.statusMs)),
          pathsMs: median(warm.map((item) => item.pathsMs)),
          detailsMs: median(warm.map((item) => item.detailsMs)),
          calls,
          samples,
        }
        await fs.writeFile(
          process.env.EIDOS_CONFLICT_PERF_RESULT ??
            path.join(base, "result.json"),
          JSON.stringify(result, null, 2)
        )
        expect(await hashes()).toEqual(before)
      } finally {
        await session?.close()
        await graft.close()
        await fs.rm(base, { recursive: true, force: true })
      }
    }, 360_000)
  }
)
