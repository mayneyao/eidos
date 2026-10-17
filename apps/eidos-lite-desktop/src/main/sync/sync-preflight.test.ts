import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  assertSyncPreflightApproval,
  createSyncPreflight,
  MAX_SYNC_FILE_BYTES,
} from "./sync-preflight"

describe("Eidos Sync preflight", () => {
  it("includes hidden files, filename keywords, credentials, and supported large files without confirmation", async () => {
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
      await fs.writeFile(path.join(root, "secret-garden.jpg"), "cover image")
      await fs.mkdir(path.join(root, ".agents"))
      await fs.writeFile(path.join(root, ".agents", "SKILL.md"), "skill")
      await fs.writeFile(path.join(root, "archive.bin"), "")
      await fs.truncate(path.join(root, "archive.bin"), MAX_SYNC_FILE_BYTES)

      const preflight = await createSyncPreflight(root)
      expect(preflight.fileCount).toBe(7)
      expect(preflight.eidosFileCount).toBe(1)
      expect(preflight.totalBytes).toBeGreaterThanOrEqual(MAX_SYNC_FILE_BYTES)
      expect(preflight.excluded).toEqual([
        { relativePath: ".DS_Store", reason: "os-noise" },
        { relativePath: ".graft", reason: "graft-metadata" },
        { relativePath: "tasks.eidos-wal", reason: "temporary-file" },
      ])
      expect(preflight.warnings).toEqual([])
      expect(preflight.warningCount).toBe(0)
      expect(preflight.blockers).toEqual([])
      expect(() =>
        assertSyncPreflightApproval(preflight, {
          manifestId: preflight.manifestId,
        })
      ).not.toThrow()
      expect(() =>
        assertSyncPreflightApproval(preflight, {
          manifestId: "0".repeat(64),
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
          concerns: ["file-too-large"],
        }),
      ])
      expect(() =>
        assertSyncPreflightApproval(preflight, {
          manifestId: preflight.manifestId,
        })
      ).toThrow("cannot upload safely")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("excludes ignored untracked trees without hiding tracked ignored files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-sync-ignore-"))
    try {
      await fs.mkdir(path.join(root, "node_modules", "pkg"), {
        recursive: true,
      })
      await fs.mkdir(path.join(root, "generated"))
      await fs.mkdir(path.join(root, "notes"))
      await fs.writeFile(
        path.join(root, "node_modules", "pkg", "index.js"),
        "ignored"
      )
      await fs.writeFile(path.join(root, "generated", "tracked.txt"), "kept")
      await fs.writeFile(path.join(root, "notes.txt"), "visible")
      await fs.writeFile(path.join(root, "notes", "nested.txt"), "nested")

      let ignoreBatches = 0

      const preflight = await createSyncPreflight(root, {
        inspectIgnores: async (relativePaths) => {
          ignoreBatches += 1
          return new Map(
            relativePaths.map((relativePath) => [
              relativePath,
              {
                isIgnored:
                  relativePath === "node_modules" ||
                  relativePath === "generated" ||
                  relativePath.startsWith("generated/"),
                isTracked:
                  relativePath === "generated" ||
                  relativePath.startsWith("generated/"),
                isDirectory: ["node_modules", "generated"].includes(
                  relativePath
                ),
                hasTrackedDescendants: relativePath === "generated",
              },
            ])
          )
        },
      })

      expect(preflight.fileCount).toBe(3)
      expect(preflight.warnings).toContainEqual({
        relativePath: "generated/tracked.txt",
        size: 4,
        concerns: ["tracked-ignored"],
      })
      expect(() =>
        assertSyncPreflightApproval(preflight, {
          manifestId: preflight.manifestId,
        })
      ).not.toThrow()
      expect(ignoreBatches).toBe(2)
      expect(preflight.excluded).toContainEqual({
        relativePath: "node_modules",
        reason: "graft-ignore",
      })
      expect(
        preflight.excluded.some((entry) =>
          entry.relativePath.startsWith("node_modules/")
        )
      ).toBe(false)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("bounds informational samples without requiring confirmation", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-sync-review-sample-")
    )
    try {
      await Promise.all(
        Array.from({ length: 150 }, (_, index) =>
          fs.writeFile(path.join(root, `.hidden-${index}.txt`), "review")
        )
      )

      const preflight = await createSyncPreflight(root, {
        inspectIgnores: async (relativePaths) =>
          new Map(
            relativePaths.map((relativePath) => [
              relativePath,
              {
                isIgnored: true,
                isTracked: true,
                isDirectory: false,
                hasTrackedDescendants: false,
              },
            ])
          ),
      })
      expect(preflight.warningCount).toBe(150)
      expect(preflight.warnings).toHaveLength(100)
      expect(preflight.blockerCount).toBe(0)
      expect(preflight.excludedCount).toBe(0)
      expect(() =>
        assertSyncPreflightApproval(preflight, {
          manifestId: preflight.manifestId,
        })
      ).not.toThrow()
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
        expect(() =>
          assertSyncPreflightApproval(preflight, {
            manifestId: preflight.manifestId,
          })
        ).toThrow("cannot upload safely")
      } finally {
        await Promise.all([
          fs.rm(root, { recursive: true, force: true }),
          fs.rm(outside, { recursive: true, force: true }),
        ])
      }
    }
  )
})
