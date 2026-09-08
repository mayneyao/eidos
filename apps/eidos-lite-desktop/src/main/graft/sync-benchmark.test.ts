import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { assertBenchmarkDirectory, validateStagingAuth } from "./sync-benchmark"

describe("manual benchmark boundaries", () => {
  it("prepares independent copies without modifying the source", async () => {
    const source = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-benchmark-source-")
    )
    let directory: string | undefined
    try {
      await fs.writeFile(path.join(source, "sample.txt"), "original")
      directory = execFileSync(
        process.execPath,
        [
          fileURLToPath(
            new URL(
              "../../../scripts/prepare-sync-benchmark.mjs",
              import.meta.url
            )
          ),
          source,
        ],
        { encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } }
      ).trim()
      await assertBenchmarkDirectory(directory)
      expect(
        await fs.readFile(path.join(directory, "source/sample.txt"), "utf8")
      ).toBe("original")
      await fs.writeFile(path.join(directory, "local/sample.txt"), "changed")
      expect(await fs.readFile(path.join(source, "sample.txt"), "utf8")).toBe(
        "original"
      )
    } finally {
      if (directory) await fs.rm(directory, { recursive: true, force: true })
      await fs.rm(source, { recursive: true, force: true })
    }
  })
  it.each([
    "https://sync.eidos.space/repos/perf-example",
    "https://sync-staging.eidos.space/repos/real-space",
    "https://user:secret@sync-staging.eidos.space/repos/perf-example",
    "https://sync-staging.eidos.space/repos/perf-example?token=secret",
  ])("rejects unsafe remote %s", (remote) => {
    expect(() => validateStagingAuth({ token: "test", remote })).toThrow()
  })
  it("accepts an explicit staging performance repository", () => {
    const auth = {
      token: "test",
      remote: "https://sync-staging.eidos.space/repos/perf-example",
    }
    expect(validateStagingAuth(auth)).toEqual(auth)
  })
  it("requires a marked temporary copy and rejects escaped symlinks", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-sync-bench-")
    )
    try {
      await expect(assertBenchmarkDirectory(directory)).rejects.toThrow()
      await fs.writeFile(path.join(directory, ".eidos-sync-benchmark"), "1\n")
      await expect(assertBenchmarkDirectory(directory)).resolves.toBe(
        await fs.realpath(directory)
      )
      await fs.symlink(os.tmpdir(), path.join(directory, "escape"), "junction")
      await expect(assertBenchmarkDirectory(directory)).rejects.toThrow(
        "symbolic links"
      )
    } finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})
