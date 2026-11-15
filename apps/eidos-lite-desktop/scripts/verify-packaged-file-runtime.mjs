// Run through scripts/run-electron-node.mjs; no application window is opened.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { pathToFileURL } from "node:url"

if (!process.argv[2]) throw new Error("Pass the packaged app.asar path")
const archive = path.resolve(process.argv[2])
const resources = fs.realpathSync(path.dirname(archive))
function packagedFile(file) {
  const resolved = fs.realpathSync(file)
  const relative = path.relative(resources, resolved)
  assert.ok(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    `Packaged dependency resolves outside Contents/Resources: ${resolved}`
  )
  const bytes = fs.readFileSync(resolved)
  return {
    path: resolved,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
}
function packageManifest(entry, name) {
  let directory = path.dirname(entry)
  while (directory !== resources && directory !== path.dirname(directory)) {
    const file = path.join(directory, "package.json")
    if (fs.existsSync(file)) {
      const manifest = JSON.parse(fs.readFileSync(file, "utf8"))
      if (manifest.name === name)
        return { ...packagedFile(file), version: manifest.version }
    }
    directory = path.dirname(directory)
  }
  throw new Error(`Packaged dependency manifest is missing: ${name}`)
}
const filePackage = path.join(
  archive,
  "node_modules/@eidos.space/eidos-file/package.json"
)
const fileManifest = JSON.parse(fs.readFileSync(filePackage, "utf8"))
const fileRequire = createRequire(filePackage)
const csvEntry = packagedFile(fileRequire.resolve("csv-parse/browser/esm/sync"))
const csvManifest = packageManifest(csvEntry.path, "csv-parse")
assert.ok(fileManifest.dependencies["csv-parse"])
const runtime = await import(
  pathToFileURL(
    path.join(archive, "node_modules/@eidos.space/eidos-file/dist/index.mjs")
  ).href
)
assert.deepEqual(
  runtime.prepareEidosFileCsvImport({
    name: "packaged.csv",
    content: 'Title,Note\nPackaged,"hello, world"\n',
  }).rows,
  [{ Title: "Packaged", Note: "hello, world" }]
)
console.log(
  JSON.stringify({
    ok: true,
    archive,
    dependencies: {
      "csv-parse": { entry: csvEntry, manifest: csvManifest },
    },
    nodePathProvided: Boolean(process.env.NODE_PATH),
    csvParsing: true,
  })
)
