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

function runGraftPragmaJson(db, name, argument) {
  const statement =
    argument === undefined ? name : `${name} = ${quotePragma(argument)}`
  const raw = db.pragma(statement, { simple: true })
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(`${name} returned an empty JSON response`)
  }
  return JSON.parse(raw)
}

function runPersistentFileSpacePragmaSmoke() {
  const cliPath = findGraftCli()
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-persistent-smoke-")
  )
  const notePath = "notes/today.md"
  let db

  console.log("Persistent Graft smoke root:", root)
  try {
    fs.mkdirSync(path.join(root, "notes"), { recursive: true })
    fs.writeFileSync(path.join(root, notePath), "first\n")
    runGraftJson(cliPath, root, ["init", "--json"])

    db = new Database(graftDbUri(path.join(root, ".graft", "control.sqlite")))
    runGraftPragmaJson(db, "graft_json_add", '-- "notes"')
    const first = runGraftPragmaJson(
      db,
      "graft_json_commit",
      "First persistent version"
    )

    fs.writeFileSync(path.join(root, notePath), "second\n")
    const dirty = runGraftPragmaJson(db, "graft_json_status")
    if (!dirty.has_unstaged_changes) {
      throw new Error(`Persistent status missed the edit: ${JSON.stringify(dirty)}`)
    }
    runGraftPragmaJson(db, "graft_json_add", '-- "notes"')
    const second = runGraftPragmaJson(
      db,
      "graft_json_commit",
      "Second persistent version"
    )

    const firstPage = runGraftPragmaJson(
      db,
      "graft_json_log",
      "--with-status --limit 1"
    )
    if (
      firstPage.commits?.[0]?.id !== second.current_head ||
      firstPage.has_more !== true ||
      !firstPage.next_cursor
    ) {
      throw new Error(`Invalid first history page: ${JSON.stringify(firstPage)}`)
    }
    const secondPage = runGraftPragmaJson(
      db,
      "graft_json_log",
      `--with-status --limit 1 --after ${firstPage.next_cursor}`
    )
    if (
      secondPage.commits?.[0]?.id !== first.current_head ||
      secondPage.has_more !== false
    ) {
      throw new Error(`Invalid second history page: ${JSON.stringify(secondPage)}`)
    }

    const startedAt = performance.now()
    for (let index = 0; index < 25; index += 1) {
      runGraftPragmaJson(db, "graft_json_status")
    }
    const averageMs = (performance.now() - startedAt) / 25
    console.log(`Persistent Graft status average: ${averageMs.toFixed(2)}ms`)
  } finally {
    closeDatabase(db)
    removeTempRoot(root)
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

function commitAll(cliPath, root, message) {
  runGraftJson(cliPath, root, ["add", "--all", "--json"])
  const result = runGraftJson(cliPath, root, [
    "commit",
    "--json",
    "-m",
    message,
  ])
  if (!result.commit?.id) {
    throw new Error(
      `Graft commit returned no commit id: ${JSON.stringify(result)}`
    )
  }
  return result.commit.id
}

function captureRepoSnapshot(cliPath, root) {
  const history = runGraftJson(cliPath, root, ["log", "--json"])
  const index = runGraftJson(cliPath, root, ["ls-files", "--json", "--stage"])
  if (!Array.isArray(history.commits) || !Array.isArray(index.paths)) {
    throw new Error(
      `Could not capture Graft repository state: ${JSON.stringify({ history, index })}`
    )
  }
  return {
    head: history.current_head,
    commitIds: history.commits.map((commit) => commit.id),
    indexPaths: index.paths,
  }
}

function assertRepoSnapshotUnchanged(cliPath, root, before, operation) {
  const after = captureRepoSnapshot(cliPath, root)
  if (
    after.head !== before.head ||
    JSON.stringify(after.commitIds) !== JSON.stringify(before.commitIds) ||
    JSON.stringify(after.indexPaths) !== JSON.stringify(before.indexPaths)
  ) {
    throw new Error(
      `${operation} changed HEAD, history, or the index: ${JSON.stringify({ before, after })}`
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
  const quotedPath = "notes/John's  note.md"
  const sessionPath = ".eidos/sessions/session.jsonl"
  const initialNote = "# Smoke note\n\nHello Graft.\n"
  const updatedNote = `${initialNote}\nA second version.\n`
  const initialAsset = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ])
  const initialGone = "Restore me from the first version.\n"
  const initialQuoted = "A path with quotes and repeated spaces.\n"
  const updatedQuoted = "Updated quoted path.\n"

  console.log("File Space smoke root:", root)
  console.log("Graft CLI:", cliPath)

  try {
    fs.mkdirSync(path.join(root, "assets"), { recursive: true })
    fs.mkdirSync(path.join(root, "archive"), { recursive: true })
    fs.mkdirSync(path.join(root, "notes"), { recursive: true })
    fs.mkdirSync(path.join(root, ".eidos", "sessions"), { recursive: true })
    fs.writeFileSync(path.join(root, notePath), initialNote)
    fs.writeFileSync(path.join(root, assetPath), initialAsset)
    fs.writeFileSync(path.join(root, gonePath), initialGone)
    fs.writeFileSync(path.join(root, quotedPath), initialQuoted)
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
    assertPaths(
      initialStatus,
      [notePath, assetPath, gonePath, quotedPath],
      [sessionPath]
    )

    const add = runGraftJson(cliPath, root, ["add", "--all", "--json"])
    assertPaths(add, [notePath, assetPath, gonePath, quotedPath], [sessionPath])

    const stagedStatus = runGraftJson(cliPath, root, ["status", "--json"])
    assertPaths(
      stagedStatus,
      [notePath, assetPath, gonePath, quotedPath],
      [sessionPath]
    )

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
    assertPaths(
      commit,
      [notePath, assetPath, gonePath, quotedPath],
      [sessionPath]
    )

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

    const rootDiff = runGraftJson(cliPath, root, [
      "diff",
      "--json",
      "--root",
      commit.commit.id,
    ])
    if (rootDiff.from !== "root" || rootDiff.to !== commit.commit.id) {
      throw new Error(
        `Graft root diff returned the wrong revisions: ${JSON.stringify(rootDiff)}`
      )
    }
    assertPaths(
      rootDiff,
      [notePath, assetPath, gonePath, quotedPath],
      [sessionPath]
    )

    const rootContentDiff = runGraftJson(cliPath, root, [
      "diff",
      "--json",
      "--content",
      "--max-content-bytes",
      "1048576",
      "--root",
      commit.commit.id,
      "--",
      quotedPath,
    ])
    if (
      rootContentDiff.content?.before?.state !== "absent" ||
      rootContentDiff.content?.after?.state !== "utf8" ||
      rootContentDiff.content.after.content !== initialQuoted
    ) {
      throw new Error(
        `Graft root content diff returned the wrong file: ${JSON.stringify(rootContentDiff)}`
      )
    }

    fs.writeFileSync(path.join(root, notePath), updatedNote)
    fs.writeFileSync(path.join(root, assetPath), Buffer.from([1, 2, 3, 4]))
    fs.rmSync(path.join(root, "archive"), { recursive: true })
    fs.writeFileSync(
      path.join(root, laterPath),
      "Only in the second version.\n"
    )
    fs.writeFileSync(path.join(root, quotedPath), updatedQuoted)

    const worktreeContentDiff = runGraftJson(cliPath, root, [
      "diff",
      "--json",
      "--content",
      "--max-content-bytes",
      "1048576",
      "HEAD",
      "--",
      quotedPath,
    ])
    if (
      worktreeContentDiff.to !== "worktree" ||
      worktreeContentDiff.content?.before?.state !== "utf8" ||
      worktreeContentDiff.content.before.content !== initialQuoted ||
      worktreeContentDiff.content?.after?.state !== "utf8" ||
      worktreeContentDiff.content.after.content !== updatedQuoted
    ) {
      throw new Error(
        `Graft worktree content diff returned the wrong file: ${JSON.stringify(worktreeContentDiff)}`
      )
    }

    const includedQuoted = runGraftJson(cliPath, root, [
      "add",
      "--json",
      "--",
      quotedPath,
    ])
    if (
      JSON.stringify(payloadPaths(includedQuoted)) !==
      JSON.stringify([quotedPath])
    ) {
      throw new Error(
        `Graft single-path add included the wrong paths: ${JSON.stringify(includedQuoted)}`
      )
    }
    const includedStatus = runGraftJson(cliPath, root, ["status", "--json"])
    const includedEntry = includedStatus.paths.find(
      (entry) => entry.path === quotedPath
    )
    if (
      includedEntry?.index_status !== "modified" ||
      includedEntry?.worktree_status !== "none"
    ) {
      throw new Error(
        `Graft did not stage only the selected path: ${JSON.stringify(includedStatus)}`
      )
    }
    runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--staged",
      "--expected-head",
      commit.commit.id,
      "--",
      quotedPath,
    ])
    const excludedStatus = runGraftJson(cliPath, root, ["status", "--json"])
    const excludedEntry = excludedStatus.paths.find(
      (entry) => entry.path === quotedPath
    )
    if (
      excludedEntry?.index_status !== "none" ||
      excludedEntry?.worktree_status !== "modified"
    ) {
      throw new Error(
        `Graft did not unstage the selected path: ${JSON.stringify(excludedStatus)}`
      )
    }

    const secondAdd = runGraftJson(cliPath, root, ["add", "--all", "--json"])
    assertPaths(
      secondAdd,
      [notePath, assetPath, gonePath, laterPath, quotedPath],
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
    assertPaths(
      diff,
      [notePath, assetPath, gonePath, laterPath, quotedPath],
      [sessionPath]
    )

    const textContentDiff = runGraftJson(cliPath, root, [
      "diff",
      "--json",
      "--content",
      "--max-content-bytes",
      "1048576",
      "--",
      commit.commit.id,
      secondCommit.commit.id,
      notePath,
    ])
    if (
      textContentDiff.content?.before?.state !== "utf8" ||
      textContentDiff.content.before.content !== initialNote ||
      textContentDiff.content?.after?.state !== "utf8" ||
      textContentDiff.content.after.content !== updatedNote
    ) {
      throw new Error(
        `Graft text content diff returned the wrong revisions: ${JSON.stringify(textContentDiff)}`
      )
    }

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
    const staleHeadError = runGraftExpectFailure(cliPath, root, [
      "restore",
      "--json",
      "--expected-head",
      commit.commit.id,
      "--source",
      commit.commit.id,
      "--",
      notePath,
    ])
    if (!/HEAD changed/i.test(staleHeadError)) {
      throw new Error(
        `Graft returned the wrong stale-HEAD error: ${staleHeadError}`
      )
    }
    if (fs.readFileSync(path.join(root, notePath), "utf8") !== updatedNote) {
      throw new Error("A stale expected HEAD changed the worktree")
    }

    const localDraft = "Local draft must survive require-clean.\n"
    fs.writeFileSync(path.join(root, notePath), localDraft)
    const dirtyError = runGraftExpectFailure(cliPath, root, [
      "restore",
      "--json",
      "--expected-head",
      headBeforeRestore,
      "--require-clean",
      "--source",
      commit.commit.id,
      "--",
      notePath,
    ])
    if (!/tracked worktree changes/i.test(dirtyError)) {
      throw new Error(
        `Graft returned the wrong require-clean error: ${dirtyError}`
      )
    }
    if (fs.readFileSync(path.join(root, notePath), "utf8") !== localDraft) {
      throw new Error("A rejected require-clean restore changed the worktree")
    }
    fs.writeFileSync(path.join(root, notePath), updatedNote)

    runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--expected-head",
      headBeforeRestore,
      "--source",
      commit.commit.id,
      "--",
      notePath,
    ])
    runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--expected-head",
      headBeforeRestore,
      "--source",
      commit.commit.id,
      "--",
      assetPath,
    ])
    runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--expected-head",
      headBeforeRestore,
      "--source",
      commit.commit.id,
      "--",
      gonePath,
    ])
    runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--expected-head",
      headBeforeRestore,
      "--source",
      commit.commit.id,
      "--",
      laterPath,
    ])
    runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--expected-head",
      headBeforeRestore,
      "--source",
      commit.commit.id,
      "--",
      quotedPath,
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
    if (
      fs.readFileSync(path.join(root, quotedPath), "utf8") !== initialQuoted
    ) {
      throw new Error("Restore changed a quoted or repeated-space path")
    }

    const restoredStatus = runGraftJson(cliPath, root, ["status", "--json"])
    assertPaths(
      restoredStatus,
      [notePath, assetPath, gonePath, laterPath, quotedPath],
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

function runWholeSpaceRestoreSmoke() {
  const cliPath = findGraftCli()
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-whole-space-restore-smoke-")
  )
  const modifiedTextPath = "modified.md"
  const modifiedBinaryPath = "assets/modified.bin"
  const deletedTextPath = "missing/parent/deleted.md"
  const deletedBinaryPath = "missing/parent/deleted.bin"
  const addedTextPath = "added/new.md"
  const addedBinaryPath = "added/new.bin"
  const untrackedPath = "local-only.keep"
  const oldText = "Text from the target version.\n"
  const currentText = "Text from the current version.\n"
  const oldBinary = Buffer.from([0x00, 0x11, 0x7f, 0x80, 0xfe, 0xff])
  const currentBinary = Buffer.from([0xff, 0xee, 0x90, 0x02, 0x01, 0x00])
  const deletedText = "Recreate this text file and its parents.\n"
  const deletedBinary = Buffer.from([0xde, 0xad, 0x00, 0xbe, 0xef])
  const addedText = "This text only exists in the current version.\n"
  const addedBinary = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00])
  const untrackedContent = "Keep this unrelated untracked file.\n"

  console.log("Whole Space restore smoke root:", root)

  try {
    fs.mkdirSync(path.join(root, "assets"), { recursive: true })
    fs.mkdirSync(path.join(root, "missing", "parent"), { recursive: true })
    fs.writeFileSync(path.join(root, modifiedTextPath), oldText)
    fs.writeFileSync(path.join(root, modifiedBinaryPath), oldBinary)
    fs.writeFileSync(path.join(root, deletedTextPath), deletedText)
    fs.writeFileSync(path.join(root, deletedBinaryPath), deletedBinary)
    runGraftJson(cliPath, root, ["init", "--json"])
    const targetRevision = commitAll(
      cliPath,
      root,
      "Whole Space restore target"
    )

    fs.writeFileSync(path.join(root, modifiedTextPath), currentText)
    fs.writeFileSync(path.join(root, modifiedBinaryPath), currentBinary)
    fs.rmSync(path.join(root, "missing"), { recursive: true })
    fs.mkdirSync(path.join(root, "added"), { recursive: true })
    fs.writeFileSync(path.join(root, addedTextPath), addedText)
    fs.writeFileSync(path.join(root, addedBinaryPath), addedBinary)
    const currentRevision = commitAll(
      cliPath,
      root,
      "Current Whole Space version"
    )
    fs.writeFileSync(path.join(root, untrackedPath), untrackedContent)

    const before = captureRepoSnapshot(cliPath, root)
    if (before.head !== currentRevision) {
      throw new Error(
        `Whole Space smoke started from the wrong HEAD: ${JSON.stringify(before)}`
      )
    }

    const restore = runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--expected-head",
      currentRevision,
      "--source",
      targetRevision,
      "--",
      ".",
    ])
    assertPaths(
      restore,
      [
        modifiedTextPath,
        modifiedBinaryPath,
        deletedTextPath,
        deletedBinaryPath,
        addedTextPath,
        addedBinaryPath,
      ],
      [untrackedPath]
    )

    if (
      fs.readFileSync(path.join(root, modifiedTextPath), "utf8") !== oldText
    ) {
      throw new Error("Whole Space restore did not recover modified text")
    }
    if (
      !fs.readFileSync(path.join(root, modifiedBinaryPath)).equals(oldBinary)
    ) {
      throw new Error(
        "Whole Space restore did not recover modified binary data"
      )
    }
    if (
      fs.readFileSync(path.join(root, deletedTextPath), "utf8") !== deletedText
    ) {
      throw new Error(
        "Whole Space restore did not recreate deleted text or missing parents"
      )
    }
    if (
      !fs.readFileSync(path.join(root, deletedBinaryPath)).equals(deletedBinary)
    ) {
      throw new Error(
        "Whole Space restore did not recreate deleted binary data"
      )
    }
    if (
      fs.existsSync(path.join(root, addedTextPath)) ||
      fs.existsSync(path.join(root, addedBinaryPath))
    ) {
      throw new Error(
        "Whole Space restore kept files added after the target version"
      )
    }
    if (
      fs.readFileSync(path.join(root, untrackedPath), "utf8") !==
      untrackedContent
    ) {
      throw new Error("Whole Space restore changed an unrelated untracked file")
    }

    assertRepoSnapshotUnchanged(cliPath, root, before, "Whole Space restore")
    const status = runGraftJson(cliPath, root, ["status", "--json"])
    assertPaths(
      status,
      [
        modifiedTextPath,
        modifiedBinaryPath,
        deletedTextPath,
        deletedBinaryPath,
        addedTextPath,
        addedBinaryPath,
        untrackedPath,
      ],
      []
    )
    if (
      !status.dirty ||
      !status.has_unstaged_changes ||
      status.has_staged_changes ||
      status.has_conflicts ||
      status.staged.length !== 0 ||
      status.conflicted.length !== 0
    ) {
      throw new Error(
        `Whole Space restore did not leave only unstaged Changes: ${JSON.stringify(status)}`
      )
    }
  } finally {
    removeTempRoot(root)
  }
}

function runWholeSpaceTopologyRestoreSmoke() {
  const cliPath = findGraftCli()
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-root-restore-topology-smoke-")
  )
  const shapePath = "shape"
  const childPath = "shape/child.md"
  const fileContent = "This version stores shape as a file.\n"
  const childContent = "This version stores shape as a directory.\n"

  console.log("Whole Space topology restore smoke root:", root)

  try {
    fs.writeFileSync(path.join(root, shapePath), fileContent)
    runGraftJson(cliPath, root, ["init", "--json"])
    const fileRevision = commitAll(cliPath, root, "Track shape as a file")

    fs.rmSync(path.join(root, shapePath))
    fs.mkdirSync(path.join(root, shapePath))
    fs.writeFileSync(path.join(root, childPath), childContent)
    const directoryRevision = commitAll(
      cliPath,
      root,
      "Track shape as a directory"
    )

    const beforeFileRestore = captureRepoSnapshot(cliPath, root)
    const fileRestore = runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--expected-head",
      directoryRevision,
      "--source",
      fileRevision,
      "--",
      ".",
    ])
    assertPaths(fileRestore, [shapePath, childPath], [])
    if (
      !fs.statSync(path.join(root, shapePath)).isFile() ||
      fs.readFileSync(path.join(root, shapePath), "utf8") !== fileContent
    ) {
      throw new Error(
        "Whole Space restore did not replace a directory with its historical file"
      )
    }
    assertRepoSnapshotUnchanged(
      cliPath,
      root,
      beforeFileRestore,
      "Directory-to-file Whole Space restore"
    )

    const restoredFileRevision = commitAll(
      cliPath,
      root,
      "Commit restored file topology"
    )
    const beforeDirectoryRestore = captureRepoSnapshot(cliPath, root)
    const directoryRestore = runGraftJson(cliPath, root, [
      "restore",
      "--json",
      "--expected-head",
      restoredFileRevision,
      "--source",
      directoryRevision,
      "--",
      ".",
    ])
    assertPaths(directoryRestore, [shapePath, childPath], [])
    if (
      !fs.statSync(path.join(root, shapePath)).isDirectory() ||
      fs.readFileSync(path.join(root, childPath), "utf8") !== childContent
    ) {
      throw new Error(
        "Whole Space restore did not replace a file with its historical directory"
      )
    }
    assertRepoSnapshotUnchanged(
      cliPath,
      root,
      beforeDirectoryRestore,
      "File-to-directory Whole Space restore"
    )
  } finally {
    removeTempRoot(root)
  }
}

function runWholeSpaceRestoreUntrackedCollisionSmoke() {
  const cliPath = findGraftCli()
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-root-restore-collision-smoke-")
  )
  const earlyPath = "a-early.md"
  const collisionPath = "collision/restored.bin"
  const oldEarly = "target early file\n"
  const currentEarly = "current early file\n"
  const historicalCollision = Buffer.from([0x10, 0x20, 0x30, 0x40])
  const localCollision = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd])

  console.log("Whole Space untracked collision smoke root:", root)

  try {
    fs.mkdirSync(path.join(root, "collision"), { recursive: true })
    fs.writeFileSync(path.join(root, earlyPath), oldEarly)
    fs.writeFileSync(path.join(root, collisionPath), historicalCollision)
    runGraftJson(cliPath, root, ["init", "--json"])
    const targetRevision = commitAll(
      cliPath,
      root,
      "Track future collision path"
    )

    fs.writeFileSync(path.join(root, earlyPath), currentEarly)
    fs.rmSync(path.join(root, "collision"), { recursive: true })
    commitAll(cliPath, root, "Delete future collision path")
    fs.mkdirSync(path.join(root, "collision"), { recursive: true })
    fs.writeFileSync(path.join(root, collisionPath), localCollision)

    const before = captureRepoSnapshot(cliPath, root)
    const restoreError = runGraftExpectFailure(cliPath, root, [
      "restore",
      "--json",
      "--source",
      targetRevision,
      "--",
      ".",
    ])
    if (!restoreError.includes("untracked paths would be overwritten")) {
      throw new Error(
        `Whole Space restore returned the wrong collision error: ${restoreError}`
      )
    }
    if (
      fs.readFileSync(path.join(root, earlyPath), "utf8") !== currentEarly ||
      !fs.readFileSync(path.join(root, collisionPath)).equals(localCollision)
    ) {
      throw new Error(
        "Rejected Whole Space restore changed a file before detecting an untracked collision"
      )
    }
    assertRepoSnapshotUnchanged(
      cliPath,
      root,
      before,
      "Rejected Whole Space collision restore"
    )
  } finally {
    removeTempRoot(root)
  }
}

function runWholeSpaceRestoreSymlinkSafetySmoke() {
  if (process.platform === "win32") return

  const cliPath = findGraftCli()
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-root-restore-symlink-smoke-")
  )
  const externalRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-root-restore-external-")
  )
  const earlyPath = "a-early.md"
  const linkedPath = "linked/escape.md"
  const oldEarly = "target early file\n"
  const currentEarly = "current early file\n"
  const historicalLinked = "historical linked file\n"
  const externalSentinel = "external file must not change\n"

  console.log("Whole Space symlink safety smoke root:", root)

  try {
    fs.mkdirSync(path.join(root, "linked"), { recursive: true })
    fs.writeFileSync(path.join(root, earlyPath), oldEarly)
    fs.writeFileSync(path.join(root, linkedPath), historicalLinked)
    runGraftJson(cliPath, root, ["init", "--json"])
    const targetRevision = commitAll(
      cliPath,
      root,
      "Track path later replaced by symlink"
    )

    fs.writeFileSync(path.join(root, earlyPath), currentEarly)
    fs.rmSync(path.join(root, "linked"), { recursive: true })
    commitAll(cliPath, root, "Delete linked path")
    fs.writeFileSync(path.join(externalRoot, "escape.md"), externalSentinel)
    fs.symlinkSync(externalRoot, path.join(root, "linked"), "dir")

    const before = captureRepoSnapshot(cliPath, root)
    const restoreError = runGraftExpectFailure(cliPath, root, [
      "restore",
      "--json",
      "--source",
      targetRevision,
      "--",
      ".",
    ])
    if (!restoreError.includes("not a directory")) {
      throw new Error(
        `Whole Space restore returned the wrong symlink error: ${restoreError}`
      )
    }
    if (
      fs.readFileSync(path.join(root, earlyPath), "utf8") !== currentEarly ||
      fs.readFileSync(path.join(externalRoot, "escape.md"), "utf8") !==
        externalSentinel ||
      !fs.lstatSync(path.join(root, "linked")).isSymbolicLink()
    ) {
      throw new Error(
        "Rejected Whole Space restore changed the worktree symlink or an external file"
      )
    }
    assertRepoSnapshotUnchanged(
      cliPath,
      root,
      before,
      "Rejected Whole Space symlink restore"
    )
  } finally {
    removeTempRoot(root)
    removeTempRoot(externalRoot)
  }
}

function runWholeSpaceRestoreAncestorSafetySmoke() {
  const cliPath = findGraftCli()
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-root-restore-ancestor-smoke-")
  )
  const earlyPath = "a-early.md"
  const latePath = "z-late/child.md"
  const ancestorPath = "z-late"
  const oldEarly = "target early file\n"
  const currentEarly = "current early file\n"
  const ancestorContent = "ordinary file blocking a later restore path\n"

  console.log("Whole Space ancestor safety smoke root:", root)

  try {
    fs.mkdirSync(path.join(root, "z-late"), { recursive: true })
    fs.writeFileSync(path.join(root, earlyPath), oldEarly)
    fs.writeFileSync(path.join(root, latePath), "restore this late file\n")
    runGraftJson(cliPath, root, ["init", "--json"])
    const targetRevision = commitAll(
      cliPath,
      root,
      "Track path with a later ancestor"
    )

    fs.writeFileSync(path.join(root, earlyPath), currentEarly)
    fs.rmSync(path.join(root, "z-late"), { recursive: true })
    commitAll(cliPath, root, "Delete later nested path")
    fs.writeFileSync(path.join(root, ancestorPath), ancestorContent)

    const before = captureRepoSnapshot(cliPath, root)
    const restoreError = runGraftExpectFailure(cliPath, root, [
      "restore",
      "--json",
      "--source",
      targetRevision,
      "--",
      ".",
    ])
    if (!restoreError.includes("not a directory")) {
      throw new Error(
        `Whole Space restore returned the wrong ancestor error: ${restoreError}`
      )
    }
    if (
      fs.readFileSync(path.join(root, earlyPath), "utf8") !== currentEarly ||
      fs.readFileSync(path.join(root, ancestorPath), "utf8") !== ancestorContent
    ) {
      throw new Error(
        "Rejected Whole Space restore changed an earlier file before ancestor preflight failed"
      )
    }
    assertRepoSnapshotUnchanged(
      cliPath,
      root,
      before,
      "Rejected Whole Space ancestor restore"
    )
  } finally {
    removeTempRoot(root)
  }
}

function runAmbiguousPathSafetySmoke() {
  const cliPath = findGraftCli()
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-path-safety-smoke-")
  )
  const plainPath = "note.md"
  const slashPath = "folder/note.md"
  const spacedPath = " note.md "
  const backslashPath = "folder\\note.md"

  console.log("Path identity smoke root:", root)

  try {
    fs.mkdirSync(path.join(root, "folder"))
    fs.writeFileSync(path.join(root, plainPath), "committed plain\n")
    fs.writeFileSync(path.join(root, slashPath), "committed slash\n")
    runGraftJson(cliPath, root, ["init", "--json"])
    runGraftJson(cliPath, root, ["add", "--all", "--json"])
    runGraftJson(cliPath, root, [
      "commit",
      "--json",
      "-m",
      "Track unambiguous paths",
    ])

    fs.writeFileSync(path.join(root, plainPath), "local plain draft\n")
    fs.writeFileSync(path.join(root, slashPath), "local slash draft\n")
    fs.writeFileSync(path.join(root, spacedPath), "ambiguous spaced path\n")
    const addError = runGraftExpectFailure(cliPath, root, [
      "add",
      "--all",
      "--json",
    ])
    if (!addError.includes("unsupported repository identity")) {
      throw new Error(`Graft returned the wrong path safety error: ${addError}`)
    }
    if (
      fs.readFileSync(path.join(root, plainPath), "utf8") !==
        "local plain draft\n" ||
      fs.readFileSync(path.join(root, spacedPath), "utf8") !==
        "ambiguous spaced path\n"
    ) {
      throw new Error("Rejected add changed an ambiguous worktree path")
    }
    fs.rmSync(path.join(root, spacedPath))

    if (process.platform !== "win32") {
      fs.writeFileSync(
        path.join(root, backslashPath),
        "ambiguous backslash path\n"
      )
      const restoreError = runGraftExpectFailure(cliPath, root, [
        "restore",
        "--json",
        "--source",
        "HEAD",
        "--",
        backslashPath,
      ])
      if (!restoreError.includes("backslashes are not supported")) {
        throw new Error(
          `Graft returned the wrong backslash safety error: ${restoreError}`
        )
      }
      if (
        fs.readFileSync(path.join(root, slashPath), "utf8") !==
          "local slash draft\n" ||
        fs.readFileSync(path.join(root, backslashPath), "utf8") !==
          "ambiguous backslash path\n"
      ) {
        throw new Error("Rejected restore changed an aliased path")
      }
      fs.rmSync(path.join(root, backslashPath))
    }

    const status = runGraftJson(cliPath, root, ["status", "--json"])
    if (status.has_staged_changes) {
      throw new Error(
        `Rejected ambiguous paths left staged changes: ${JSON.stringify(status)}`
      )
    }
  } finally {
    removeTempRoot(root)
  }
}

try {
  runSqliteExtensionSmoke()
  runPersistentFileSpacePragmaSmoke()
  runFileSpaceCliSmoke()
  runRestoreConflictSmoke()
  runWholeSpaceRestoreSmoke()
  runWholeSpaceTopologyRestoreSmoke()
  runWholeSpaceRestoreUntrackedCollisionSmoke()
  runWholeSpaceRestoreSymlinkSafetySmoke()
  runWholeSpaceRestoreAncestorSafetySmoke()
  runAmbiguousPathSafetySmoke()
  process.exit(0)
} catch (error) {
  console.error(error)
  process.exit(1)
}
