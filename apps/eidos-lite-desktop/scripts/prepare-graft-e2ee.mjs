import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { readGraftSourceSnapshotPolicy } from "./graft-snapshot-policy.mjs"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const root = path.resolve(appRoot, "../..")
if (!readGraftSourceSnapshotPolicy(root)) {
  console.log(
    "Using the installed Graft SDK; source snapshot preparation is disabled."
  )
  process.exit(0)
}
if (!["darwin", "linux"].includes(process.platform)) process.exit(0)
const snapshot = path.join(root, "vendor/graft-e2ee")
const provenance = JSON.parse(
  await fs.readFile(path.join(snapshot, "provenance.json"), "utf8")
)
const output = path.join(appRoot, "resources/graft-e2ee")
const binding = path.join(output, "graft-sdk.node")
const metadataPath = path.join(output, "provenance.json")
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
try {
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"))
  if (
    metadata.revision === provenance.revision &&
    metadata.buildProfile === "release" &&
    metadata.strip === "none" &&
    metadata.platform === process.platform &&
    metadata.arch === process.arch &&
    metadata.sha256 === hash(await fs.readFile(binding))
  ) {
    execFileSync(process.execPath, ["-e", "require(process.argv[1])", binding])
    process.exit(0)
  }
} catch {}
const archive = path.join(snapshot, "source.tar.gz")
if (hash(await fs.readFile(archive)) !== provenance.files["source.tar.gz"])
  throw new Error("Graft source snapshot digest mismatch")
const source = path.join(root, "target/graft-e2ee-source", provenance.revision)
await fs.mkdir(source, { recursive: true })
execFileSync("tar", ["-xzf", archive, "-C", source], { stdio: "inherit" })
const target =
  process.env.EIDOS_GRAFT_BUILD_TARGET ??
  path.join(root, "target/graft-e2ee-native")
execFileSync(
  "cargo",
  [
    "rustc",
    "--release",
    "-p",
    "graft-sdk-node",
    "--features",
    "e2ee",
    "--locked",
    "--",
    "-Cstrip=none",
  ],
  {
    cwd: source,
    stdio: "inherit",
    env: { ...process.env, CARGO_TARGET_DIR: target },
  }
)
await fs.mkdir(output, { recursive: true })
const temporaryBinding = binding + `.${process.pid}.tmp.node`
await fs.copyFile(
  path.join(
    target,
    "release",
    process.platform === "darwin"
      ? "libgraft_sdk_node.dylib"
      : "libgraft_sdk_node.so"
  ),
  temporaryBinding
)
if (process.platform === "darwin")
  execFileSync("codesign", ["--force", "--sign", "-", temporaryBinding], {
    stdio: "inherit",
  })
execFileSync(
  process.execPath,
  ["-e", "require(process.argv[1])", temporaryBinding],
  {
    stdio: "inherit",
  }
)
await fs.rename(temporaryBinding, binding)
await fs.writeFile(
  metadataPath,
  JSON.stringify(
    {
      revision: provenance.revision,
      buildProfile: "release",
      strip: "none",
      platform: process.platform,
      arch: process.arch,
      sha256: hash(await fs.readFile(binding)),
    },
    null,
    2
  ) + "\n"
)
