import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

// Build the pinned upstream dependency in a private workspace. Never edit Cargo's
// Git cache or the developer's Graft checkout. The root lockfile stays intact.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const platform = process.argv[2]
if (!["android", "ios"].includes(platform))
  throw new Error("Expected android or ios")
const build = path.join(root, `apps/eidos-${platform}/build/native-workspace`)
const workspace = path.join(build, "workspace")
const source = path.join(build, "graft-source")
const rootManifest = await fs.readFile(path.join(root, "Cargo.toml"), "utf8")
const revision = rootManifest.match(/^graft-sdk = .*rev = "([a-f0-9]+)"/m)?.[1]
if (!revision) throw new Error("Root workspace must pin the Graft SDK revision")
const stamp = "isolated-upstream-v1:" + revision
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
  // SDK 0.3.30 contains the former mobile runtime patch upstream. Applying it
  // again would conflict with the published sources. Require its planned
  // transfer API before enabling the host's corresponding build feature.
  const sdkManifest = await fs.readFile(
    path.join(source, "crates/graft-sdk/Cargo.toml"),
    "utf8"
  )
  const sdkVersion = sdkManifest.match(/^version = "(\d+)\.(\d+)\.(\d+)"/m)
  if (
    !sdkVersion ||
    (Number(sdkVersion[1]) === 0 &&
      (Number(sdkVersion[2]) < 3 ||
        (Number(sdkVersion[2]) === 3 && Number(sdkVersion[3]) < 30)))
  )
    throw new Error("Mobile native builds require upstream Graft SDK 0.3.30+")
  await fs.writeFile(path.join(source, ".eidos-patch"), stamp)
}
// Mirror exactly so deleted/moved sources and their fingerprints cannot linger.
// Build outputs live in the repository target directory, outside this mirror.
await fs.rm(workspace, { recursive: true, force: true })
const copy = async (relative) => {
  await fs.cp(path.join(root, relative), path.join(workspace, relative), {
    recursive: true,
    filter: (entry) =>
      !["target", "build", ".git"].includes(path.basename(entry)),
  })
}
await copy("Cargo.toml")
await copy("Cargo.lock")
await copy("crates")
await copy("apps/cli")
await copy("packages/eidos-file/src")
await copy("packages/eidos-file/package.json")
await copy("packages/eidos-file/generated/quickjs")
await copy("scripts/build-quickjs.mjs")
await copy("scripts/generated-assets.mjs")
await copy("packages/plugin-runtime/src/compatibility-data.json")
const manifestDirectory = workspace
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
    "Mirroring Graft unexpectedly changed other locked dependency versions"
  )
process.stdout.write(manifestDirectory + "\n")
