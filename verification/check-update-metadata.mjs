import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { inflateRawSync } from "node:zlib"
import {
  getEidosLiteUpdateRoute,
  releaseAssetNameForLiteUpdate,
} from "../apps/download/src/release-routing.mjs"

const root = process.cwd()
const require = createRequire(
  path.join(root, "apps/eidos-lite-desktop/package.json")
)
const { parse } = require("yaml")
const output = path.join(root, "apps/eidos-lite-desktop/dist-app")
const source =
  process.platform === "darwin"
    ? "latest-mac.yml"
    : process.platform === "win32"
      ? "latest.yml"
      : process.arch === "arm64"
        ? "latest-linux-arm64.yml"
        : "latest-linux.yml"
const bytes = fs.readFileSync(path.join(output, source))
const metadata = parse(bytes.toString("utf8"))
assert.equal(metadata.version, "0.30.0-rc.0")
assert(Array.isArray(metadata.files) && metadata.files.length > 0)
const extensions = new Set()
const identities = []
for (const entry of metadata.files) {
  const name = decodeURIComponent(entry.url)
  assert.equal(path.basename(name), name)
  assert(name.includes("0.30.0-rc.0"))
  const file = path.join(output, name)
  const contents = fs.readFileSync(file)
  assert.equal(contents.length, entry.size)
  assert.equal(
    createHash("sha512").update(contents).digest("base64"),
    entry.sha512
  )
  if (name.endsWith(".AppImage")) {
    const size = contents.readUInt32BE(contents.length - 4)
    assert.equal(size, entry.blockMapSize)
    const blockmap = JSON.parse(
      inflateRawSync(
        contents.subarray(contents.length - 4 - size, contents.length - 4)
      ).toString("utf8")
    )
    assert.equal(blockmap.version, "2")
    assert.equal(
      blockmap.files.reduce(
        (sum, file) => sum + file.sizes.reduce((sum, value) => sum + value, 0),
        0
      ),
      contents.length - size - 4
    )
  }
  extensions.add(path.extname(name))
  identities.push({
    name,
    bytes: contents.length,
    sha512: entry.sha512,
    blockMapSize: entry.blockMapSize,
  })
}
const needed =
  process.platform === "darwin"
    ? [".dmg", ".zip"]
    : process.platform === "win32"
      ? [".exe"]
      : [".deb", ".AppImage"]
for (const extension of needed)
  assert(
    extensions.has(extension),
    `Missing ${extension} from actual builder metadata`
  )
const preferred = metadata.files.find((entry) => entry.url === metadata.path)
assert(preferred && preferred.sha512 === metadata.sha512)
const platform =
  process.platform === "darwin"
    ? "mac"
    : process.platform === "win32"
      ? "win"
      : "linux"
const basename =
  process.platform === "darwin"
    ? "beta-mac.yml"
    : process.platform === "win32"
      ? "beta.yml"
      : "beta-linux.yml"
const route = getEidosLiteUpdateRoute(
  `/lite/updates/beta/${process.arch}/${basename}`
)
const expected = `beta-${platform}-${process.arch}.yml`
assert.equal(releaseAssetNameForLiteUpdate(route), expected)
fs.mkdirSync("candidate-evidence/update-metadata", { recursive: true })
fs.writeFileSync(
  path.join("candidate-evidence/update-metadata", expected),
  bytes
)
fs.writeFileSync(
  "candidate-evidence/update-metadata/result.json",
  JSON.stringify(
    {
      status: "passed",
      source,
      normalized: expected,
      version: metadata.version,
      files: identities,
      routingCheckedStatically: true,
      productionRoutingChanged: false,
    },
    null,
    2
  ) + "\n"
)
console.log(
  "Actual update metadata, artifact hashes, embedded AppImage blockmap and static beta route agree"
)
