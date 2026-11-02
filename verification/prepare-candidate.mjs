import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const root = process.cwd()
const directory = path.join(root, "vendor/graft-candidate")
const manifest = JSON.parse(
  fs.readFileSync(path.join(directory, "packages-manifest.json"), "utf8")
)
const version = "0.3.38-sync-progress.20261103.1"
const names = [
  "@eidos.space/graft",
  ...[
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64-gnu",
    "linux-x64-gnu",
    "win32-x64-msvc",
  ].map((suffix) => `@eidos.space/graft-${suffix}`),
]
assert.equal(manifest.candidateVersion, version)
assert.equal(manifest.published, false)
assert.equal(
  manifest.completePlatformSet,
  true,
  "All five native packages are required before CI"
)
assert.equal(
  manifest.reviewedPatchSha256,
  "55da17bd3740fd10b2c87026306128c5207700a727d0207b76bfa137bfebbc5d"
)
assert.equal(manifest.sourceBase, "bae54776ef1e66d314e69379425a82c63718c7ed")
assert.equal(manifest.packages.length, names.length)
for (const name of ["EIDOS_LITE_GRAFT_SDK_PATH", "GRAFT_SDK_NATIVE_PATH"])
  assert(!process.env[name], `${name} is forbidden`)
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
let workspace = fs.readFileSync("pnpm-workspace.yaml", "utf8")
const entries = []
for (const name of names) {
  const matches = manifest.packages.filter((entry) => entry.name === name)
  assert.equal(matches.length, 1)
  const entry = matches[0]
  assert.equal(entry.version, version)
  assert.equal(path.basename(entry.filename), entry.filename)
  const file = path.join(directory, entry.filename)
  assert(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink())
  assert.equal(sha(fs.readFileSync(file)), entry.sha256)
  const metadata = JSON.parse(
    execFileSync("tar", ["-xOf", file, "package/package.json"], {
      encoding: "utf8",
    })
  )
  assert.equal(metadata.name, name)
  assert.equal(metadata.version, version)
  assert.equal(
    metadata.private,
    true,
    "Offline inputs must remain private candidates"
  )
  for (const hook of ["preinstall", "install", "postinstall"])
    assert(!metadata.scripts?.[hook])
  if (name !== names[0]) {
    const suffix = name.slice("@eidos.space/graft-".length)
    assert.equal(
      sha(
        execFileSync(
          "tar",
          ["-xOf", file, `package/graft-sdk.${suffix}.node`],
          { maxBuffer: 128 * 1024 * 1024 }
        )
      ),
      entry.nativeSha256
    )
  }
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`^  "${escaped}": .+$`, "gm")
  assert.equal([...workspace.matchAll(pattern)].length, 1)
  workspace = workspace.replace(
    pattern,
    `  "${name}": "file:vendor/graft-candidate/${entry.filename}"`
  )
  entries.push({ name, sha256: entry.sha256, nativeSha256: entry.nativeSha256 })
}
const lite = JSON.parse(
  fs.readFileSync("apps/eidos-lite-desktop/package.json", "utf8")
)
assert.equal(lite.version, "0.30.0-rc.0")
assert.equal(lite.dependencies[names[0]], version)
for (const name of names.slice(1))
  assert.equal(lite.optionalDependencies[name], version)
assert(
  fs
    .readFileSync(
      "apps/eidos-lite-desktop/src/main/graft/graft-client.ts",
      "utf8"
    )
    .includes(`GRAFT_SDK_VERSION = "${version}"`)
)
fs.writeFileSync("pnpm-workspace.yaml", workspace)
fs.mkdirSync("candidate-evidence", { recursive: true })
fs.writeFileSync(
  "candidate-evidence/input-attestation.json",
  JSON.stringify(
    {
      version,
      packages: entries,
      runtimeSource: "5038d986a16d3470ba5e8422bf2616f3086326d6",
      ciSource: process.env.GITHUB_SHA,
      registryReleaseGate:
        "must remain blocked for these unpublished file inputs",
    },
    null,
    2
  ) + "\n"
)
console.log(
  "Verified complete private SDK cohort; prepared real offline dependency inputs"
)
