import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { DatabaseSync } from "node:sqlite"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"
import { SpaceSession } from "../space/space-session"
import type {
  EidosSyncMergeApplyRequest,
  EidosSyncMergeStatus,
} from "../../shared/contracts"

vi.mock("electron", async () => {
  const { fork } = await import("node:child_process")
  return {
    utilityProcess: {
      fork: () => {
        const worker = process.env.EIDOS_AUTO_MERGE_WORKER
        if (!worker)
          throw new Error("Provide the built Runtime worker bootstrap")
        const child = fork(worker, [], {
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

describe.skipIf(process.env.EIDOS_AUTO_MERGE_PERF !== "1")(
  "automatic merge of the captured real Space",
  () => {
    it("replans only private copies and measures policy, plan and validated apply", async () => {
      const snapshot = process.env.EIDOS_CONFLICT_SPACE_SNAPSHOT
      if (!snapshot?.startsWith("/private/tmp/"))
        throw new Error("Provide an isolated captured Space snapshot")
      const protectedFiles = [
        "eidos-project.eidos",
        ".graft/merge-resolution-session.json",
        ".graft/refs/heads/main",
      ]
      const hashes = () =>
        Promise.all(
          protectedFiles.map(async (file) =>
            createHash("sha256")
              .update(await fs.readFile(path.join(snapshot, file)))
              .digest("hex")
          )
        )
      const before = await hashes()
      const rowId = "01a11df3-1c43-74ad-972e-f28563d5b65f"
      const captured = new DatabaseSync(
        path.join(snapshot, "eidos-project.eidos"),
        { readOnly: true }
      )
      let businessRow: Record<string, unknown>
      let fileId: unknown
      try {
        businessRow = {
          ...captured.prepare("select * from dev where _id=?").get(rowId),
        }
        delete businessRow._updated_at
        fileId = captured
          .prepare("select file_id from eidos__meta")
          .get()?.file_id
      } finally {
        captured.close()
      }
      const journal = JSON.parse(
        await fs.readFile(
          path.join(snapshot, ".graft/merge-resolution-session.json"),
          "utf8"
        )
      ) as { merge_head: string; orig_head: string }
      const samples = []
      const repetitions = Number(process.env.EIDOS_AUTO_MERGE_SAMPLES ?? 3)
      if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 6)
        throw new Error("Expected 1–6 isolated replay samples")
      for (let i = 0; i < repetitions; i++) {
        const base = await fs.mkdtemp(
          path.join(os.tmpdir(), "eidos-auto-merge-perf-")
        )
        const root = path.join(base, "space")
        execFileSync("cp", ["-cR", snapshot, root])
        const transport = new GraftInProcessTransport()
        const sdkCalls: { command: string; durationMs: number }[] = []
        const runtimeCalls: {
          command: string
          durationMs: number
          fileCount?: number
        }[] = []
        const command = transport.command.bind(transport)
        vi.spyOn(transport, "command").mockImplementation(async (...args) => {
          const started = performance.now()
          try {
            return await command(...args)
          } finally {
            sdkCalls.push({
              command: args[0],
              durationMs: performance.now() - started,
            })
          }
        })
        const graft = new GraftClient({ sdkTransport: transport })
        let session: SpaceSession | undefined
        try {
          await graft.open(root)
          const active = await graft.getMergeStatus(root)
          if (active.state !== "merging")
            throw new Error("Expected the captured merge")
          await graft.abortMerge(root, active.stateToken)
          session = await SpaceSession.create(
            root,
            path.join(base, "user-data"),
            { graft }
          )
          const validatePaths = session.runtimePool.validatePaths.bind(
            session.runtimePool
          )
          vi.spyOn(session.runtimePool, "validatePaths").mockImplementation(
            async (paths) => {
              const started = performance.now()
              try {
                return await validatePaths(paths)
              } finally {
                runtimeCalls.push({
                  command: "validatePaths",
                  durationMs: performance.now() - started,
                  fileCount: paths.length,
                })
              }
            }
          )
          const mergeMetadata = session.runtimePool.mergeSystemMetadata.bind(
            session.runtimePool
          )
          vi.spyOn(
            session.runtimePool,
            "mergeSystemMetadata"
          ).mockImplementation(async (options) => {
            const started = performance.now()
            try {
              return await mergeMetadata(options)
            } finally {
              runtimeCalls.push({
                command: "mergeSystemMetadata",
                durationMs: performance.now() - started,
              })
            }
          })
          const internal = session as unknown as {
            ensureEidosMergePolicy(signal: AbortSignal): Promise<void>
            applySyncMerge(
              revision: string,
              request: EidosSyncMergeApplyRequest
            ): Promise<EidosSyncMergeStatus>
          }
          const start = performance.now()
          sdkCalls.length = 0
          await internal.ensureEidosMergePolicy(new AbortController().signal)
          const policyEnd = performance.now()
          const policy = await graft.getMergePolicy(root)
          const automatic =
            process.env.EIDOS_AUTO_MERGE_EXPECT_AUTOMATIC === "1"
          if (automatic)
            expect(policy.policy.column_resolvers?.dev?._updated_at).toBe(
              "max_timestamp"
            )
          const plan = await graft.planMerge(
            root,
            journal.merge_head,
            journal.orig_head
          )
          const planEnd = performance.now()
          expect(plan.kind).toBe("three_way")
          const result = await internal.applySyncMerge(journal.merge_head, {
            expectedHead: plan.expectedHead,
            planToken: plan.planToken,
          })
          const end = performance.now()
          const db = new DatabaseSync(path.join(root, "eidos-project.eidos"), {
            readOnly: true,
          })
          try {
            if (automatic)
              expect(
                db
                  .prepare("select status, _updated_at from dev where _id=?")
                  .get(rowId)
              ).toMatchObject({
                status: "已完成",
                _updated_at: "2026-10-09T01:29:02.552Z",
              })
            const actualRow = {
              ...db.prepare("select * from dev where _id=?").get(rowId),
            }
            delete actualRow._updated_at
            expect(actualRow).toEqual(businessRow)
            const meta = db
              .prepare("select revision, file_id from eidos__meta")
              .get()
            expect(meta?.file_id).toEqual(fileId)
            if (automatic) {
              expect(result.state).toBe("none")
              expect(meta?.revision).toBe(2421)
            }
            console.log("automatic merge outcome", result.state, meta)
            expect(db.prepare("pragma integrity_check").get()).toMatchObject({
              integrity_check: "ok",
            })
            expect(db.prepare("pragma foreign_key_check").all()).toEqual([])
            samples.push({
              totalMs: end - start,
              policyMs: policyEnd - start,
              planMs: planEnd - policyEnd,
              applyMs: end - planEnd,
              state: result.state,
              revision: meta?.revision,
              timestampRuleApplied:
                policy.policy.column_resolvers?.dev?._updated_at ===
                "max_timestamp",
              sdkCalls: [...sdkCalls],
              runtimeCalls: [...runtimeCalls],
            })
          } finally {
            db.close()
          }
        } finally {
          await session?.close()
          await graft.close()
          await fs.rm(base, { recursive: true, force: true })
        }
      }
      expect(await hashes()).toEqual(before)
      const result = {
        source: "captured-existing-space",
        samples,
        medianMs: samples.map((s) => s.totalMs).sort((a, b) => a - b)[
          Math.floor(samples.length / 2)
        ],
      }
      console.log(JSON.stringify(result))
      await fs.writeFile(
        process.env.EIDOS_AUTO_MERGE_RESULT ??
          "/private/tmp/eidos-conflict-research/automatic-merge.json",
        JSON.stringify(result, null, 2)
      )
    }, 360_000)
  }
)
