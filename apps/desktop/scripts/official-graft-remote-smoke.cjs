const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const Database = require("better-sqlite3")

const origin = "https://sync.eidos.space"
const token = process.env.GRAFT_REMOTE_TOKEN
const repository = process.env.EIDOS_SYNC_SMOKE_REPOSITORY

if (!token || !repository) {
  throw new Error(
    "Set GRAFT_REMOTE_TOKEN and EIDOS_SYNC_SMOKE_REPOSITORY to run the authenticated Eidos Sync smoke."
  )
}
if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/.test(repository)) {
  throw new Error("EIDOS_SYNC_SMOKE_REPOSITORY is not a valid repository name")
}

function graftPath() {
  if (process.env.GRAFT_CLI_PATH) return process.env.GRAFT_CLI_PATH
  const fileName = process.platform === "win32" ? "graft.exe" : "graft"
  return path.join(__dirname, "..", "dist-cli", fileName)
}

function runGraft(cwd, args) {
  const result = spawnSync(graftPath(), args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GRAFT_REMOTE_TOKEN: token, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (result.status !== 0) {
    const output = `${result.stderr || result.error?.message || "Graft failed"}`
      .split(token)
      .join("[redacted]")
      .slice(0, 2_000)
    const error = new Error(output)
    error.graftOutput = output
    throw error
  }
  return JSON.parse(result.stdout.trim())
}

async function provision() {
  const discoveryResponse = await fetch(`${origin}/.well-known/graft`)
  assert.equal(discoveryResponse.status, 200)
  const discovery = await discoveryResponse.json()
  assert.equal(discovery.protocol, "graft-remote")
  assert.equal(discovery.version, 1)

  const response = await fetch(
    `${origin}/api/graft/repositories/${encodeURIComponent(repository)}`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}` } }
  )
  if (!response.ok) {
    throw new Error(`Eidos Sync provision failed with HTTP ${response.status}`)
  }
  const result = await response.json()
  assert.match(
    result.remote_url,
    /^https:\/\/sync\.eidos\.space\/[^/]+\/[^/]+$/
  )
  return result.remote_url
}

async function main() {
  const remoteUrl = await provision()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-sync-smoke-"))
  const worktree = path.join(root, "worktree")
  const verification = path.join(root, "verification")
  fs.mkdirSync(worktree)
  fs.mkdirSync(verification)

  try {
    let cloned = true
    try {
      runGraft(worktree, ["clone", "--json", remoteUrl])
    } catch (error) {
      if (!/no branch `main`|empty repository/i.test(error.graftOutput || "")) {
        throw error
      }
      cloned = false
      runGraft(worktree, ["init", "--json"])
    }

    const dbPath = path.join(worktree, "db.sqlite3")
    const db = new Database(dbPath)
    db.exec(
      "CREATE TABLE IF NOT EXISTS eidos_sync_smoke(id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)"
    )
    const marker = `${Date.now()}-${process.pid}`
    db.prepare("INSERT INTO eidos_sync_smoke VALUES (?, ?)").run(
      marker,
      Date.now()
    )
    runGraft(worktree, ["add", "--json", "db.sqlite3"])
    db.close()
    runGraft(worktree, [
      "commit",
      "--json",
      "--message",
      `Eidos Sync smoke ${marker}`,
    ])

    if (!cloned) {
      runGraft(worktree, ["remote", "add", "--json", "origin", remoteUrl])
      runGraft(worktree, [
        "branch",
        "--json",
        "--set-upstream-to",
        "origin/main",
        "main",
      ])
    }
    runGraft(worktree, ["push", "--json"])
    runGraft(worktree, ["fetch", "--json"])
    runGraft(verification, ["clone", "--json", remoteUrl])

    const config = fs.readFileSync(
      path.join(worktree, ".graft", "config.toml"),
      "utf8"
    )
    if (config.includes(token) || /authorization\s*=|bearer\s+/i.test(config)) {
      throw new Error("Graft repository config contains persisted credentials")
    }

    let verified = new Database(path.join(verification, "db.sqlite3"), {
      readonly: true,
    })
    assert.equal(
      verified
        .prepare("SELECT count(*) FROM eidos_sync_smoke WHERE id = ?")
        .pluck()
        .get(marker),
      1
    )
    verified.close()

    const pullMarker = `${marker}-pull`
    const publishing = new Database(dbPath)
    publishing
      .prepare("INSERT INTO eidos_sync_smoke VALUES (?, ?)")
      .run(pullMarker, Date.now())
    runGraft(worktree, ["add", "--json", "db.sqlite3"])
    publishing.close()
    runGraft(worktree, [
      "commit",
      "--json",
      "--message",
      `Eidos Sync pull smoke ${marker}`,
    ])
    runGraft(worktree, ["push", "--json"])
    runGraft(verification, ["fetch", "--json"])
    runGraft(verification, ["pull", "--json"])

    verified = new Database(path.join(verification, "db.sqlite3"), {
      readonly: true,
    })
    assert.equal(
      verified
        .prepare("SELECT count(*) FROM eidos_sync_smoke WHERE id = ?")
        .pluck()
        .get(pullMarker),
      1
    )
    verified.close()
    console.log(
      JSON.stringify({
        service: origin,
        protocol: "graft-remote-v1",
        repository,
        verified: true,
      })
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

main().catch((error) => {
  const message = (error instanceof Error ? error.message : String(error))
    .split(token)
    .join("[redacted]")
  console.error(message)
  process.exitCode = 1
})
