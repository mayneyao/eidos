import assert from "node:assert/strict"
import { gzipSync } from "node:zlib"
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  commitPreparedExtensionInstall,
  prepareGitHubExtensionInstall,
  readExtensionInstallTarget,
  uninstallExtensionPackage,
} from "@eidos.space/extension-installer/node"

const HOST_VERSION = "0.33.0"
const FIRST_COMMIT = "1".repeat(40)
const SECOND_COMMIT = "2".repeat(40)

function writeString(buffer, offset, length, value) {
  const encoded = Buffer.from(value)
  assert.ok(encoded.byteLength <= length, `tar field is too long: ${value}`)
  encoded.copy(buffer, offset)
}

function writeOctal(buffer, offset, length, value) {
  const encoded = `${value.toString(8).padStart(length - 1, "0")}\0`
  writeString(buffer, offset, length, encoded)
}

function tarHeader(name, size) {
  const header = Buffer.alloc(512)
  writeString(header, 0, 100, name)
  writeOctal(header, 100, 8, 0o644)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, size)
  writeOctal(header, 136, 12, 0)
  header.fill(0x20, 148, 156)
  writeString(header, 156, 1, "0")
  writeString(header, 257, 6, "ustar\0")
  writeString(header, 263, 2, "00")
  const checksum = header.reduce((sum, byte) => sum + byte, 0)
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `)
  return header
}

function githubArchive(commit, files) {
  const root = `example-task-counter-${commit.slice(0, 8)}`
  const chunks = []
  for (const [relativePath, source] of Object.entries(files).sort(
    ([left], [right]) => left.localeCompare(right)
  )) {
    const content = Buffer.from(source)
    chunks.push(
      tarHeader(`${root}/${relativePath}`, content.byteLength),
      content
    )
    const remainder = content.byteLength % 512
    if (remainder) chunks.push(Buffer.alloc(512 - remainder))
  }
  chunks.push(Buffer.alloc(1024))
  return new Uint8Array(gzipSync(Buffer.concat(chunks)))
}

function manifest(version, extraRead = []) {
  return `${JSON.stringify(
    {
      manifestVersion: 1,
      publisher: "example",
      name: "task-counter",
      displayName: "Task Counter",
      version,
      engines: { eidos: ">=0.33.0 <1.0.0" },
      entrypoints: { worker: "src/extension.ts" },
      contributes: {
        commands: [{ id: "example.task-counter.count", title: "Count tasks" }],
      },
      permissions: {
        files: { read: ["**/*.md", ...extraRead], write: [] },
        network: [],
      },
    },
    null,
    2
  )}\n`
}

function githubFetch(commit, archive) {
  return async (input) => {
    const url = String(input)
    if (url.includes("/commits/")) {
      return new Response(JSON.stringify({ sha: commit }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.endsWith(`/tarball/${commit}`)) {
      return new Response(archive, {
        status: 200,
        headers: { "content-type": "application/gzip" },
      })
    }
    return new Response("not found", { status: 404 })
  }
}

async function prepare({
  commit,
  archive,
  requested,
  extensionsRoot,
  stagingParent,
}) {
  return prepareGitHubExtensionInstall({
    request: { repository: "example/task-counter", requested },
    stagingParent,
    extensionsRoot,
    hostVersion: HOST_VERSION,
    fetch: githubFetch(commit, archive),
  })
}

const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "eidos-extension-install-smoke-")
)

try {
  const extensionsRoot = path.join(
    temporaryRoot,
    "space",
    ".eidos",
    "extensions"
  )
  const stagingParent = path.join(
    temporaryRoot,
    "space",
    ".eidos",
    "cache",
    "extensions",
    "staging"
  )
  await mkdir(extensionsRoot, { recursive: true })

  const firstArchive = githubArchive(FIRST_COMMIT, {
    "extension.json": manifest("1.0.0"),
    "src/extension.ts": "export const activate = () => 'first'\n",
    "README.md": "# Task Counter\n",
  })
  const first = await prepare({
    commit: FIRST_COMMIT,
    archive: firstArchive,
    requested: "v1.0.0",
    extensionsRoot,
    stagingParent,
  })
  assert.equal(first.operation, "install")
  assert.equal(first.source.commit, FIRST_COMMIT)
  assert.deepEqual(
    first.permissionChanges.map(({ kind, value, change }) => ({
      kind,
      value,
      change,
    })),
    [{ kind: "files.read", value: "**/*.md", change: "added" }]
  )
  await commitPreparedExtensionInstall({
    prepared: first,
    extensionsRoot,
    hostVersion: HOST_VERSION,
  })

  const installedRoot = path.join(extensionsRoot, "example.task-counter")
  const firstTarget = await readExtensionInstallTarget(
    installedRoot,
    HOST_VERSION
  )
  assert.equal(firstTarget?.lock?.source.commit, FIRST_COMMIT)
  assert.equal(firstTarget?.locallyModified, false)

  const secondArchive = githubArchive(SECOND_COMMIT, {
    "extension.json": manifest("1.1.0", ["notes/*.txt"]),
    "src/extension.ts": "export const activate = () => 'second'\n",
    "README.md": "# Task Counter 1.1\n",
  })
  const update = await prepare({
    commit: SECOND_COMMIT,
    archive: secondArchive,
    requested: "v1.1.0",
    extensionsRoot,
    stagingParent,
  })
  assert.equal(update.operation, "update")
  assert.ok(
    update.fileChanges.some(
      ({ path: filePath, kind }) =>
        filePath === "src/extension.ts" && kind === "modified"
    )
  )
  assert.ok(
    update.permissionChanges.some(
      ({ kind, value, change }) =>
        kind === "files.read" && value === "notes/*.txt" && change === "added"
    )
  )
  await commitPreparedExtensionInstall({
    prepared: update,
    extensionsRoot,
    hostVersion: HOST_VERSION,
  })

  const updatedManifest = JSON.parse(
    await readFile(path.join(installedRoot, "extension.json"), "utf8")
  )
  const updatedTarget = await readExtensionInstallTarget(
    installedRoot,
    HOST_VERSION
  )
  assert.equal(updatedManifest.version, "1.1.0")
  assert.equal(updatedTarget?.lock?.source.commit, SECOND_COMMIT)
  assert.equal(updatedTarget?.locallyModified, false)

  await uninstallExtensionPackage(
    installedRoot,
    stagingParent,
    updatedTarget?.inspection.contentDigest,
    HOST_VERSION
  )
  assert.equal(
    await readExtensionInstallTarget(installedRoot, HOST_VERSION),
    undefined
  )
  assert.deepEqual(await readdir(extensionsRoot), [])
  assert.deepEqual(await readdir(stagingParent), [])

  console.log(
    JSON.stringify({
      ok: true,
      lifecycle: ["install", "update", "uninstall"],
      commits: [FIRST_COMMIT, SECOND_COMMIT],
      finalVersion: updatedManifest.version,
    })
  )
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
