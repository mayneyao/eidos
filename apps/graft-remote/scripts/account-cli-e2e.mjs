import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const token = requiredEnv("GRAFT_REMOTE_TOKEN")
const graftCli = requiredEnv("GRAFT_CLI_PATH")
const origin = serviceOrigin(
  process.env.EIDOS_SYNC_ORIGIN ?? "http://127.0.0.1:8787"
)
const repository = repositoryName(
  process.env.EIDOS_SYNC_E2E_REPOSITORY ?? "graft-cli-e2e"
)
const marker = `eidos-sync-e2e-${new Date().toISOString()}`
const markerPath = "sync-service-e2e.txt"
const temporaryRoots = []

try {
  const provisioned = await serviceJson(
    new URL(
      `/api/graft/repositories/${encodeURIComponent(repository)}`,
      origin
    ),
    { method: "PUT" }
  )
  if (typeof provisioned.remote_url !== "string") {
    throw new Error("Sync provisioning returned no remote_url")
  }
  const remoteUrl = graftRemoteUrl(provisioned.remote_url)
  let source = await temporaryRoot("eidos-sync-source-")
  let cloned = true
  try {
    await graftJson(source, ["clone", "--json", remoteUrl])
  } catch {
    cloned = false
    source = await temporaryRoot("eidos-sync-bootstrap-")
    await graftJson(source, ["init", "--json"])
  }

  await writeFile(path.join(source, markerPath), marker + "\n", "utf8")
  await graftJson(source, ["add", "--json", markerPath])
  const commit = await graftJson(source, [
    "commit",
    "--json",
    "--message",
    `Sync service E2E ${marker}`,
  ])
  if (!cloned) {
    await graftJson(source, ["remote", "add", "--json", "origin", remoteUrl])
  }
  const push = await graftJson(source, ["push", "--json", "origin", "main"])

  const verification = await temporaryRoot("eidos-sync-verify-")
  const clone = await graftJson(verification, ["clone", "--json", remoteUrl])
  const verified = await readFile(path.join(verification, markerPath), "utf8")
  if (verified !== marker + "\n") {
    throw new Error("Cloned worktree did not contain the pushed marker")
  }
  const usage = await serviceJson(new URL("/api/graft/usage", origin))

  console.log(
    JSON.stringify(
      {
        status: "ok",
        repository,
        remoteUrl: provisioned.remote_url,
        commit: commit.commit?.id ?? commit.head,
        pushedCommits: push.commits,
        clonedHead: clone.head,
        usage,
      },
      null,
      2
    )
  )
} finally {
  await Promise.all(
    temporaryRoots.map((root) => rm(root, { recursive: true, force: true }))
  )
}

async function temporaryRoot(prefix) {
  const root = await mkdtemp(path.join(tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

async function graftJson(cwd, args) {
  const { stdout } = await execFileAsync(graftCli, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GRAFT_REMOTE_TOKEN: token,
      NO_COLOR: "1",
    },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  })
  const output = stdout.trim()
  if (!output) throw new Error(`Graft ${args[0]} returned no JSON`)
  return JSON.parse(output)
}

async function serviceJson(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const code =
      payload && typeof payload.code === "string" ? payload.code : "unknown"
    throw new Error(`Sync service returned ${response.status} (${code})`)
  }
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Sync service returned invalid JSON")
  }
  return payload
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function repositoryName(value) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/.test(value)) {
    throw new Error("EIDOS_SYNC_E2E_REPOSITORY is invalid")
  }
  return value
}

function serviceOrigin(value) {
  const url = new URL(value)
  const local =
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost")
  if (
    (url.protocol !== "https:" && !local) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("EIDOS_SYNC_ORIGIN must be HTTPS or local HTTP origin")
  }
  return url
}

function graftRemoteUrl(value) {
  const url = new URL(value)
  if (url.protocol === "http:") return `graft+${url.toString()}`
  if (url.protocol !== "https:") {
    throw new Error("Sync provisioning returned an unsupported remote URL")
  }
  return url.toString()
}
