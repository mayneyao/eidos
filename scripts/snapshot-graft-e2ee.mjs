import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const revision = "05fc9c9a6aa2f7aaa6e197ecd07450d220526b81"
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.resolve(process.argv[2] ?? path.join(root, "../graft"))
const destination = path.join(root, "vendor/graft-e2ee")
const temporary = await fs.mkdtemp(
  path.join(os.tmpdir(), "eidos-graft-snapshot-")
)
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: "inherit" })
try {
  await fs.mkdir(destination, { recursive: true })
  const archive = path.join(destination, "source.tar.gz")
  run(
    "git",
    ["archive", "--format=tar.gz", `--output=${archive}`, revision],
    source
  )
  run("tar", ["-xzf", archive, "-C", temporary], root)
  await fs.symlink(
    path.join(source, "node_modules"),
    path.join(temporary, "node_modules")
  )
  for (const name of [
    "graft-remote",
    "graft-remote-hono",
    "graft-remote-cloudflare",
    "graft-sdk",
  ]) {
    const directory = path.join(temporary, "packages", name)
    await fs.symlink(
      path.join(source, "packages", name, "node_modules"),
      path.join(directory, "node_modules")
    )
    if (name !== "graft-sdk")
      run("pnpm", ["exec", "tsc", "-p", "tsconfig.build.json"], directory)
    run("pnpm", ["pack", "--pack-destination", destination], directory)
  }
  const files = {}
  for (const name of (await fs.readdir(destination)).sort()) {
    if (name.endsWith(".tgz") || name === "source.tar.gz") {
      files[name] = createHash("sha256")
        .update(await fs.readFile(path.join(destination, name)))
        .digest("hex")
    }
  }
  await fs.writeFile(
    path.join(destination, "provenance.json"),
    JSON.stringify(
      { repository: "https://github.com/eidos-space/graft", revision, files },
      null,
      2
    ) + "\n"
  )
} finally {
  await fs.rm(temporary, { recursive: true, force: true })
}
