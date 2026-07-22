// @vitest-environment node

import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  installGraftRuntime,
  isRuntimeCacheValid,
  manifest,
  platformConfig,
  runtimeDestinations,
  validateManifest,
  validateRequestedRelease,
  verifyFileSha256,
} from "./graft-runtime-installer.cjs"

const roots: string[] = []

function temporaryDesktopRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "eidos-graft-installer-test-")
  )
  roots.push(root)
  return root
}

function sha256(contents: string | Buffer): string {
  return crypto.createHash("sha256").update(contents).digest("hex")
}

function fixture() {
  const cliArchive = Buffer.from("fixture CLI archive")
  const extensionArchive = Buffer.from("fixture extension archive")
  const cliBinary = Buffer.from("fixture graft 0.6.1 CLI")
  const extensionBinary = Buffer.from("fixture Graft 0.6.1 extension")
  const value = structuredClone(manifest)
  const selected = value.platforms["darwin-arm64"]
  selected.cli.archiveSha256 = sha256(cliArchive)
  selected.cli.binarySha256 = sha256(cliBinary)
  selected.extension.archiveSha256 = sha256(extensionArchive)
  selected.extension.binarySha256 = sha256(extensionBinary)

  const archiveByName = new Map([
    [selected.cli.asset, cliArchive],
    [selected.extension.asset, extensionArchive],
  ])
  const binaryByArchive = new Map([
    [selected.cli.asset, { name: selected.cli.sourceFile, bytes: cliBinary }],
    [
      selected.extension.asset,
      { name: selected.extension.sourceFile, bytes: extensionBinary },
    ],
  ])
  const download = vi.fn(async (url: string, destination: string) => {
    const archive = archiveByName.get(path.basename(url))
    if (!archive) throw new Error(`Unexpected fixture URL: ${url}`)
    fs.writeFileSync(destination, archive)
  })
  const extract = vi.fn((archivePath: string, extractDir: string) => {
    const binary = binaryByArchive.get(path.basename(archivePath))
    if (!binary) throw new Error(`Unexpected fixture archive: ${archivePath}`)
    fs.writeFileSync(path.join(extractDir, binary.name), binary.bytes)
  })

  return {
    cliBinary,
    config: selected,
    download,
    extract,
    extensionBinary,
    manifest: value,
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe("Graft runtime release metadata", () => {
  it("pins v0.6.1 and all twelve platform archives", () => {
    const value = validateManifest()
    const assets = Object.values(value.platforms).flatMap((platform) => [
      platform.cli.asset,
      platform.extension.asset,
    ])

    expect(value).toMatchObject({
      repository: "eidos-space/graft",
      tag: "v0.6.1",
      version: "0.6.1",
      releaseCommit: "09b601c2db8e64114779f2b3e11258b404790990",
    })
    expect(new Set(assets).size).toBe(12)
    expect(platformConfig("darwin", "arm64").config.target).toBe(
      "aarch64-apple-darwin"
    )
  })

  it("rejects environment overrides to an unpinned release", () => {
    expect(() =>
      validateRequestedRelease({
        ...process.env,
        GRAFT_RELEASE_VERSION: "v0.5.8",
      })
    ).toThrow("Refusing unpinned Graft version")
    expect(() =>
      validateRequestedRelease({
        ...process.env,
        GRAFT_RELEASE_REPO: "example/graft",
      })
    ).toThrow("Refusing untrusted Graft repository")
  })
})

describe("Graft runtime installation", () => {
  it("installs once, coalesces concurrent callers, and uses verified cache offline", async () => {
    const root = temporaryDesktopRoot()
    const data = fixture()
    const options = {
      arch: "arm64",
      desktopRoot: root,
      download: data.download,
      extract: data.extract,
      manifest: data.manifest,
      platform: "darwin",
    }

    const [first, concurrent] = await Promise.all([
      installGraftRuntime(options),
      installGraftRuntime(options),
    ])
    expect(first).toMatchObject({ cacheHit: false, version: "0.6.1" })
    expect(concurrent).toEqual(first)
    expect(data.download).toHaveBeenCalledTimes(2)
    expect(isRuntimeCacheValid(root, data.config)).toBe(true)

    const offlineDownload = vi.fn(async () => {
      throw new Error("offline")
    })
    const cached = await installGraftRuntime({
      ...options,
      download: offlineDownload,
    })
    expect(cached.cacheHit).toBe(true)
    expect(offlineDownload).not.toHaveBeenCalled()
  })

  it("recovers immediately when a previous installer process died", async () => {
    const root = temporaryDesktopRoot()
    const data = fixture()
    fs.writeFileSync(
      path.join(root, ".graft-runtime-install.lock"),
      JSON.stringify({ pid: 2_147_483_647, token: "dead-installer" })
    )

    const installed = await installGraftRuntime({
      arch: "arm64",
      desktopRoot: root,
      download: data.download,
      extract: data.extract,
      manifest: data.manifest,
      platform: "darwin",
    })

    expect(installed.cacheHit).toBe(false)
    expect(isRuntimeCacheValid(root, data.config)).toBe(true)
    expect(fs.existsSync(path.join(root, ".graft-runtime-install.lock"))).toBe(
      false
    )
  })

  it("invalidates damaged content and recovers only from checksum-valid assets", async () => {
    const root = temporaryDesktopRoot()
    const data = fixture()
    const options = {
      arch: "arm64",
      desktopRoot: root,
      download: data.download,
      extract: data.extract,
      manifest: data.manifest,
      platform: "darwin",
    }
    await installGraftRuntime(options)
    const destinations = runtimeDestinations(root, data.config)
    fs.writeFileSync(destinations.cli, "old or damaged runtime")
    expect(isRuntimeCacheValid(root, data.config)).toBe(false)

    const corruptedDownload = vi.fn(
      async (_url: string, destination: string) => {
        fs.writeFileSync(destination, "corrupted archive")
      }
    )
    await expect(
      installGraftRuntime({ ...options, download: corruptedDownload })
    ).rejects.toThrow("checksum mismatch")
    expect(fs.readFileSync(destinations.cli, "utf8")).toBe(
      "old or damaged runtime"
    )
    expect(isRuntimeCacheValid(root, data.config)).toBe(false)

    const recovered = await installGraftRuntime(options)
    expect(recovered.cacheHit).toBe(false)
    expect(fs.readFileSync(destinations.cli)).toEqual(data.cliBinary)
    expect(fs.readFileSync(destinations.extension)).toEqual(
      data.extensionBinary
    )
    expect(isRuntimeCacheValid(root, data.config)).toBe(true)
  })

  it("does not report an old runtime as an offline fallback", async () => {
    const root = temporaryDesktopRoot()
    const data = fixture()
    const destinations = runtimeDestinations(root, data.config)
    fs.mkdirSync(path.dirname(destinations.cli), { recursive: true })
    fs.mkdirSync(path.dirname(destinations.extension), { recursive: true })
    fs.writeFileSync(destinations.cli, "graft 0.5.8")
    fs.writeFileSync(destinations.extension, "sqlite-graft 0.5.8")

    await expect(
      installGraftRuntime({
        arch: "arm64",
        desktopRoot: root,
        download: async () => {
          throw new Error("offline")
        },
        extract: data.extract,
        manifest: data.manifest,
        platform: "darwin",
      })
    ).rejects.toThrow("offline")
    expect(fs.readFileSync(destinations.cli, "utf8")).toBe("graft 0.5.8")
    expect(isRuntimeCacheValid(root, data.config)).toBe(false)
  })

  it("reports exact checksum mismatches", () => {
    const root = temporaryDesktopRoot()
    const file = path.join(root, "asset")
    fs.writeFileSync(file, "contents")
    expect(() => verifyFileSha256(file, "0".repeat(64), "fixture")).toThrow(
      `received ${sha256("contents")}`
    )
  })
})
