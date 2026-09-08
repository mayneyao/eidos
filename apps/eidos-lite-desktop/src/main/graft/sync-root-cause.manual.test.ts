import {
  assertBenchmarkDirectory,
  benchmarkDirectory,
  stagingAuth,
} from "./sync-benchmark"
import fs from "node:fs/promises"
import path from "node:path"
import { parse, stringify } from "smol-toml"
import { describe, it } from "vitest"
import { GraftInProcessTransport } from "./graft-in-process-transport"

const root = path.join(benchmarkDirectory, "local")
describe.skipIf(process.env.EIDOS_SYNC_CAUSE !== "1")(
  "isolated status cause",
  () => {
    it.skipIf(process.env.EIDOS_SYNC_CAUSE_HTTP !== "1")(
      "retries original staging history clone with tracing",
      async () => {
        await assertBenchmarkDirectory()
        const auth = await stagingAuth()
        const remote = auth.remote
        const directory = await fs.mkdtemp(
          path.join(benchmarkDirectory, "http-clone-")
        )
        const transport = new GraftInProcessTransport()
        try {
          await transport.clone(directory, remote, auth.token)
        } finally {
          await transport.close()
          console.log("HTTP diagnosis fixture", directory)
        }
      },
      120_000
    )
    it.skipIf(process.env.EIDOS_SYNC_CAUSE_LOCAL_PUSH !== "1")(
      "checks copied snapshots through a local filesystem remote",
      async () => {
        await assertBenchmarkDirectory()
        const directory = await fs.mkdtemp(
          path.join(benchmarkDirectory, "local-remote-")
        )
        const configPath = path.join(root, ".graft/config.toml")
        const original = await fs.readFile(configPath, "utf8")
        const transport = new GraftInProcessTransport()
        try {
          await fs.mkdir(path.join(directory, "remote"))
          const remote = `fs://${directory}/remote`
          const name =
            process.env.EIDOS_SYNC_CAUSE_STALE === "1" ? "origin" : "diagnosis"
          if (name === "origin") {
            const config = parse(original)
            const remotes = config.remotes as Record<string, unknown>
            remotes.origin = {
              type: "fs",
              root: path.join(directory, "remote"),
            }
            await fs.writeFile(configPath, stringify(config))
          }
          await transport.open(root)
          if (name !== "origin")
            await transport.command("configureRemote", [{ name, url: remote }])
          await transport.command("push", [{ remote: name, branch: "main" }])
          await fs.mkdir(path.join(directory, "clone"))
          await transport.clone(path.join(directory, "clone"), remote)
        } finally {
          await transport.close()
          await fs.writeFile(configPath, original)
          console.log("Local diagnosis fixture", directory)
        }
      },
      120_000
    )
    it("compares identical history with and without upstream projection", async () => {
      await assertBenchmarkDirectory()
      const configPath = path.join(root, ".graft/config.toml")
      const original = await fs.readFile(configPath, "utf8")
      const results: unknown[] = []
      try {
        for (const mode of ["upstream", "no-upstream", "restored"]) {
          const config = parse(original)
          if (mode === "no-upstream") delete config.branches
          await fs.writeFile(
            configPath,
            mode === "no-upstream" ? stringify(config) : original
          )
          const transport = new GraftInProcessTransport()
          try {
            await transport.open(root)
            for (let i = 0; i < 4; i++) {
              const start = performance.now()
              const value = (await transport.command("statusIncremental")) as {
                telemetry: unknown
              }
              results.push({
                mode,
                i,
                ms: performance.now() - start,
                telemetry: value.telemetry,
              })
            }
          } finally {
            await transport.close()
          }
        }
      } finally {
        await fs.writeFile(configPath, original)
        await fs.writeFile(
          path.join(benchmarkDirectory, "status-cause.json"),
          JSON.stringify(results, null, 2)
        )
      }
    }, 120_000)
  }
)
