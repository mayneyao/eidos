import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

// Copy first; benchmarks must never open the original Space for mutation.
const source = process.argv[2]
if (!source)
  throw new Error(
    "Usage: node scripts/prepare-sync-benchmark.mjs /path/to/closed-space"
  )
async function check(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error(
        "Source contains symlinks; prepare a self-contained copy first"
      )
    if (entry.isDirectory()) await check(path.join(directory, entry.name))
  }
}
await check(source)
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-sync-bench-"))
await fs.chmod(directory, 0o700)
try {
  await fs.cp(source, path.join(directory, "source"), {
    recursive: true,
    errorOnExist: true,
    force: false,
  })
  await fs.cp(source, path.join(directory, "local"), {
    recursive: true,
    errorOnExist: true,
    force: false,
  })
  await fs.writeFile(path.join(directory, ".eidos-sync-benchmark"), "1\n", {
    flag: "wx",
    mode: 0o600,
  })
  console.log(directory)
} catch (error) {
  await fs.rm(directory, { recursive: true, force: true })
  throw error
}
