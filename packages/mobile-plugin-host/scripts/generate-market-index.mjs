import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"
import { build } from "../../plugin-runtime/node_modules/esbuild/lib/main.js"
import { validatorFingerprint } from "../market-index.mjs"

const directory = process.argv[2]
assert.ok(
  directory,
  "Pass a directory containing registry.json and its published archives"
)
const indexUrl = new URL("../market-index.json", import.meta.url)
const { held } = JSON.parse(await readFile(indexUrl, "utf8"))
const registry = JSON.parse(
  await readFile(path.join(directory, "registry.json"), "utf8")
)
assert.equal(registry.schemaVersion, 1)
const temporary = await mkdtemp(path.join(tmpdir(), "eidos-market-validator-"))
const validator = path.join(temporary, "validator.cjs")
let validatePackage
try {
  await build({
    entryPoints: [
      fileURLToPath(new URL("../src/validate.ts", import.meta.url)),
    ],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: validator,
    plugins: [
      {
        name: "mobile-validation-toolchain",
        setup(builder) {
          builder.onResolve({ filter: /^\.\/toolchain$/ }, () => ({
            path: fileURLToPath(
              new URL("../src/browser-toolchain.ts", import.meta.url)
            ),
          }))
        },
      },
    ],
  })
  validatePackage = createRequire(import.meta.url)(validator).validatePackage
} finally {
  await rm(temporary, { recursive: true })
}
const checked = Object.create(null)
const ids = new Set()
const limit = 16 * 1024 * 1024
for (const { id, version, repo, tag, asset, sha256 } of registry.plugins) {
  assert.match(id, /^[a-z][a-z0-9.-]{1,127}$/)
  assert.ok(!ids.has(id), `Duplicate registry ID: ${id}`)
  ids.add(id)
  assert.match(version, /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/)
  assert.match(repo, /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/)
  assert.match(tag, /^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  assert.equal(asset, `${id}-${version}.eidos-plugin`)
  const archive = await readFile(path.join(directory, asset))
  assert.ok(archive.length <= limit)
  assert.equal(createHash("sha256").update(archive).digest("hex"), sha256)
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(
    gunzipSync(archive, { maxOutputLength: limit })
  )
  const { manifest } = JSON.parse(raw)
  assert.equal(manifest.id, id)
  assert.equal(manifest.version, version)
  const key = `${id}@${version}:${sha256}:https://github.com/${repo}/releases/download/${tag}/${asset}`
  try {
    const manifest = validatePackage(raw)
    assert.ok(JSON.stringify({ manifest }).length < 256 * 1024)
    checked[key] = true
  } catch (error) {
    // Only explicit compatibility rejections may be cached. A validator or
    // package error should leave the client free to retry its own checks.
    if (
      ["移动端不支持插件主题", "此插件需要移动端尚未支持的能力"].includes(
        error.message
      )
    ) {
      checked[key] = false
      console.log(`${id} ${version} is incompatible: ${error.message}`)
    } else {
      console.log(
        `${id} ${version} requires live verification: ${error.message}`
      )
    }
  }
}
await writeFile(
  indexUrl,
  JSON.stringify(
    { validator: validatorFingerprint(), checked, held },
    null,
    2
  ) + "\n"
)
