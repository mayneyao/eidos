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
const timeZoneEntry = packagedFile(fileRequire.resolve("moment-timezone"))
const timeZoneRequire = createRequire(timeZoneEntry.path)
const momentEntry = packagedFile(timeZoneRequire.resolve("moment"))
const csvEntry = packagedFile(fileRequire.resolve("csv-parse/browser/esm/sync"))
const timeZoneManifest = packageManifest(timeZoneEntry.path, "moment-timezone")
const momentManifest = packageManifest(momentEntry.path, "moment")
const csvManifest = packageManifest(csvEntry.path, "csv-parse")
assert.equal(
  timeZoneManifest.version,
  fileManifest.dependencies["moment-timezone"]
)
assert.equal(momentManifest.version, fileManifest.dependencies.moment)
const ruleData = packagedFile(
  fileRequire.resolve("moment-timezone/data/packed/latest.json")
)
const timeZone = fileRequire("moment-timezone")
const moment = timeZoneRequire("moment")
assert.equal(timeZone.tz.version, timeZoneManifest.version)
assert.equal(moment.version, momentManifest.version)
const runtime = await import(
  pathToFileURL(
    path.join(archive, "node_modules/@eidos.space/eidos-file/dist/index.mjs")
  ).href
)
const profile = runtime.EIDOS_FILE_CALENDAR_TIME_ZONE_DATA
assert.equal(timeZone.tz.dataVersion, profile)
assert.equal(
  JSON.parse(fs.readFileSync(ruleData.path, "utf8")).version,
  profile
)
const instant = "2026-11-12T12:34:56.123Z"
const parts = runtime.projectEidosFileCalendarInstant(
  instant,
  "Asia/Kathmandu",
  profile
)
assert.deepEqual(parts, {
  year: 2026,
  month: 11,
  day: 12,
  hour: 18,
  minute: 19,
  second: 56,
  millisecond: 123,
})
assert.equal(
  runtime.resolveEidosFileCalendarInstant(parts, "Asia/Kathmandu", profile),
  instant
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
    calendarProfile: profile,
    dependencies: {
      "moment-timezone": { entry: timeZoneEntry, manifest: timeZoneManifest },
      moment: { entry: momentEntry, manifest: momentManifest },
      "csv-parse": { entry: csvEntry, manifest: csvManifest },
    },
    ruleData,
    nodePathProvided: Boolean(process.env.NODE_PATH),
    calendarRoundtrip: true,
    csvParsing: true,
  })
)
