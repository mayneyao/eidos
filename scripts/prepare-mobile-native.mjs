import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"

// Build a pinned, patched dependency in a private workspace. Never edit Cargo's
// Git cache or the developer's Graft checkout. The source lockfiles stay intact.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const platform = process.argv[2]
if (!["android", "ios"].includes(platform))
  throw new Error("Expected android or ios")
const build = path.join(root, `apps/eidos-${platform}/build/native-workspace`)
const workspace = path.join(build, "workspace")
const source = path.join(build, "graft-source")
const revision = "5c99ad07ee1af7b66432c94c6e919c7faa5cacd5"
const patch = path.join(
  root,
  "apps/eidos-android/patches/graft-android-runtime.patch"
)
const stamp =
  "isolated-patch-v2:" +
  revision +
  ":" +
  createHash("sha256")
    .update(await fs.readFile(patch))
    .digest("hex")
const run = (command, args, cwd, options = {}) =>
  execFileSync(command, args, {
    cwd,
    stdio: ["pipe", "pipe", "inherit"],
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  })
await fs.mkdir(build, { recursive: true })
if (
  (await fs
    .readFile(path.join(source, ".eidos-patch"), "utf8")
    .catch(() => "")) !== stamp
) {
  const mirror = path.join(build, "graft.git")
  if (!(await fs.stat(mirror).catch(() => null)))
    run(
      "git",
      ["clone", "--bare", "https://github.com/eidos-space/graft", mirror],
      build
    )
  try {
    run("git", ["cat-file", "-e", revision], mirror)
  } catch {
    run("git", ["fetch", "origin", revision], mirror)
  }
  // Only this script's generated source directory is replaced.
  await fs.rm(source, { recursive: true, force: true })
  await fs.mkdir(source, { recursive: true })
  const archive = run("git", ["archive", revision], mirror)
  run("tar", ["-x", "-C", source], build, { input: archive })
  // An archive under this checkout has no .git of its own. Without a ceiling,
  // `git apply` discovers the parent Eidos repository and silently skips paths
  // outside the current subdirectory. Apply as a standalone source tree and
  // verify the reverse patch before recording a successful stamp.
  const patchOptions = {
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(source) },
  }
  run("git", ["apply", "--check", patch], source, patchOptions)
  run("git", ["apply", patch], source, patchOptions)
  run("git", ["apply", "--reverse", "--check", patch], source, patchOptions)
  await fs.writeFile(path.join(source, ".eidos-patch"), stamp)
}
const copy = async (relative) => {
  await fs.cp(path.join(root, relative), path.join(workspace, relative), {
    recursive: true,
    filter: (entry) =>
      !["target", "build", ".git"].includes(path.basename(entry)),
  })
}
await copy("apps/cli")
await copy("packages/plugin-runtime/src/compatibility-data.json")
if (platform === "ios") await copy("apps/eidos-ios/native")
const manifestDirectory = path.join(
  workspace,
  platform === "ios" ? "apps/eidos-ios/native" : "apps/cli"
)
const manifest = path.join(manifestDirectory, "Cargo.toml")
await fs.appendFile(
  manifest,
  `\n[patch."https://github.com/eidos-space/graft"]\ngraft-sdk = { path = ${JSON.stringify(path.join(source, "crates/graft-sdk"))} }\n`
)
const lock = path.join(manifestDirectory, "Cargo.lock")
const original = await fs.readFile(lock, "utf8")
const cargo = ["+1.99.0"]
run("cargo", [...cargo, "update", "-p", "graft-sdk"], manifestDirectory)
const updated = await fs.readFile(lock, "utf8")
const packages = (text) =>
  text
    .split("[[package]]")
    .slice(1)
    .map((block) =>
      block
        .split("dependencies =")[0]
        .replace(
          /^source = "git\+https:\/\/github.com\/eidos-space\/graft[^"\n]*"\n/m,
          ""
        )
        .trim()
    )
    .sort()
if (JSON.stringify(packages(original)) !== JSON.stringify(packages(updated)))
  throw new Error(
    "Patching Graft unexpectedly changed other locked dependency versions"
  )
process.stdout.write(manifestDirectory + "\n")
