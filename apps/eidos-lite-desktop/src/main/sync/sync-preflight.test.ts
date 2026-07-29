import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  assertSyncPreflightApproval,
  createSyncPreflight,
  LARGE_FILE_WARNING_BYTES,
  MAX_SYNC_FILE_BYTES,
} from "./sync-preflight"

describe("Eidos Sync preflight", () => {
  it("reports whole-Space scope, exclusions, and explicit risk confirmation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-sync-scope-"))
    try {
      await fs.mkdir(path.join(root, ".graft"))
      await fs.writeFile(path.join(root, ".graft", "index"), "private")
      await fs.writeFile(path.join(root, ".DS_Store"), "noise")
      await fs.writeFile(path.join(root, "tasks.eidos"), "database")
      await fs.writeFile(path.join(root, "tasks.eidos-wal"), "temporary")
      await fs.writeFile(path.join(root, "notes.txt"), "notes")
      await fs.writeFile(path.join(root, ".env.local"), "TOKEN=local")
      await fs.writeFile(path.join(root, "backup.pem"), "private key")
      await fs.writeFile(path.join(root, "archive.bin"), "")
      await fs.truncate(
        path.join(root, "archive.bin"),
        LARGE_FILE_WARNING_BYTES
      )

      const preflight = await createSyncPreflight(root)
      expect(preflight.fileCount).toBe(5)
      expect(preflight.eidosFileCount).toBe(1)
      expect(preflight.totalBytes).toBeGreaterThanOrEqual(
        LARGE_FILE_WARNING_BYTES
      )
      expect(preflight.excluded).toEqual([
        { relativePath: ".DS_Store", reason: "os-noise" },
        { relativePath: ".graft", reason: "graft-metadata" },
        { relativePath: "tasks.eidos-wal", reason: "temporary-file" },
      ])
      expect(preflight.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            relativePath: ".env.local",
            concerns: ["hidden", "suspected-secret"],
          }),
          expect.objectContaining({
            relativePath: "backup.pem",
            concerns: ["suspected-secret"],
          }),
          expect.objectContaining({
            relativePath: "archive.bin",
            concerns: ["large-file"],
          }),
        ])
      )
      expect(preflight.blockers).toEqual([])
      expect(() =>
        assertSyncPreflightApproval(preflight, {
          manifestId: preflight.manifestId,
          confirmWarnings: false,
        })
      ).toThrow("Confirm")
      expect(() =>
        assertSyncPreflightApproval(preflight, {
          manifestId: preflight.manifestId,
          confirmWarnings: true,
        })
      ).not.toThrow()
      expect(() =>
        assertSyncPreflightApproval(preflight, {
          manifestId: "0".repeat(64),
          confirmWarnings: true,
        })
      ).toThrow("changed")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("blocks files above the hard limit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-sync-large-"))
    try {
      const oversized = path.join(root, "oversized.bin")
      await fs.writeFile(oversized, "")
      await fs.truncate(oversized, MAX_SYNC_FILE_BYTES + 1)
      const preflight = await createSyncPreflight(root)
      expect(preflight.blockers).toEqual([
        expect.objectContaining({
          relativePath: "oversized.bin",
          concerns: ["large-file", "file-too-large"],
        }),
      ])
      expect(() =>
        assertSyncPreflightApproval(preflight, {
          manifestId: preflight.manifestId,
          confirmWarnings: true,
        })
      ).toThrow("cannot upload safely")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform === "win32")(
    "blocks symlinks instead of silently following them",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-sync-link-"))
      const outside = await fs.mkdtemp(
        path.join(os.tmpdir(), "eidos-sync-link-target-")
      )
      try {
        await fs.writeFile(path.join(outside, "secret.txt"), "outside")
        await fs.symlink(outside, path.join(root, "linked-folder"))
        const preflight = await createSyncPreflight(root)
        expect(preflight.blockers).toEqual([
          expect.objectContaining({
            relativePath: "linked-folder",
            concerns: ["symlink"],
          }),
        ])
      } finally {
        await Promise.all([
          fs.rm(root, { recursive: true, force: true }),
          fs.rm(outside, { recursive: true, force: true }),
        ])
      }
    }
  )
})
