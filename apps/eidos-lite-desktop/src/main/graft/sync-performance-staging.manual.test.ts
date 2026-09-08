import {
  assertBenchmarkDirectory,
  benchmarkDirectory,
  benchmarkFile,
  benchmarkField,
  stagingAuth,
  editBenchmarkRow,
  prepareBenchmarkWorker,
} from "./sync-benchmark"
import fs from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { describe, expect, it, vi } from "vitest"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import { SpaceSyncStateStore } from "../space/sync-state"

// Node-mode benchmark: run the real built Runtime worker over child IPC.
// This measures Runtime work, but not Electron utility-process startup or UI IPC.
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
          postMessage: (message: unknown) => child.send(message as object),
        })
      },
    },
  }
})

const enabled = process.env.EIDOS_SYNC_PERF_STAGING === "1"
const base = benchmarkDirectory
const source = path.join(base, "source")
const local = path.join(base, "local")
const samples: { operation: string; ms: number; details?: unknown }[] = []
const commands: { phase: string; command: string; ms: number }[] = []
let phase = "setup"
async function measure<T>(
  operation: string,
  run: () => Promise<T>
): Promise<T> {
  phase = operation
  const start = performance.now()
  try {
    return await run()
  } finally {
    const sample = {
      operation,
      ms: Math.round((performance.now() - start) * 100) / 100,
    }
    samples.push(sample)
    console.log(JSON.stringify(sample))
    await save()
  }
}
async function save() {
  await fs.writeFile(
    path.join(base, "staging-results.json"),
    JSON.stringify({ samples, commands }, null, 2)
  )
}
class MeasuredTransport extends GraftInProcessTransport {
  override async command(
    ...args: Parameters<GraftInProcessTransport["command"]>
  ) {
    const start = performance.now()
    const currentPhase = phase
    try {
      return await super.command(...args)
    } finally {
      commands.push({
        phase: currentPhase,
        command: args[0],
        ms: Math.round((performance.now() - start) * 100) / 100,
      })
    }
  }
}
describe.skipIf(!enabled)("real copied Space staging performance", () => {
  it("measures transfer, divergence, conflict review, resolution and completion", async () => {
    await assertBenchmarkDirectory()
    const session = await stagingAuth()
    await prepareBenchmarkWorker()
    const a = new GraftClient({
      sdkTransport: new MeasuredTransport(),
      syncRemoteOrigin: "https://sync-staging.eidos.space",
    })
    const b = new GraftClient({
      sdkTransport: new MeasuredTransport(),
      syncRemoteOrigin: "https://sync-staging.eidos.space",
    })
    let space: SpaceSession | undefined
    try {
      await measure("source.open", () => a.open(source))
      if (process.env.EIDOS_SYNC_PERF_FRESH === "1") {
        await measure("source.init", () => a.initialize(source))
        await measure("source.stage", () => a.stageAll(source))
        await measure("source.commit", () =>
          a.commit(source, "PERF copied Space baseline")
        )
      }
      await a.configureOfficialRemote(source, session.remote, session.token)
      if (process.env.EIDOS_SYNC_PERF_ADVANCE_SOURCE === "1")
        await a.pull(source)
      if (process.env.EIDOS_SYNC_PERF_RESUME === "1") {
        await measure("local.open", () => b.open(local))
      } else {
        await measure("initial.push", () => a.push(source, session.token))
        await fs.rename(local, path.join(base, "local-before-clone"))
        await fs.mkdir(local)
        await measure("cold.clone", () =>
          b.clone(local, session.remote, session.token)
        )
      }
      await b.configureOfficialRemote(local, session.remote, session.token)
      if (process.env.EIDOS_SYNC_PERF_HOST_ONLY !== "1") {
        for (let i = 0; i < 3; i++)
          await measure(`unchanged.fetch.${i}`, () => b.fetch(local))
        await measure("remote.edit", async () =>
          editBenchmarkRow(source, "PERF remote conflict " + Date.now())
        )
        await measure("remote.stage", () => a.stageAll(source))
        await measure("remote.commit", () =>
          a.commit(source, "PERF remote row edit")
        )
        await measure("remote.push", () => a.push(source, session.token))
        await measure("local.edit", async () =>
          editBenchmarkRow(local, "PERF local conflict " + Date.now())
        )
        await measure("local.stage", () => b.stageAll(local))
        await measure("local.commit", () =>
          b.commit(local, "PERF local row edit")
        )
      }
      space = await measure("host.open", () =>
        SpaceSession.create(local, path.join(base, "user-data"), {
          graft: b,
          automaticCheckpointsEnabled: false,
        })
      )
      await new SpaceSyncStateStore(
        path.join(base, "user-data", "spaces", space.canonical.id),
        "https://sync-staging.eidos.space"
      ).markClone(session.remote)
      await measure("host.refresh", () => space!.refresh())
      await measure("host.fetch", () =>
        space!.syncHostedRemote(
          session.token,
          "read_write",
          () => undefined,
          () => undefined,
          "fetch"
        )
      )
      for (let i = 0; i < 4; i++)
        await measure(`host.plan.${i}`, () =>
          space!.planHostedMerge(session.token)
        )
      const plan = await measure("host.plan", () =>
        space!.planHostedMerge(session.token)
      )
      expect(plan.kind).toBe("three_way")
      if (process.env.EIDOS_SYNC_PERF_PLAN_ONLY === "1") return
      let merge = await measure("host.apply", () =>
        space!.applyHostedMerge({
          expectedHead: plan.expectedHead,
          planToken: plan.planToken,
        })
      )
      expect(merge.state).toBe("merging")
      if (merge.state !== "merging") throw new Error("Expected real conflict")
      const token = merge.stateToken
      for (let i = 0; i < 3; i++) {
        await measure(`host.paths.${i}`, () => space!.listSyncMergePaths(token))
        await measure(`host.conflicts.${i}`, () =>
          space!.listSyncMergeConflicts(token, benchmarkFile)
        )
      }
      const page = await space.listSyncMergeConflicts(token, benchmarkFile)
      const conflict =
        page.items.find(
          (c) =>
            c.kind === "row" &&
            c.status === "unresolved" &&
            c.columns?.includes(benchmarkField)
        ) ??
        page.items.find((c) => c.kind === "row" && c.status === "unresolved")
      if (!conflict?.table) throw new Error("Expected row conflict")
      const identity =
        conflict.key ?? conflict.rowid ?? conflict.oursKey ?? conflict.oursRowid
      if (identity === undefined) throw new Error("Missing conflict identity")
      merge = await measure("host.resolveRow", () =>
        space!.resolveSyncMergeRow(
          token,
          benchmarkFile,
          conflict.table!,
          identity,
          "theirs"
        )
      )
      if (merge.state !== "merging")
        throw new Error("Expected reviewable resolved merge")
      expect(merge.unmergedCount).toBe(0)
      const resolvedToken = merge.stateToken
      await measure("host.complete", () =>
        space!.continueSyncMerge(resolvedToken, "PERF completed merge")
      )
      await measure("host.upload", () =>
        space!.syncHostedRemote(
          session.token,
          "read_write",
          () => undefined,
          () => undefined,
          "push"
        )
      )
      const final = await measure("host.finalStatus", () => space!.refresh())
      expect(final.graft.clean).toBe(true)
      await measure("validate", async () => {
        const validation = spawnSync(
          "eidos",
          [
            "--json",
            "validate",
            path.join(local, benchmarkFile),
            "--level",
            "full",
          ],
          { encoding: "utf8" }
        )
        await fs.writeFile(
          path.join(base, "validation.json"),
          validation.stdout
        )
        expect(validation.status).toBe(0)
        return JSON.parse(validation.stdout)
      })
    } finally {
      await space?.close()
      await a.close()
      await b.close()
      await save()
    }
  }, 1_200_000)
})
