const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const Database = require("better-sqlite3")

function findGraftCli() {
  if (process.env.GRAFT_CLI_PATH) return process.env.GRAFT_CLI_PATH
  const fileName = process.platform === "win32" ? "graft.exe" : "graft"
  const cliPath = path.join(__dirname, "..", "dist-cli", fileName)
  if (!fs.existsSync(cliPath))
    throw new Error(`Graft CLI not found: ${cliPath}`)
  return cliPath
}

const graft = findGraftCli()

function runGraft(cwd, args) {
  const stdout = execFileSync(graft, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
  assert.notEqual(stdout, "", `Graft returned no JSON for ${args.join(" ")}`)
  return JSON.parse(stdout)
}

function commitId(result) {
  const id = result?.commit?.id ?? result?.id ?? result?.head
  assert.equal(typeof id, "string", JSON.stringify(result))
  return id
}

function fsRemoteUri(remotePath) {
  const normalized = path.resolve(remotePath).replaceAll("\\", "/")
  return normalized.startsWith("/")
    ? `fs://${normalized}`
    : `fs:///${normalized}`
}

function assertPhysicalSqlite(dbPath, expectedPageSize = 8192) {
  assert.equal(
    fs.readFileSync(dbPath).subarray(0, 16).toString("binary"),
    "SQLite format 3\0"
  )
  const db = new Database(dbPath, { readonly: true })
  assert.equal(db.pragma("page_size", { simple: true }), expectedPageSize)
  db.close()
}

function runPhysicalWorktreeSmoke() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-graft-v08-"))
  const cloneRoot = path.join(root, "clone")
  const remoteRoot = path.join(root, "remote")
  const remoteWorktree = path.join(root, "remote-worktree")
  const worktree = path.join(root, "worktree")
  fs.mkdirSync(worktree)
  fs.mkdirSync(cloneRoot)
  fs.mkdirSync(remoteRoot)
  fs.mkdirSync(remoteWorktree)
  const dbPath = path.join(worktree, "db.sqlite3")

  try {
    runGraft(worktree, ["init", "--json"])

    // WAL: `add` must capture committed frames while Eidos still has the
    // physical database open; `commit` runs after the handle is closed.
    let db = new Database(dbPath)
    db.pragma("page_size = 8192")
    db.exec("VACUUM")
    assert.equal(db.pragma("page_size", { simple: true }), 8192)
    assert.equal(db.pragma("journal_mode = WAL", { simple: true }), "wal")
    db.pragma("wal_autocheckpoint = 0")
    db.exec(`
      CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT NOT NULL) STRICT;
      CREATE TABLE typed_docs(
        namespace TEXT NOT NULL,
        id BLOB NOT NULL,
        body TEXT NOT NULL,
        PRIMARY KEY(namespace, id)
      ) STRICT, WITHOUT ROWID;
      INSERT INTO typed_docs VALUES ('personal', X'00ff', 'base-one');
    `)
    db.prepare("INSERT INTO notes(body) VALUES (?)").run("committed in WAL")
    assert.ok(fs.existsSync(`${dbPath}-wal`), "WAL should exist before add")
    runGraft(worktree, ["add", "--json", "db.sqlite3"])
    assert.equal(db.prepare("SELECT count(*) FROM notes").pluck().get(), 1)
    db.close()
    const walCommit = runGraft(worktree, [
      "commit",
      "--json",
      "--message",
      "Capture committed WAL frames",
    ])
    const walRevision = commitId(walCommit)
    assertPhysicalSqlite(dbPath)

    // Rollback journal: a completed transaction is stageable while the
    // connection remains live, and commit leaves an ordinary SQLite file.
    db = new Database(dbPath)
    assert.equal(db.pragma("journal_mode = DELETE", { simple: true }), "delete")
    db.exec("BEGIN IMMEDIATE")
    db.prepare("INSERT INTO notes(body) VALUES (?)").run("rollback journal")
    db.prepare("INSERT INTO typed_docs VALUES (?, ?, ?)").run(
      "personal",
      Buffer.from("01fe", "hex"),
      "base-two"
    )
    db.exec("COMMIT")
    runGraft(worktree, ["add", "--json", "db.sqlite3"])
    db.close()
    const rollbackCommit = runGraft(worktree, [
      "commit",
      "--json",
      "--message",
      "Capture rollback-journal transaction",
    ])
    const rollbackRevision = commitId(rollbackCommit)
    assertPhysicalSqlite(dbPath)

    db = new Database(dbPath)
    assert.deepEqual(
      db.prepare("SELECT body FROM notes ORDER BY id").pluck().all(),
      ["committed in WAL", "rollback journal"]
    )
    db.close()

    // v0.8 exposes declared primary keys for STRICT/WITHOUT ROWID tables and
    // can merge changes to different composite/BLOB keys.
    runGraft(worktree, ["branch", "--json", "feature", rollbackRevision])
    runGraft(worktree, ["--db", "db.sqlite3", "switch", "--json", "feature"])
    db = new Database(dbPath)
    db.prepare(
      "UPDATE typed_docs SET body = ? WHERE namespace = ? AND id = ?"
    ).run("feature-one", "personal", Buffer.from("00ff", "hex"))
    runGraft(worktree, ["add", "--json", "db.sqlite3"])
    db.close()
    const featureRevision = commitId(
      runGraft(worktree, [
        "commit",
        "--json",
        "--message",
        "Update first typed row",
      ])
    )

    runGraft(worktree, ["--db", "db.sqlite3", "switch", "--json", "main"])
    db = new Database(dbPath)
    db.prepare(
      "UPDATE typed_docs SET body = ? WHERE namespace = ? AND id = ?"
    ).run("main-two", "personal", Buffer.from("01fe", "hex"))
    runGraft(worktree, ["add", "--json", "db.sqlite3"])
    db.close()
    commitId(
      runGraft(worktree, [
        "commit",
        "--json",
        "--message",
        "Update second typed row",
      ])
    )

    const typedDiff = runGraft(worktree, [
      "--db",
      "db.sqlite3",
      "diff",
      "--rows",
      "--json",
      rollbackRevision,
      featureRevision,
    ])
    const typedTable = typedDiff.files
      ?.find((entry) => entry.path === "db.sqlite3")
      ?.tables?.find((entry) => entry.name === "typed_docs")
    assert.deepEqual(typedTable?.primary_key_columns, ["namespace", "id"])
    assert.deepEqual(typedTable?.changes?.[0]?.key, {
      namespace: "personal",
      id: { $blob: "00ff" },
    })

    runGraft(worktree, ["--db", "db.sqlite3", "merge", "--json", "feature"])
    const mergeCommit = runGraft(worktree, [
      "--db",
      "db.sqlite3",
      "merge",
      "--continue",
      "--json",
      "--message",
      "Merge typed rows",
    ])
    const mergeRevision = commitId(mergeCommit)
    db = new Database(dbPath, { readonly: true })
    assert.deepEqual(
      db
        .prepare("SELECT hex(id), body FROM typed_docs ORDER BY id")
        .all()
        .map((row) => Object.values(row)),
      [
        ["00FF", "feature-one"],
        ["01FE", "main-two"],
      ]
    )
    db.close()
    assertPhysicalSqlite(dbPath)

    // Exercise a clean real remote round-trip in a default-page-size worktree.
    // HTTP v1 URIs use the same untouched CLI argument path; the unit suite
    // covers that pass-through contract.
    runGraft(remoteWorktree, ["init", "--json"])
    const remoteDbPath = path.join(remoteWorktree, "db.sqlite3")
    db = new Database(remoteDbPath)
    db.exec("CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT NOT NULL)")
    db.prepare("INSERT INTO notes(body) VALUES (?)").run("initial remote")
    runGraft(remoteWorktree, ["add", "--json", "db.sqlite3"])
    db.close()
    runGraft(remoteWorktree, [
      "commit",
      "--json",
      "--message",
      "Initial remote",
    ])
    const remoteUri = fsRemoteUri(remoteRoot)
    runGraft(remoteWorktree, ["remote", "add", "--json", "origin", remoteUri])
    runGraft(remoteWorktree, [
      "branch",
      "--json",
      "--set-upstream-to",
      "origin/main",
      "main",
    ])
    runGraft(remoteWorktree, ["push", "--json"])
    runGraft(cloneRoot, ["clone", "--json", remoteUri])
    assertPhysicalSqlite(path.join(cloneRoot, "db.sqlite3"), 4096)

    db = new Database(remoteDbPath)
    db.prepare("INSERT INTO notes(body) VALUES (?)").run("pull round trip")
    runGraft(remoteWorktree, ["add", "--json", "db.sqlite3"])
    db.close()
    runGraft(remoteWorktree, [
      "commit",
      "--json",
      "--message",
      "Publish pull round trip",
    ])
    runGraft(remoteWorktree, ["push", "--json"])
    const cloneStatus = runGraft(cloneRoot, ["status", "--json"])
    assert.equal(cloneStatus.dirty, false, JSON.stringify(cloneStatus, null, 2))
    runGraft(cloneRoot, ["pull", "--json"])
    db = new Database(path.join(cloneRoot, "db.sqlite3"), { readonly: true })
    assert.equal(
      db
        .prepare("SELECT count(*) FROM notes WHERE body = ?")
        .pluck()
        .get("pull round trip"),
      1
    )
    db.close()

    // A worktree-replacing command only runs while SQLite is closed.
    db = new Database(dbPath)
    db.prepare("UPDATE notes SET body = ? WHERE id = 2").run("later edit")
    runGraft(worktree, ["add", "--json", "db.sqlite3"])
    db.close()
    runGraft(worktree, ["commit", "--json", "--message", "Later edit"])
    runGraft(worktree, [
      "--db",
      "db.sqlite3",
      "checkout",
      "--json",
      "--force",
      rollbackRevision,
    ])
    db = new Database(dbPath, { readonly: true })
    assert.equal(
      db.prepare("SELECT body FROM notes WHERE id = 2").pluck().get(),
      "rollback journal"
    )
    db.close()

    console.log(
      JSON.stringify({
        graftVersion: "0.8.1",
        worktree: "physical-sqlite",
        walRevision,
        rollbackRevision,
        featureRevision,
        mergeRevision,
        remote: "fs-round-trip",
      })
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

try {
  runPhysicalWorktreeSmoke()
  if (typeof process.reallyExit === "function") process.reallyExit(0)
} catch (error) {
  console.error(error)
  if (typeof process.reallyExit === "function") process.reallyExit(1)
  process.exitCode = 1
}
