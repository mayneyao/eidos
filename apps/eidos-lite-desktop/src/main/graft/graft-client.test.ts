import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { EIDOS_LITE_SERVICE_ENVIRONMENTS } from "../../shared/service-environment"
import { GraftClient, isOfficialRemoteUrl } from "./graft-client"
import type { GraftSdkTransport } from "./graft-sdk-transport"

function createUnusedTransport(): GraftSdkTransport {
  return {
    target: null,
    open: vi.fn(async () => undefined),
    reopen: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    command: vi.fn(async () => {
      throw new Error("Unexpected Graft SDK command")
    }),
    clone: vi.fn(async () => {
      throw new Error("Unexpected Graft SDK clone")
    }),
  }
}

describe("GraftClient", () => {
  it("rejects non-official product remotes before invoking the SDK", async () => {
    const client = new GraftClient({ sdkTransport: createUnusedTransport() })
    await expect(
      client.configureOfficialRemote(
        "/tmp/space",
        "s3://bucket/space",
        "secret"
      )
    ).rejects.toThrow("only the official")
  })

  it("allows only the selected environment's official repository origin", () => {
    const staging = EIDOS_LITE_SERVICE_ENVIRONMENTS.staging.syncRemoteOrigin
    const production =
      EIDOS_LITE_SERVICE_ENVIRONMENTS.production.syncRemoteOrigin

    expect(
      isOfficialRemoteUrl(
        "https://sync-staging.eidos.space/u-alice/project",
        staging
      )
    ).toBe(true)
    expect(
      isOfficialRemoteUrl(
        "graft+https://sync.eidos.space/u-alice/project",
        production
      )
    ).toBe(true)
    expect(
      isOfficialRemoteUrl("https://sync.eidos.space/u-alice/project", staging)
    ).toBe(false)
    expect(
      isOfficialRemoteUrl(
        "https://token@sync-staging.eidos.space/u-alice/project",
        staging
      )
    ).toBe(false)
    expect(
      isOfficialRemoteUrl(
        "https://sync-staging.eidos.space/u-alice/project?token=secret",
        staging
      )
    ).toBe(false)
  })

  it("uses status paths without running a whole-Space diff during inspection", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-inspect-")
    )
    await fs.mkdir(path.join(root, ".graft"))
    const commands: string[] = []
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command) => {
        commands.push(command)
        if (command === "sdkVersion") return "0.3.0-rc.0"
        if (command === "statusIncremental") {
          return {
            generation: 1,
            change_token: "token-1",
            status: {
              dirty: true,
              current_head: "head",
              paths: Array.from({ length: 1_000 }, (_, index) => ({
                path: `file-${index}.txt`,
                change: "modified",
              })),
            },
            telemetry: {
              status_cache_hit: false,
              persistent_snapshot_hit: true,
              persistent_snapshot_saved: false,
              stability_retries: 1,
            },
          }
        }
        throw new Error(`Unexpected Graft command: ${command}`)
      }),
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(client.inspectSpace(root)).resolves.toMatchObject({
        initialized: true,
        clean: false,
        changedPaths: 1_000,
      })
      expect(commands).toEqual(["sdkVersion", "statusIncremental"])
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("reads history metadata and Remote URLs without scanning repository status", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-metadata-apis-")
    )
    const commands: string[] = []
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command) => {
        commands.push(command)
        if (command === "repositoryMetadata") {
          return {
            current_head: "a".repeat(64),
            current_branch: "main",
            upstream: { remote: "origin", branch: "main" },
            telemetry: { paths_examined: 0 },
          }
        }
        if (command === "historySummaries") {
          return {
            commits: [],
            has_more: false,
            next_cursor: null,
            telemetry: { paths_examined: 0 },
          }
        }
        if (command === "listRemotes") {
          return {
            remotes: [
              {
                name: "origin",
                kind: "http",
                url: "https://sync-staging.eidos.space/u-alice/project",
              },
            ],
            telemetry: { paths_examined: 0 },
          }
        }
        throw new Error(`Unexpected Graft command: ${command}`)
      }),
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(client.history(root)).resolves.toMatchObject({
        currentHead: "a".repeat(64),
        currentBranch: "main",
        commits: [],
      })
      await expect(client.remoteUrl(root)).resolves.toBe(
        "https://sync-staging.eidos.space/u-alice/project"
      )
      expect(commands).toEqual([
        "repositoryMetadata",
        "historySummaries",
        "listRemotes",
      ])
      expect(commands).not.toContain("status")
      expect(commands).not.toContain("statusIncremental")
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("retries one incremental status read after a repository stale race", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-stale-status-")
    )
    let statusCalls = 0
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command) => {
        if (command !== "statusIncremental") {
          throw new Error(`Unexpected Graft command: ${command}`)
        }
        statusCalls += 1
        if (statusCalls === 1) {
          throw Object.assign(new Error("repository changed during status"), {
            code: "GRAFT_SDK_REPOSITORY_STALE",
          })
        }
        return {
          generation: 2,
          change_token: "stable-token",
          status: { dirty: false, paths: [] },
          telemetry: {
            status_cache_hit: false,
            persistent_snapshot_hit: false,
            persistent_snapshot_saved: true,
            stability_retries: 1,
          },
        }
      }),
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      await expect(client.status(root)).resolves.toMatchObject({
        dirty: false,
        generation: 2,
        changeToken: "stable-token",
        stabilityRetries: 1,
      })
      expect(statusCalls).toBe(2)
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("hydrates commit paths and one selected diff without loading full commit details", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-history-apis-")
    )
    const commands: string[] = []
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command) => {
        commands.push(command)
        if (command === "commitChangedPaths") {
          return {
            revision: "b".repeat(64),
            parent: "a".repeat(64),
            paths: [
              {
                path: "data.eidos",
                change: "modified",
                kind: "sqlite_database",
                storage: "sqlite_snapshot",
              },
            ],
            has_more: false,
            next_cursor: null,
          }
        }
        if (command === "diffPaths") {
          return {
            paths: [
              {
                path: "data.eidos",
                diff: {
                  paths: [
                    {
                      path: "data.eidos",
                      change: "modified",
                      kind: "sqlite_database",
                    },
                  ],
                  files: [],
                },
              },
            ],
            has_more: false,
            next_cursor: null,
          }
        }
        throw new Error(`Unexpected Graft command: ${command}`)
      }),
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      const revision = "b".repeat(64)
      await expect(
        client.revisionChanges(root, revision)
      ).resolves.toMatchObject({
        from: "a".repeat(64),
        to: revision,
        paths: [{ path: "data.eidos" }],
        files: [],
      })
      await expect(
        client.pathDiff(root, "data.eidos", {
          from: "a".repeat(64),
          to: revision,
        })
      ).resolves.toMatchObject({ paths: [{ path: "data.eidos" }] })
      expect(commands).toEqual(["commitChangedPaths", "diffPaths"])
      expect(commands).not.toContain("commitDetails")
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("bounds explicit path diffs to one UI page and returns a host cursor", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-diff-page-")
    )
    let requestedPaths: string[] = []
    const allPaths = Array.from(
      { length: 250 },
      (_, index) => `file-${String(index).padStart(3, "0")}.txt`
    )
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command, args) => {
        if (command === "statusIncremental") {
          return {
            generation: 1,
            change_token: "token",
            status: {
              dirty: true,
              paths: allPaths.map((relativePath) => ({
                path: relativePath,
                change: "modified",
              })),
            },
            telemetry: { status_cache_hit: false },
          }
        }
        if (command === "diffPaths") {
          requestedPaths = (args[0] as { paths: string[] }).paths
          return {
            paths: requestedPaths.map((relativePath) => ({
              path: relativePath,
              diff: {
                paths: [{ path: relativePath, change: "modified" }],
                files: [],
              },
            })),
            has_more: false,
            next_cursor: null,
          }
        }
        throw new Error(`Unexpected Graft command: ${command}`)
      }),
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })

    try {
      const page = await client.workingDiff(root, false, { limit: 100 })
      expect(requestedPaths).toHaveLength(100)
      expect(page).toMatchObject({
        totalPaths: 250,
        hasMore: true,
        nextCursor: "file-099.txt",
      })
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("batches ignore inspection instead of crossing the SDK boundary per path", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-ignore-batch-")
    )
    const batchSizes: number[] = []
    const transport: GraftSdkTransport = {
      target: root,
      open: vi.fn(async () => undefined),
      reopen: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      command: vi.fn(async (command, args) => {
        if (command !== "isIgnoredPaths") {
          throw new Error(`Unexpected Graft command: ${command}`)
        }
        const options = args[0] as { paths: string[] }
        batchSizes.push(options.paths.length)
        return {
          paths: options.paths.map((relativePath) => ({
            path: relativePath,
            is_ignored: relativePath.startsWith("generated/"),
            is_tracked: false,
            is_directory: false,
            has_tracked_descendants: false,
          })),
        }
      }),
      clone: vi.fn(async () => undefined),
    }
    const client = new GraftClient({ sdkTransport: transport })
    const paths = Array.from({ length: 2_001 }, (_, index) =>
      index % 2 === 0 ? `generated/${index}.txt` : `notes/${index}.txt`
    )

    try {
      const inspections = await client.inspectIgnores(root, paths)
      expect(inspections).toHaveLength(2_001)
      expect(inspections.map((inspection) => inspection.path)).toEqual(paths)
      expect(batchSizes).toEqual([1_000, 1_000, 1])
      expect(inspections.filter((item) => item.isIgnored)).toHaveLength(1_001)
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
