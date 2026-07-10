const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

// better-sqlite3 reads SQLITE_USE_URI when its native addon is loaded.
// Keep this before require("better-sqlite3") so Windows treats file: URLs as
// SQLite URI filenames instead of ordinary paths.
process.env.SQLITE_USE_URI = "1"

const Database = require("better-sqlite3")

const FILE_SPACE_IGNORE = [
  ".graft/",
  ".eidos/db.sqlite3",
  ".eidos/cache/",
  ".eidos/indexes/",
  ".eidos/sessions/",
  ".eidos/state/",
  ".eidos/secrets/",
  ".eidos/secrets.*",
  ".DS_Store",
  "*.tmp",
  "",
].join("\n")

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

  const libPath = path.join(
    __dirname,
    "..",
    "dist-sqlite-ext",
    `libgraft.${ext}`
  )
  if (!fs.existsSync(libPath)) {
    throw new Error(`Graft SQLite extension not found: ${libPath}`)
  }
  return libPath
}

function findGraftCli() {
  const fileName = process.platform === "win32" ? "graft.exe" : "graft"
  const cliPath = path.join(__dirname, "..", "dist-cli", fileName)
  if (!fs.existsSync(cliPath)) {
    throw new Error(`Graft CLI not found: ${cliPath}`)
  }
  return cliPath
}

function graftDbUri(dbPath) {
  if (process.platform === "win32") {
    return `file:${dbPath}?vfs=graft`
  }
  const { pathToFileURL } = require("node:url")
  const url = pathToFileURL(dbPath)
  url.searchParams.set("vfs", "graft")
  return url.href
}

function quotePragma(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function removeTempRoot(root) {
  try {
    fs.rmSync(root, { recursive: true, force: true })
  } catch (error) {
    console.warn("Could not remove smoke temp directory:", error)
  }
}

function closeDatabase(db) {
  if (!db) return
  try {
    db.close()
  } catch (error) {
    console.warn("Could not close smoke database:", error)
  }
}

function runSqliteExtensionSmoke() {
  const libPath = findGraftLibrary()
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-extension-smoke-")
  )
  const eidosDir = path.join(root, ".eidos")
  const dbPath = path.join(eidosDir, "db.sqlite3")
  fs.mkdirSync(eidosDir, { recursive: true })

  console.log("SQLite extension smoke root:", root)
  console.log("Graft extension:", libPath)
  console.log("SQLite URI support:", process.env.SQLITE_USE_URI)

  let db
  try {
    db = new Database(dbPath)
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
    closeDatabase(db)
    db = undefined

    const registrationDb = new Database(":memory:")
    try {
      registrationDb.loadExtension(libPath)
    } finally {
      registrationDb.close()
    }

    const uri = graftDbUri(dbPath)
    console.log("Opening graft URI:", uri)

    db = new Database(uri)
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
    console.log("Graft extension status:", JSON.stringify(status))
  } finally {
    closeDatabase(db)
    removeTempRoot(root)
  }
}

function formatCommand(args) {
  return args
    .map((arg) => (/^[A-Za-z0-9_./:-]+$/.test(arg) ? arg : JSON.stringify(arg)))
    .join(" ")
}

function runGraft(cliPath, cwd, args) {
  console.log(`graft ${formatCommand(args)}`)
  try {
    const output = execFileSync(cliPath, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
    if (output) console.log(output)
    return output
  } catch (error) {
    const stdout = String(error.stdout || "").trim()
    const stderr = String(error.stderr || "").trim()
    const detail = [stdout, stderr].filter(Boolean).join("\n")
    throw new Error(
      `graft ${formatCommand(args)} failed${detail ? `:\n${detail}` : ""}`,
      { cause: error }
    )
  }
}

function runGraftJson(cliPath, cwd, args) {
  const output = runGraft(cliPath, cwd, args)
  if (!output) {
    throw new Error(`graft ${formatCommand(args)} returned no JSON output`)
  }
  try {
    return JSON.parse(output)
  } catch (error) {
    throw new Error(
      `graft ${formatCommand(args)} returned invalid JSON: ${output}`,
      { cause: error }
    )
  }
}

function runGraftExpectFailure(cliPath, cwd, args) {
  console.log(`graft ${formatCommand(args)} (expect failure)`)
  try {
    execFileSync(cliPath, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    const stdout = String(error.stdout || "").trim()
    const stderr = String(error.stderr || "").trim()
    const detail = [stdout, stderr].filter(Boolean).join("\n")
    if (detail) console.log(detail)
    return detail
  }
  throw new Error(`graft ${formatCommand(args)} unexpectedly succeeded`)
}

function payloadPaths(payload) {
  if (!Array.isArray(payload?.paths)) {
    throw new Error(`Expected a paths array: ${JSON.stringify(payload)}`)
  }
  return payload.paths.map((entry) =>
    typeof entry === "string" ? entry : entry?.path
  )
}

function assertPaths(payload, expectedPaths, excludedPaths) {
  const paths = new Set(payloadPaths(payload))
  for (const expectedPath of expectedPaths) {
    if (!paths.has(expectedPath)) {
      throw new Error(
        `Expected ${expectedPath} in Graft paths: ${JSON.stringify([...paths])}`
      )
    }
  }
  for (const excludedPath of excludedPaths) {
    if (paths.has(excludedPath)) {
      throw new Error(
        `Ignored path ${excludedPath} appeared in Graft paths: ${JSON.stringify([...paths])}`
      )
    }
  }
}

function assertPayloadOmitsPath(payload, excludedPath) {
  if (JSON.stringify(payload).includes(excludedPath)) {
    throw new Error(
      `Ignored path ${excludedPath} appeared in Graft output: ${JSON.stringify(payload)}`
    )
  }
}

function runFileSpaceCliSmoke() {
  const cliPath = findGraftCli()
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-file-space-smoke-")
  )
  const notePath = "note.md"
  const assetPath = "assets/image.png"
  const gonePath = "archive/gone.md"
  const laterPath = "later.md"
  const sessionPath = ".eidos/sessions/session.jsonl"
  const initialNote = "# Smoke note\n\nHello Graft.\n"
  const initialAsset = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])
  const initialGone = "Restore me from the first version.\n"

  console.log("File Space smoke root:", root)
  console.log("Graft CLI:", cliPath)

  try {
    fs.mkdirSync(path.join(root, "assets"), { recursive: true })
    fs.mkdirSync(path.join(root, "archive"), { recursive: true })
    fs.mkdirSync(path.join(root, ".eidos", "sessions"), { recursive: true })
    fs.writeFileSync(path.join(root, notePath), initialNote)
    fs.writeFileSync(path.join(root, assetPath), initialAsset)
    fs.writeFileSync(path.join(root, gonePath), initialGone)
    fs.writeFileSync(
      path.join(root, sessionPath),
      '{"kind":"private-runtime-state"}\n'
    )
    fs.writeFileSync(path.join(root, ".graftignore"), FILE_SPACE_IGNORE)
    // Eidos creates the directory first so it can hold the cross-process lock.
    // Graft init must repair this valid partial-initialization state.
    fs.mkdirSync(path.join(root, ".graft"))

    const init = runGraftJson(cliPath, root, ["init", "--json"])
    if (
      init.operation !== "init" ||
      !fs.existsSync(path.join(root, ".graft"))
    ) {
      throw new Error(
        `Graft repository was not initialized: ${JSON.stringify(init)}`
      )
    }

    const initialStatus = runGraftJson(cliPath, root, ["status", "--json"])
    assertPaths(initialStatus, [notePath, assetPath, gonePath], [sessionPath])

    const add = runGraftJson(cliPath, root, ["add", "--all", "--json"])
    assertPaths(add, [notePath, assetPath, gonePath], [sessionPath])

    const stagedStatus = runGraftJson(cliPath, root, ["status", "--json"])
    assertPaths(stagedStatus, [notePath, assetPath, gonePath], [sessionPath])

    const commit = runGraftJson(cliPath, root, [
      "commit",
      "--json",
      "-m",
      "Initial file Space version",
    ])
    if (!commit.commit?.id) {
      throw new Error(
        `Graft commit returned no commit id: ${JSON.stringify(commit)}`
      )
    }
    assertPaths(commit, [notePath, assetPath, gonePath], [sessionPath])

    const cleanStatus = runGraftJson(cliPath, root, ["status", "--json"])
    if (cleanStatus.dirty || payloadPaths(cleanStatus).length !== 0) {
      throw new Error(
        `Expected a clean Graft worktree after commit: ${JSON.stringify(cleanStatus)}`
      )
    }
    assertPayloadOmitsPath(cleanStatus, sessionPath)

    const history = runGraftJson(cliPath, root, ["log", "--json"])
    if (!Array.isArray(history.commits) || history.commits.length === 0) {
      throw new Error(
        `Graft log returned no commits: ${JSON.stringify(history)}`
      )
    }
    if (!history.commits.some((entry) => entry.id === commit.commit.id)) {
      throw new Error(
        `Graft log did not include commit ${commit.commit.id}: ${JSON.stringify(history)}`
      )
    }
    assertPayloadOmitsPath(history, sessionPath)

    fs.appendFileSync(path.join(root, notePath), "\nA second version.\n")
    fs.writeFileSync(path.join(root, assetPath), Buffer.from([1, 2, 3, 4]))
    fs.rmSync(path.join(root, "archive"), { recursive: true })
    fs.writeFileSync(
      path.join(root, laterPath),
      "Only in the second version.\n"
    )
    const secondAdd = runGraftJson(cliPath, root, ["add", "--all", "--json"])
    assertPaths(
      secondAdd,
      [notePath, assetPath, gonePath, laterPath],
      [sessionPath]
    )

    const secondCommit = runGraftJson(cliPath, root, [
      "commit",
      "--json",
      "-m",
      "Update smoke note",
    ])
    if (!secondCommit.commit?.id) {
      throw new Error(
        `Second Graft commit returned no commit id: ${JSON.stringify(secondCommit)}`
      )
    }

    const detail = runGraftJson(cliPath, root, [
      "show",
      "--json",
      "--",
      secondCommit.commit.id,
    ])
    if (detail.id !== secondCommit.commit.id) {
      throw new Error(
        `Graft show returned the wrong commit: ${JSON.stringify(detail)}`
      )
    }
    assertPayloadOmitsPath(detail, sessionPath)

    const diff = runGraftJson(cliPath, root, [
      "diff",
      "--json",
      "--",
      commit.commit.id,
      secondCommit.commit.id,
    ])
    assertPaths(diff, [notePath, assetPath, gonePath, laterPath], [sessionPath])

    const updatedHistory = runGraftJson(cliPath, root, ["log", "--json"])
    if (
      !Array.isArray(updatedHistory.commits) ||
      updatedHistory.commits.length < 2
    ) {
      throw new Error(
        `Graft log did not include both versions: ${JSON.stringify(updatedHistory)}`
      )
    }
    assertPayloadOmitsPath(updatedHistory, sessionPath)

    const headBeforeRestore = updatedHistory.current_head
    const historyLengthBeforeRestore = updatedHistory.commits.length
    runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--source",
      commit.commit.id,
      "--",
      notePath,
    ])
    runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--source",
      commit.commit.id,
      "--",
      assetPath,
    ])
    runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--source",
      commit.commit.id,
      "--",
      gonePath,
    ])
    runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--source",
      commit.commit.id,
      "--",
      laterPath,
    ])

    if (fs.readFileSync(path.join(root, notePath), "utf8") !== initialNote) {
      throw new Error("Text restore did not recover the first version")
    }
    if (!fs.readFileSync(path.join(root, assetPath)).equals(initialAsset)) {
      throw new Error("Binary restore did not recover the first version")
    }
    if (fs.readFileSync(path.join(root, gonePath), "utf8") !== initialGone) {
      throw new Error(
        "Restore did not recreate a deleted file and its missing parent"
      )
    }
    if (fs.existsSync(path.join(root, laterPath))) {
      throw new Error("Restore did not recover the selected version's deletion")
    }

    const restoredStatus = runGraftJson(cliPath, root, ["status", "--json"])
    assertPaths(
      restoredStatus,
      [notePath, assetPath, gonePath, laterPath],
      [sessionPath]
    )
    if (restoredStatus.has_staged_changes) {
      throw new Error(
        `Restore unexpectedly changed the index: ${JSON.stringify(restoredStatus)}`
      )
    }

    const historyAfterRestore = runGraftJson(cliPath, root, ["log", "--json"])
    if (
      historyAfterRestore.current_head !== headBeforeRestore ||
      historyAfterRestore.commits.length !== historyLengthBeforeRestore
    ) {
      throw new Error(
        `Restore changed version history: ${JSON.stringify(historyAfterRestore)}`
      )
    }
  } finally {
    removeTempRoot(root)
  }
}

function runRestoreConflictSmoke() {
  const cliPath = findGraftCli()
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-restore-conflict-smoke-")
  )
  const notePath = "note.md"

  console.log("Restore conflict smoke root:", root)

  try {
    fs.writeFileSync(path.join(root, notePath), "base\n")
    runGraftJson(cliPath, root, ["init", "--json"])
    runGraftJson(cliPath, root, ["add", "--all", "--json"])
    runGraftJson(cliPath, root, [
      "commit",
      "--json",
      "-m",
      "Base conflict note",
    ])
    runGraftJson(cliPath, root, ["branch", "--json", "feature/restore"])
    runGraftJson(cliPath, root, ["switch", "--json", "feature/restore"])
    fs.writeFileSync(path.join(root, notePath), "feature\n")
    runGraftJson(cliPath, root, ["add", "--all", "--json"])
    runGraftJson(cliPath, root, [
      "commit",
      "--json",
      "-m",
      "Feature conflict note",
    ])
    runGraftJson(cliPath, root, ["switch", "--json", "main"])
    fs.writeFileSync(path.join(root, notePath), "main\n")
    runGraftJson(cliPath, root, ["add", "--all", "--json"])
    runGraftJson(cliPath, root, [
      "commit",
      "--json",
      "-m",
      "Main conflict note",
    ])
    const merge = runGraftJson(cliPath, root, [
      "merge",
      "--json",
      "feature/restore",
    ])
    if (
      !Array.isArray(merge.conflicted) ||
      !merge.conflicted.includes(notePath)
    ) {
      throw new Error(`Expected a note conflict: ${JSON.stringify(merge)}`)
    }

    const beforeRestore = fs.readFileSync(path.join(root, notePath))
    const restoreError = runGraftExpectFailure(cliPath, root, [
      "restore",
      "--json",
      "--source",
      "HEAD~1",
      "--",
      notePath,
    ])
    if (!restoreError.includes("unresolved index conflicts")) {
      throw new Error(`Restore returned the wrong conflict: ${restoreError}`)
    }
    if (!fs.readFileSync(path.join(root, notePath)).equals(beforeRestore)) {
      throw new Error("A rejected restore changed a conflicted worktree file")
    }

    const status = runGraftJson(cliPath, root, ["status", "--json"])
    if (!status.has_conflicts || status.dirty || status.has_unstaged_changes) {
      throw new Error(
        `Rejected restore changed repository status: ${JSON.stringify(status)}`
      )
    }
  } finally {
    removeTempRoot(root)
  }
}

try {
  runSqliteExtensionSmoke()
  runFileSpaceCliSmoke()
  runRestoreConflictSmoke()
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
