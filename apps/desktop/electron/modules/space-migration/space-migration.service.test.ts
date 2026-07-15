// @vitest-environment node

import "reflect-metadata"

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { MainWindowProvider } from "../space-management/main-window.provider"
import type { SpaceRegistry } from "../space-management/space-registry"

function createEmptyLegacySpace() {
  const sourceRoot = mkdtempSync(
    path.join(tmpdir(), "eidos-migration-service-")
  )
  const eidosRoot = path.join(sourceRoot, ".eidos")
  mkdirSync(path.join(eidosRoot, "files"), { recursive: true })
  const database = new Database(path.join(eidosRoot, "db.sqlite3"))
  database.exec(`
    CREATE TABLE eidos__tree (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      parent_id TEXT,
      position REAL,
      icon TEXT,
      is_deleted BOOLEAN DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE eidos__docs (
      id TEXT PRIMARY KEY,
      content TEXT,
      markdown TEXT,
      is_day_page BOOLEAN DEFAULT 0,
      meta TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE eidos__extensions (
      id TEXT PRIMARY KEY,
      slug TEXT,
      name TEXT,
      description TEXT,
      type TEXT,
      version TEXT,
      code TEXT,
      ts_code TEXT,
      meta TEXT,
      icon TEXT,
      marketplace_id TEXT,
      enabled BOOLEAN,
      bindings TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    INSERT INTO eidos__extensions
      (id, slug, name, type, version, code, ts_code, meta, enabled)
    VALUES
      ('ext-1', 'task-counter', 'Task Counter', 'script', '0.1.0',
       'exports.run = () => 1', 'export function run() { return 1 }',
       '{"type":"tableAction"}', 1);
  `)
  database.close()
  return sourceRoot
}

describe("SpaceMigrationService", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  async function createService(sourceRoot: string) {
    const send = vi.fn()
    const registry = {
      getSpace: vi.fn(() => ({
        id: "legacy",
        name: "Legacy Space",
        mode: "legacy",
        path: sourceRoot,
      })),
      getSpacePathConflict: vi.fn(() => null),
    } as unknown as SpaceRegistry
    const windowProvider = {
      getWindow: () => ({ webContents: { send } }),
    } as unknown as MainWindowProvider
    const { SpaceMigrationService } = await import("./space-migration.service")
    return {
      service: new SpaceMigrationService(registry, windowProvider),
      registry,
      send,
    }
  }

  it("creates a server-side plan and exports it with progress", async () => {
    const sourceRoot = createEmptyLegacySpace()
    roots.push(sourceRoot)
    const targetParent = mkdtempSync(
      path.join(tmpdir(), "eidos-migration-target-")
    )
    roots.push(targetParent)
    const targetRoot = path.join(targetParent, "File Space")
    const { service, send } = await createService(sourceRoot)

    const handle = service.createPlan("legacy", targetRoot)

    expect(handle).toMatchObject({
      spaceId: "legacy",
      spaceName: "Legacy Space",
      plan: {
        targetRoot,
        summary: { documentCount: 0, tableCount: 0, errorCount: 0 },
      },
    })
    const result = await service.executePlan(handle.id)

    expect(result).toMatchObject({
      status: "completed",
      targetRoot,
      validation: { baseValid: true },
    })
    expect(existsSync(path.join(targetRoot, "main.base"))).toBe(true)
    expect(send).toHaveBeenCalledWith(
      "space-migration:progress",
      expect.objectContaining({ planId: handle.id, phase: "finalizing" })
    )
    await expect(service.executePlan(handle.id)).rejects.toThrow(
      "Migration plan expired"
    )
  })

  it("rejects non-empty and registered target folders before planning", async () => {
    const sourceRoot = createEmptyLegacySpace()
    roots.push(sourceRoot)
    const targetRoot = mkdtempSync(path.join(tmpdir(), "eidos-used-target-"))
    roots.push(targetRoot)
    mkdirSync(path.join(targetRoot, "content"))
    const { service, registry } = await createService(sourceRoot)

    expect(() => service.createPlan("legacy", targetRoot)).toThrow(
      "Migration target must be empty"
    )

    rmSync(path.join(targetRoot, "content"), { recursive: true })
    vi.mocked(registry.getSpacePathConflict).mockReturnValue({
      type: "same",
      space: {
        id: "existing",
        name: "Existing Space",
        mode: "file",
        path: targetRoot,
      },
    })
    expect(() => service.createPlan("legacy", targetRoot)).toThrow(
      "conflicts with registered Space Existing Space"
    )
  })

  it("lists and atomically exports one legacy extension outside runtime roots", async () => {
    const sourceRoot = createEmptyLegacySpace()
    roots.push(sourceRoot)
    const destination = mkdtempSync(
      path.join(tmpdir(), "eidos-extension-export-")
    )
    roots.push(destination)
    const { service } = await createService(sourceRoot)

    expect(service.listLegacyExtensions("legacy")).toEqual([
      expect.objectContaining({
        id: "ext-1",
        slug: "task-counter",
        previouslyEnabled: true,
        portability: {
          readiness: "manual-port",
          reasonCode: "manual-command-port",
          legacyContribution: "tableAction",
          candidateContribution: "command",
          metadataState: "valid",
          sourceState: "typescript-and-javascript",
          legacyFileExtensions: [],
          summary: expect.any(String),
          manualSteps: expect.any(Array),
        },
      }),
    ])

    const result = await service.exportLegacyExtension(
      "legacy",
      "ext-1",
      destination
    )
    expect(result.targetDirectory).toBe(
      path.join(realpathSync.native(destination), "task-counter")
    )
    expect(existsSync(result.metadataPath)).toBe(true)
    expect(existsSync(result.sourcePath!)).toBe(true)

    await expect(
      service.exportLegacyExtension("legacy", "ext-1", destination)
    ).rejects.toThrow("Migration target must be empty")

    const runtimeRoot = path.join(destination, ".eidos", "extensions")
    mkdirSync(runtimeRoot, { recursive: true })
    await expect(
      service.exportLegacyExtension("legacy", "ext-1", runtimeRoot)
    ).rejects.toThrow("cannot be exported under .eidos/extensions")

    const disguisedRuntimeRoot = path.join(destination, "extension-output")
    symlinkSync(runtimeRoot, disguisedRuntimeRoot, "dir")
    await expect(
      service.exportLegacyExtension("legacy", "ext-1", disguisedRuntimeRoot)
    ).rejects.toThrow("cannot be exported under .eidos/extensions")

    await expect(
      service.exportLegacyExtension("legacy", "ext-1", sourceRoot)
    ).rejects.toThrow("outside the source Space")
  })
})
