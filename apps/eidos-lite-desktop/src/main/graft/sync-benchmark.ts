import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { execFileSync } from "node:child_process"

export const STAGING_ORIGIN = "https://sync-staging.eidos.space"
export const benchmarkDirectory = process.env.EIDOS_SYNC_PERF_DIRECTORY ?? ""
export const benchmarkFile =
  process.env.EIDOS_SYNC_PERF_FILE ?? "benchmark.eidos"
export const benchmarkTable = process.env.EIDOS_SYNC_PERF_TABLE ?? "Records"
export const benchmarkField = process.env.EIDOS_SYNC_PERF_FIELD ?? "Name"

export async function assertBenchmarkDirectory(
  directory = benchmarkDirectory
): Promise<string> {
  if (!directory)
    throw new Error(
      "Set EIDOS_SYNC_PERF_DIRECTORY using prepare-sync-benchmark.mjs"
    )
  const root = await fs.realpath(directory)
  const temporary = await fs.realpath(os.tmpdir())
  if (
    path.dirname(root) !== temporary ||
    !path.basename(root).startsWith("eidos-sync-bench-")
  ) {
    throw new Error(
      "An isolated benchmark directory under the system temporary directory is required"
    )
  }
  if (
    (await fs.readFile(path.join(root, ".eidos-sync-benchmark"), "utf8")) !==
    "1\n"
  ) {
    throw new Error("Invalid benchmark marker")
  }
  async function rejectLinks(current: string): Promise<void> {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink())
        throw new Error("Benchmark fixtures must not contain symbolic links")
      if (entry.isDirectory()) await rejectLinks(path.join(current, entry.name))
    }
  }
  await rejectLinks(root)
  return root
}

export function validateStagingAuth(value: unknown): {
  token: string
  remote: string
} {
  if (!value || typeof value !== "object")
    throw new Error("Invalid staging credentials")
  const { token, remote } = value as Record<string, unknown>
  if (typeof token !== "string" || !token || typeof remote !== "string")
    throw new Error("Expected token and remote strings")
  const url = new URL(remote)
  if (
    url.origin !== STAGING_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^perf-[\w-]+$/.test(url.pathname.split("/").filter(Boolean).at(-1) ?? "")
  ) {
    throw new Error(
      "Only a dedicated perf-* repository on Sync staging is allowed"
    )
  }
  return { token, remote }
}

export async function stagingAuth() {
  const file = process.env.EIDOS_SYNC_PERF_AUTH_FILE
  if (!file)
    throw new Error(
      "Set EIDOS_SYNC_PERF_AUTH_FILE to a private JSON file containing token and remote"
    )
  return validateStagingAuth(JSON.parse(await fs.readFile(file, "utf8")))
}

export async function prepareBenchmarkWorker(): Promise<void> {
  await assertBenchmarkDirectory()
  const worker = new URL(
    "../../../dist-electron/runtime-worker.js",
    import.meta.url
  )
  await fs.access(worker)
  await fs.writeFile(
    path.join(benchmarkDirectory, "runtime-bootstrap.cjs"),
    `process.parentPort = { on: (_, cb) => process.on("message", data => cb({ data })), postMessage: message => process.send(message) };\nimport(${JSON.stringify(worker.href)});\n`
  )
}

export function editBenchmarkRow(root: string, value: string): void {
  if (
    path.isAbsolute(benchmarkFile) ||
    benchmarkFile.split(/[\\/]/).includes("..")
  )
    throw new Error("Benchmark file must be inside the copied Space")
  const file = path.join(root, benchmarkFile)
  const context = JSON.parse(
    execFileSync(
      "eidos",
      [
        "--json",
        "context",
        file,
        benchmarkTable,
        "--fields",
        benchmarkField,
        "--limit",
        "1",
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    )
  ) as { revision: string; rows: { _id: string }[] }
  const row = context.rows[0]
  if (!row?._id || !context.revision)
    throw new Error(
      "Benchmark requires an existing record and writable text field"
    )
  execFileSync(
    "eidos",
    [
      "--json",
      "rows",
      file,
      "update",
      benchmarkTable,
      row._id,
      "--expected-revision",
      context.revision,
      "--values",
      "-",
    ],
    {
      input: JSON.stringify({ [benchmarkField]: value }),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }
  )
}
