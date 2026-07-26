import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import test from "node:test"

const installer = path.resolve("apps/cli/install.sh")

function commandExists(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0
}

function currentTarget() {
  if (process.platform === "darwin" && process.arch === "arm64")
    return "aarch64-apple-darwin"
  if (process.platform === "darwin" && process.arch === "x64")
    return "x86_64-apple-darwin"
  if (process.platform === "linux" && process.arch === "x64")
    return "x86_64-unknown-linux-gnu"
  return null
}

async function fixture(root, { validChecksum = true } = {}) {
  const version = "1.2.3"
  const target = currentTarget()
  const tag = `cli-v${version}`
  const archive = `eidos-cli-v${version}-${target}.tar.gz`
  const releaseDirectory = path.join(root, tag)
  const payloadDirectory = path.join(root, "payload")
  await mkdir(releaseDirectory, { recursive: true })
  await mkdir(payloadDirectory, { recursive: true })
  const binary = path.join(payloadDirectory, "eidos")
  await writeFile(binary, "#!/bin/sh\nprintf 'eidos fixture 1.2.3\\n'\n")
  await chmod(binary, 0o755)
  const archivePath = path.join(releaseDirectory, archive)
  const tar = spawnSync(
    "tar",
    ["-czf", archivePath, "-C", payloadDirectory, "eidos"],
    {
      encoding: "utf8",
    }
  )
  assert.equal(tar.status, 0, tar.stderr)
  const digest = createHash("sha256")
    .update(await readFile(archivePath))
    .digest("hex")
  await writeFile(
    path.join(releaseDirectory, "SHA256SUMS"),
    `${validChecksum ? digest : "0".repeat(64)}  ${archive}\n`
  )
  const latestPath = path.join(root, "LATEST")
  await writeFile(latestPath, `${version}\n`)
  return {
    downloadBase: pathToFileURL(root).href.replace(/\/$/u, ""),
    latestUrl: pathToFileURL(latestPath).href,
  }
}

const canRun =
  process.platform !== "win32" &&
  currentTarget() &&
  commandExists("tar") &&
  commandExists("curl")

test(
  "install.sh resolves LATEST, verifies SHA256SUMS, and installs atomically",
  { skip: !canRun },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-install-test-"))
    try {
      const release = await fixture(root)
      const installDirectory = path.join(root, "bin")
      const result = spawnSync(
        "sh",
        [installer, "--install-dir", installDirectory],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            EIDOS_DOWNLOAD_BASE: release.downloadBase,
            EIDOS_LATEST_URL: release.latestUrl,
          },
        }
      )
      assert.equal(result.status, 0, result.stderr)
      const installed = path.join(installDirectory, "eidos")
      assert.match(await readFile(installed, "utf8"), /eidos fixture 1\.2\.3/u)
      assert.equal((await stat(installed)).mode & 0o111, 0o111)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)

test(
  "install.sh refuses a checksum mismatch without replacing an installation",
  { skip: !canRun },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-install-test-"))
    try {
      const release = await fixture(root, { validChecksum: false })
      const installDirectory = path.join(root, "bin")
      await mkdir(installDirectory, { recursive: true })
      const installed = path.join(installDirectory, "eidos")
      await writeFile(installed, "existing installation\n")
      const result = spawnSync(
        "sh",
        [installer, "--version", "1.2.3", "--install-dir", installDirectory],
        {
          encoding: "utf8",
          env: { ...process.env, EIDOS_DOWNLOAD_BASE: release.downloadBase },
        }
      )
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /checksum mismatch/u)
      assert.equal(await readFile(installed, "utf8"), "existing installation\n")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
)
