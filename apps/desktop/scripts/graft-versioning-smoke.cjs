const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { pathToFileURL } = require("node:url")

// better-sqlite3 reads SQLITE_USE_URI when its native addon is loaded.
// Keep this before require("better-sqlite3") so Windows treats file: URLs as
// SQLite URI filenames instead of ordinary paths.
process.env.SQLITE_USE_URI = "1"

const Database = require("better-sqlite3")

function findGraftLibrary() {
  const extByPlatform = {
    darwin: "dylib",
    linux: "so",
    win32: "dll",
  }
  const ext = extByPlatform[process.platform]
  if (!ext) {
    throw new Error(`Unsupported platform: ${process.platform}`)
  }

  const libPath = path.join(__dirname, "..", "dist-sqlite-ext", `libgraft.${ext}`)
  if (!fs.existsSync(libPath)) {
    throw new Error(`Graft SQLite extension not found: ${libPath}`)
  }
  return libPath
}

function graftDbUri(dbPath) {
  const url = pathToFileURL(dbPath)
  url.searchParams.set("vfs", "graft")
  return url.href
}

function quotePragma(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function main() {
  const libPath = findGraftLibrary()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-graft-smoke-"))
  const eidosDir = path.join(root, ".eidos")
  const dbPath = path.join(eidosDir, "db.sqlite3")
  fs.mkdirSync(eidosDir, { recursive: true })

  console.log("Smoke root:", root)
  console.log("Graft extension:", libPath)
  console.log("SQLite URI support:", process.env.SQLITE_USE_URI)

  let db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.exec(`
    CREATE TABLE eidos__kv (key TEXT PRIMARY KEY, value TEXT);
    INSERT INTO eidos__kv VALUES ('eidos:space:settings:doc', '{"ok":true}');
    CREATE TABLE smoke_rows (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO smoke_rows (name) VALUES ('before-versioning');
  `)
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  db.pragma("journal_mode = DELETE")
  db.pragma("page_size = 4096")
  db.exec("VACUUM")
  db.close()

  const registrationDb = new Database(":memory:")
  try {
    registrationDb.loadExtension(libPath)
  } finally {
    registrationDb.close()
  }

  const uri = graftDbUri(dbPath)
  console.log("Opening graft URI:", uri)

  db = new Database(uri)
  try {
    db.pragma("page_size = 4096")
    db.pragma("journal_mode = MEMORY")
    db.pragma("graft_init")
    db.pragma("graft_add")
    db.pragma(`graft_commit = ${quotePragma("Initial version")}`)

    const row = db.prepare("SELECT name FROM smoke_rows WHERE id = 1").get()
    if (row?.name !== "before-versioning") {
      throw new Error(`Unexpected smoke row: ${JSON.stringify(row)}`)
    }

    const status = db.pragma("graft_json_status")
    console.log("Graft status:", JSON.stringify(status))
  } finally {
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  }
}

try {
  main()
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
