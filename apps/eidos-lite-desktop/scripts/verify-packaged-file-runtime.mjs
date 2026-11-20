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
const timeZoneEntry = packagedFile(fileRequire.resolve("moment-timezone"))
const timeZoneManifest = packageManifest(timeZoneEntry.path, "moment-timezone")
const timeZoneRequire = createRequire(timeZoneEntry.path)
const momentEntry = packagedFile(timeZoneRequire.resolve("moment"))
const momentManifest = packageManifest(momentEntry.path, "moment")
assert.ok(fileManifest.dependencies["csv-parse"])
assert.equal(
  fileManifest.dependencies["moment-timezone"],
  timeZoneManifest.version
)
assert.equal(fileManifest.dependencies.moment, momentManifest.version)
const runtime = await import(
  pathToFileURL(
    path.join(archive, "node_modules/@eidos.space/eidos-file/dist/index.mjs")
  ).href
)
const window = runtime.eidosFileCalendarWindowBounds(
  { direction: "past", unit: "day", count: 1 },
  {
    timeZone: "America/New_York",
    timeZoneData: runtime.EIDOS_FILE_CALENDAR_TIME_ZONE_DATA,
    weekStartsOn: 1,
  },
  "2026-03-09T12:00:00.000Z"
)
assert.deepEqual(window.intervals, [
  ["2026-03-08T05:00:00.000Z", "2026-03-10T04:00:00.000Z"],
])
assert.deepEqual(
  runtime.prepareEidosFileCsvImport({
    name: "packaged.csv",
    content: 'Title,Note\nPackaged,"hello, world"\n',
  }).rows,
  [{ Title: "Packaged", Note: "hello, world" }]
)
assert.equal(
  runtime.eidosFileTemporalDefaultValue(
    "date",
    { defaultValue: "now" },
    "2026-11-18T16:00:00.000Z",
    {
      timeZone: "Asia/Shanghai",
      timeZoneData: runtime.EIDOS_FILE_CALENDAR_TIME_ZONE_DATA,
    }
  ),
  "2026-11-19"
)
console.log(
  JSON.stringify({
    ok: true,
    archive,
    dependencies: {
      "csv-parse": { entry: csvEntry, manifest: csvManifest },
      moment: { entry: momentEntry, manifest: momentManifest },
      "moment-timezone": { entry: timeZoneEntry, manifest: timeZoneManifest },
    },
    nodePathProvided: Boolean(process.env.NODE_PATH),
    csvParsing: true,
    localDateDefaults: true,
    dayWindowAcrossDst: true,
    timeZoneData: runtime.EIDOS_FILE_CALENDAR_TIME_ZONE_DATA,
  })
)
