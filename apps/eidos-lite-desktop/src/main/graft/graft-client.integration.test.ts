import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { EidosFileRuntimeDataSource } from "@eidos.space/eidos-file"
import {
  createEidosFile,
  openEidosFile,
} from "@eidos.space/eidos-file/node-sqlite"

import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const repositoryRoot = path.resolve(appRoot, "../..")
function createGraftClient(): GraftClient {
  return new GraftClient({
    sdkTransport: new GraftInProcessTransport(),
  })
}

async function validateEidosFile(filePath: string): Promise<void> {
  const runtime = openEidosFile(filePath, { readonly: true })
  try {
    expect(runtime.info().formatVersion).toBe("1.0")
    expect(runtime.listTables().length).toBeGreaterThan(0)
  } finally {
    runtime.close()
  }
}

async function eidosRowCount(filePath: string): Promise<number> {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    const source = new EidosFileRuntimeDataSource(
      runtime,
      path.basename(filePath)
    )
    return (await source.getSnapshot()).tables[0]?.rowCount ?? 0
  } finally {
    runtime.close()
  }
}

async function insertBlankRow(filePath: string): Promise<void> {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    const source = new EidosFileRuntimeDataSource(
      runtime,
      path.basename(filePath)
    )
    const tableId = (await source.getSnapshot()).tables[0]?.table.id
    if (!tableId) throw new Error("Fixture has no table")
    await source.insertRow(tableId, {})
  } finally {
    runtime.close()
  }
}

describe("whole-Space real Graft integration", () => {
  it("keeps an open Eidos File identity stable while initializing versioning", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-open-runtime-")
    )
    const filePath = path.join(root, "records.eidos")
    const runtime = createEidosFile(filePath)
    const client = createGraftClient()
    try {
      const before = await fs.stat(filePath)
      const identity = { device: before.dev, inode: before.ino }
      await client.open(root)
      await client.initialize(root)
      const afterInitialize = await fs.stat(filePath)
      expect({
        device: afterInitialize.dev,
        inode: afterInitialize.ino,
      }).toEqual(identity)
      await client.stageAll(root)
      const afterStage = await fs.stat(filePath)
      expect({ device: afterStage.dev, inode: afterStage.ino }).toEqual(
        identity
      )
      await client.commit(root, "Enable Space versioning")
      const after = await fs.stat(filePath)

      expect({ device: after.dev, inode: after.ino }).toEqual(identity)
      expect(runtime.info().formatVersion).toBe("1.0")
    } finally {
      runtime.close()
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 120_000)

  it("inspects dirty status paths without running a whole-Space diff", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-status-")
    )
    const client = createGraftClient()
    try {
      await fs.writeFile(path.join(root, "notes.txt"), "base notes\n")
      await client.open(root)
      await client.initialize(root)
      await client.stageAll(root)
      await client.commit(root, "Base Space")
      await fs.writeFile(path.join(root, "notes.txt"), "changed notes\n")
      const workingDiff = vi
        .spyOn(client, "workingDiff")
        .mockRejectedValue(new Error("whole-Space diff must not run"))

      await expect(client.inspectSpace(root)).resolves.toMatchObject({
        initialized: true,
        clean: false,
        changedPaths: 1,
      })
      expect(workingDiff).not.toHaveBeenCalled()
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 120_000)

  it("keeps UTF-8 Markdown text across the sniff boundary in future checkpoints", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-utf8-boundary-")
    )
    const relativePath = "Eidos_Sync_商业计划书.md"
    const filePath = path.join(root, relativePath)
    const client = createGraftClient()
    try {
      await fs.writeFile(filePath, `${"a".repeat(8_191)}中\n`)
      await client.open(root)
      await client.initialize(root)
      await client.stageAll(root)
      await client.commit(root, "UTF-8 boundary base")
      const firstHead = (await client.status(root)).currentHead
      expect(firstHead).toMatch(/^[0-9a-f]{64}$/)

      const firstDiff = await client.revisionDiff(root, firstHead!, null)
      expect(firstDiff.paths).toContainEqual(
        expect.objectContaining({ path: relativePath, kind: "text_file" })
      )

      await fs.appendFile(filePath, "future checkpoint\n")
      await client.stageAll(root)
      await client.commit(root, "UTF-8 boundary future checkpoint")
      const secondHead = (await client.status(root)).currentHead
      expect(secondHead).toMatch(/^[0-9a-f]{64}$/)

      const futureDiff = await client.revisionDiff(root, secondHead!, firstHead)
      expect(futureDiff.paths).toContainEqual(
        expect.objectContaining({ path: relativePath, kind: "text_file" })
      )
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 120_000)

  it("pushes and clones multiple Eidos Files plus an ordinary asset", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-graft-"))
    const source = path.join(root, "source")
    const remote = path.join(root, "remote")
    const clone = path.join(root, "clone")
    await Promise.all([fs.mkdir(source), fs.mkdir(remote), fs.mkdir(clone)])
    const client = createGraftClient()
    try {
      await client.open(source)
      await Promise.all([
        fs.copyFile(
          path.join(
            repositoryRoot,
            "apps/eidos-file-web/fixtures/project-tracker.eidos"
          ),
          path.join(source, "project.eidos")
        ),
        fs.copyFile(
          path.join(
            repositoryRoot,
            "apps/eidos-file-web/fixtures/personal-crm.eidos"
          ),
          path.join(source, "crm.eidos")
        ),
        fs.writeFile(path.join(source, "notes.txt"), "ordinary asset\n"),
      ])

      await client.initialize(source)
      await client.stageAll(source)
      await client.commit(source, "Eidos Lite whole Space integration")
      const remoteUrl = `fs://${remote}`
      await client.addRemote(source, "origin", remoteUrl)
      await expect(client.remoteUrl(source)).resolves.toBe(remoteUrl)
      await client.setMainUpstream(source)
      await client.push(source)
      await client.clone(clone, remoteUrl)

      await Promise.all([
        validateEidosFile(path.join(clone, "project.eidos")),
        validateEidosFile(path.join(clone, "crm.eidos")),
      ])
      await expect(
        fs.readFile(path.join(clone, "notes.txt"), "utf8")
      ).resolves.toBe("ordinary asset\n")
      const status = await client.inspectSpace(clone)
      expect(status).toMatchObject({
        available: true,
        backend: "sdk",
        version: "0.3.1",
        initialized: true,
        clean: true,
        changedPaths: 0,
      })
      await fs.writeFile(path.join(clone, "notes.txt"), "changed locally\n")
      await expect(client.inspectSpace(clone)).resolves.toMatchObject({
        initialized: true,
        clean: false,
        changedPaths: 1,
      })
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 120_000)

  it("diffs and restores the whole Space without rewriting history", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-restore-")
    )
    const sourceRoot = path.join(root, "source")
    await fs.mkdir(sourceRoot)
    const projectPath = path.join(sourceRoot, "project.eidos")
    const crmPath = path.join(sourceRoot, "crm.eidos")
    const client = createGraftClient()
    try {
      await client.open(sourceRoot)
      await Promise.all([
        fs.copyFile(
          path.join(
            repositoryRoot,
            "apps/eidos-file-web/fixtures/project-tracker.eidos"
          ),
          projectPath
        ),
        fs.copyFile(
          path.join(
            repositoryRoot,
            "apps/eidos-file-web/fixtures/personal-crm.eidos"
          ),
          crmPath
        ),
        fs.writeFile(path.join(sourceRoot, "notes.txt"), "base notes\n"),
        fs.writeFile(path.join(sourceRoot, "removed.txt"), "restore me\n"),
      ])

      const baseCounts = await Promise.all([
        eidosRowCount(projectPath),
        eidosRowCount(crmPath),
      ])
      await client.initialize(sourceRoot)
      await client.stageAll(sourceRoot)
      await client.commit(sourceRoot, "Base Space")
      const baseHead = (await client.status(sourceRoot)).currentHead
      expect(baseHead).toMatch(/^[0-9a-f]{64}$/)

      await Promise.all([
        insertBlankRow(projectPath),
        insertBlankRow(crmPath),
        fs.writeFile(path.join(sourceRoot, "notes.txt"), "changed notes\n"),
        fs.writeFile(path.join(sourceRoot, "added.txt"), "new path\n"),
        fs.unlink(path.join(sourceRoot, "removed.txt")),
      ])
      await client.stageAll(sourceRoot)
      await client.commit(sourceRoot, "Changed Space")
      const changedHead = (await client.status(sourceRoot)).currentHead
      expect(changedHead).toMatch(/^[0-9a-f]{64}$/)

      const comparison = await client.compareRevisions(
        sourceRoot,
        baseHead!,
        changedHead!
      )
      expect(new Set(comparison.paths.map((change) => change.path))).toEqual(
        new Set([
          "added.txt",
          "crm.eidos",
          "notes.txt",
          "project.eidos",
          "removed.txt",
        ])
      )
      expect(
        comparison.files
          .filter((file) => file.path.endsWith(".eidos"))
          .every((file) => file.rowDiffAvailable)
      ).toBe(true)

      for (const change of comparison.paths) {
        await client.restorePath(
          sourceRoot,
          baseHead!,
          changedHead!,
          change.path
        )
      }
      await client.stageAll(sourceRoot)
      await client.commit(sourceRoot, "Restore Base Space")

      await expect(
        fs.readFile(path.join(sourceRoot, "notes.txt"), "utf8")
      ).resolves.toBe("base notes\n")
      await expect(
        fs.readFile(path.join(sourceRoot, "removed.txt"), "utf8")
      ).resolves.toBe("restore me\n")
      await expect(
        fs.stat(path.join(sourceRoot, "added.txt"))
      ).rejects.toMatchObject({ code: "ENOENT" })
      await expect(
        Promise.all([eidosRowCount(projectPath), eidosRowCount(crmPath)])
      ).resolves.toEqual(baseCounts)
      await expect(client.workingDiff(sourceRoot)).resolves.toMatchObject({
        paths: [],
      })
      const history = await client.history(sourceRoot)
      expect(history.commits).toHaveLength(3)
      expect(history.commits[0]?.message).toBe("Restore Base Space")
      expect(history.commits[0]?.parent).toBe(changedHead)
      expect(history.commits[0]?.files).toBe(5)

      await insertBlankRow(projectPath)
      await expect(
        client.inspectSpace(sourceRoot, {
          verifyPaths: ["project.eidos"],
        })
      ).resolves.toMatchObject({
        initialized: true,
        clean: false,
        changedPaths: 1,
      })
      await expect(
        client.workingChanges(sourceRoot, {
          verifyPaths: ["project.eidos"],
        })
      ).resolves.toMatchObject({
        paths: [{ path: "project.eidos", change: "modified" }],
        totalPaths: 1,
      })
      await client.stageAll(sourceRoot, {
        verifyPaths: ["project.eidos"],
      })
      await client.commit(sourceRoot, "Post-restore edit")
      await expect(
        client.status(sourceRoot, {
          verifyPaths: ["project.eidos"],
        })
      ).resolves.toMatchObject({ dirty: false, changedPaths: 0 })
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 120_000)

  it("retains, closes, and reopens one SDK session for the Space", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-session-")
    )
    const client = createGraftClient()
    try {
      await fs.writeFile(path.join(root, "notes.txt"), "session lifecycle\n")
      await client.open(root)
      await client.initialize(root)
      await client.stageAll(root)
      await client.commit(root, "Session lifecycle")
      await expect(
        client.operationMaterializesWorktree("status")
      ).resolves.toBe(false)
      await expect(
        client.operationMaterializesWorktree("restore")
      ).resolves.toBe(true)

      const first = await client.status(root)
      await client.close()
      await client.open(root)
      const reopened = await client.status(root)
      expect(reopened).toMatchObject({
        dirty: first.dirty,
        currentHead: first.currentHead,
        currentBranch: first.currentBranch,
        ahead: first.ahead,
        behind: first.behind,
        hasConflicts: first.hasConflicts,
        changedPaths: first.changedPaths,
        paths: first.paths,
      })
      expect(reopened.generation).toBeLessThanOrEqual(first.generation ?? 0)
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 20_000)

  it("pages history and targeted commit diffs without loading the repository", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-pages-")
    )
    const client = createGraftClient()
    try {
      await client.open(root)
      await client.initialize(root)
      await Promise.all([
        fs.writeFile(path.join(root, "one.txt"), "one\n"),
        fs.writeFile(path.join(root, "two.txt"), "two\n"),
      ])
      await client.stageAll(root)
      await client.commit(root, "Base")
      await fs.writeFile(path.join(root, "one.txt"), "one changed\n")
      await client.stageAll(root)
      await client.commit(root, "First change")
      await Promise.all([
        fs.writeFile(path.join(root, "one.txt"), "one again\n"),
        fs.writeFile(path.join(root, "two.txt"), "two again\n"),
      ])
      await client.stageAll(root)
      await client.commit(root, "Second change")

      const firstHistory = await client.history(root, 2)
      expect(firstHistory.commits.map((item) => item.message)).toEqual([
        "Second change",
        "First change",
      ])
      expect(firstHistory.hasMore).toBe(true)
      expect(firstHistory.nextCursor).toBeTruthy()
      const secondHistory = await client.history(root, 2, {
        after: firstHistory.nextCursor ?? undefined,
      })
      expect(secondHistory.commits.map((item) => item.message)).toEqual([
        "Base",
      ])

      const commit = firstHistory.commits[0]
      expect(commit).toBeDefined()
      const firstDiff = await client.revisionDiff(
        root,
        commit!.id,
        commit!.parent,
        { limit: 1 }
      )
      expect(firstDiff.paths).toHaveLength(1)
      expect(firstDiff.hasMore).toBe(true)
      expect(firstDiff.nextCursor).toBeTruthy()
      const secondDiff = await client.revisionDiff(
        root,
        commit!.id,
        commit!.parent,
        { limit: 1, after: firstDiff.nextCursor ?? undefined }
      )
      expect(
        new Set(
          [...firstDiff.paths, ...secondDiff.paths].map((item) => item.path)
        )
      ).toEqual(new Set(["one.txt", "two.txt"]))

      const controller = new AbortController()
      controller.abort()
      await expect(
        client.history(root, 10, { signal: controller.signal })
      ).rejects.toMatchObject({ name: "AbortError" })
      await expect(client.status(root)).resolves.toMatchObject({ dirty: false })
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 20_000)

  it("keeps ignored tracked files on disk while explicitly removing them from the index", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-ignore-")
    )
    const client = createGraftClient()
    const ignoredPath = path.join(root, "generated.txt")
    try {
      await client.open(root)
      await client.initialize(root)
      await fs.writeFile(ignoredPath, "generated\n")
      await client.stageAll(root)
      await client.commit(root, "Track generated file")
      await fs.writeFile(path.join(root, ".gitignore"), "generated.txt\n")
      await client.stageAll(root)
      await client.commit(root, "Ignore generated file")

      await expect(
        client.inspectIgnore(root, "generated.txt")
      ).resolves.toEqual({
        path: "generated.txt",
        isIgnored: true,
        isTracked: true,
        isDirectory: false,
        hasTrackedDescendants: false,
      })
      await expect(
        client.inspectIgnores(root, ["generated.txt", ".gitignore"])
      ).resolves.toEqual([
        {
          path: "generated.txt",
          isIgnored: true,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        },
        {
          path: ".gitignore",
          isIgnored: false,
          isTracked: true,
          isDirectory: false,
          hasTrackedDescendants: false,
        },
      ])
      const inventory = await client.trackedIgnored(root, { limit: 100 })
      expect(inventory).toMatchObject({
        paths: ["generated.txt"],
        total: 1,
        hasMore: false,
      })
      const expectedHead = (await client.status(root)).currentHead
      expect(expectedHead).toMatch(/^[0-9a-f]{64}$/)
      await expect(
        client.untrackPaths(root, inventory.paths, "0".repeat(64))
      ).rejects.toThrow()
      await expect(client.status(root)).resolves.toMatchObject({
        currentHead: expectedHead,
        dirty: false,
      })
      await client.untrackPaths(root, inventory.paths, expectedHead!)
      await client.commit(root, "Stop tracking ignored file")

      await expect(fs.readFile(ignoredPath, "utf8")).resolves.toBe(
        "generated\n"
      )
      await client.stageAll(root)
      await expect(client.status(root)).resolves.toMatchObject({ dirty: false })
      await expect(client.trackedIgnored(root)).resolves.toMatchObject({
        total: 0,
        paths: [],
      })
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 20_000)

  it("invalidates incremental status for external writers and remains usable after cancel and close", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-incremental-")
    )
    const client = createGraftClient()
    try {
      await client.open(root)
      await client.initialize(root)
      await Promise.all(
        Array.from({ length: 2_000 }, (_, index) =>
          fs.writeFile(path.join(root, `file-${index}.txt`), `${index}\n`)
        )
      )

      const controller = new AbortController()
      const cancelled = client.status(root, { signal: controller.signal })
      setTimeout(() => controller.abort(), 2)
      await expect(cancelled).rejects.toMatchObject({ name: "AbortError" })

      const first = await client.status(root)
      const cached = await client.status(root)
      expect(cached).toMatchObject({
        changeToken: first.changeToken,
        statusCacheHit: true,
      })
      await fs.writeFile(path.join(root, "external-writer.txt"), "external\n")
      const external = await client.status(root)
      expect(external.changeToken).not.toBe(first.changeToken)
      expect(external.paths).toContain("external-writer.txt")

      const inFlight = client.status(root)
      const closing = client.close()
      await expect(
        Promise.race([
          Promise.allSettled([inFlight, closing]),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("in-flight close timed out")),
              5_000
            )
          ),
        ])
      ).resolves.toBeDefined()
      await client.open(root)
      await expect(client.status(root)).resolves.toMatchObject({
        dirty: true,
      })
    } finally {
      await client.close().catch(() => undefined)
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 30_000)

  it("keeps official HTTP credentials in SDK session memory only", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-credential-")
    )
    const client = createGraftClient()
    const token = "sdk-memory-only-credential-probe"
    const remoteUrl =
      "graft+https://sync-staging.eidos.space/sdk-test/credential-probe"
    try {
      await client.open(root)
      await client.initialize(root)
      await client.configureOfficialRemote(root, remoteUrl, token)
      await expect(client.remoteUrl(root)).resolves.toBe(
        "https://sync-staging.eidos.space/sdk-test/credential-probe"
      )
      const config = await fs.readFile(
        path.join(root, ".graft", "config.toml"),
        "utf8"
      )
      expect(config).not.toContain(token)
      expect(config).not.toContain("GRAFT_REMOTE_TOKEN")
      await client.clearHttpCredentials(root)
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("sends an explicit push credential on every SDK HTTP request", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-graft-http-credential-")
    )
    const token = "sdk-http-credential-probe"
    const observedRequests: Array<{
      authorized: boolean
      method?: string
      url?: string
    }> = []
    const server = http.createServer((request, response) => {
      observedRequests.push({
        authorized: request.headers.authorization === `Bearer ${token}`,
        method: request.method,
        url: request.url,
      })
      response.writeHead(404, {
        "content-type": "application/problem+json",
        "graft-protocol": "1",
      })
      response.end(
        JSON.stringify({
          type: "about:blank",
          title: "not found",
          status: 404,
          detail: "credential probe",
        })
      )
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("Credential probe server did not bind a TCP port")
    }
    const client = createGraftClient()
    try {
      await fs.writeFile(path.join(root, "notes.txt"), "credential probe\n")
      await client.open(root)
      await client.initialize(root)
      await client.stageAll(root)
      await client.commit(root, "HTTP credential probe")
      await client.addRemote(
        root,
        "origin",
        `graft+http://127.0.0.1:${address.port}/org/repository`
      )
      await expect(client.push(root, token)).rejects.toThrow()
      expect(observedRequests.length).toBeGreaterThan(0)
      expect(observedRequests.filter((request) => !request.authorized)).toEqual(
        []
      )
    } finally {
      await client.close()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("reports pull and divergence state after fetch without materializing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-sync-"))
    const source = path.join(root, "source")
    const remote = path.join(root, "remote")
    const clone = path.join(root, "clone")
    await Promise.all([fs.mkdir(source), fs.mkdir(remote), fs.mkdir(clone)])
    const sourceClient = createGraftClient()
    const cloneClient = createGraftClient()
    try {
      await fs.copyFile(
        path.join(
          repositoryRoot,
          "apps/eidos-file-web/fixtures/project-tracker.eidos"
        ),
        path.join(source, "project.eidos")
      )
      await sourceClient.open(source)
      await sourceClient.initialize(source)
      await sourceClient.stageAll(source)
      await sourceClient.commit(source, "Initial hosted Space")
      const remoteUrl = `fs://${remote}`
      await sourceClient.addRemote(source, "origin", remoteUrl)
      await sourceClient.setMainUpstream(source)
      await sourceClient.push(source)
      await cloneClient.clone(clone, remoteUrl)
      await cloneClient.open(clone)

      await fs.writeFile(path.join(source, "remote-note.txt"), "remote one\n")
      await sourceClient.stageAll(source)
      await sourceClient.commit(source, "Remote checkpoint")
      await sourceClient.push(source)
      await cloneClient.fetch(clone)
      await expect(cloneClient.status(clone)).resolves.toMatchObject({
        dirty: false,
        ahead: 0,
        behind: 1,
        hasConflicts: false,
      })
      await cloneClient.pull(clone)
      await expect(
        fs.readFile(path.join(clone, "remote-note.txt"), "utf8")
      ).resolves.toBe("remote one\n")

      await fs.writeFile(path.join(clone, "local-note.txt"), "local\n")
      await cloneClient.stageAll(clone)
      await cloneClient.commit(clone, "Local checkpoint")
      await fs.writeFile(path.join(source, "remote-note.txt"), "remote two\n")
      await sourceClient.stageAll(source)
      await sourceClient.commit(source, "Second remote checkpoint")
      await sourceClient.push(source)
      await cloneClient.fetch(clone)
      await expect(cloneClient.status(clone)).resolves.toMatchObject({
        dirty: false,
        ahead: 1,
        behind: 1,
        hasConflicts: false,
      })
      await expect(
        fs.readFile(path.join(clone, "remote-note.txt"), "utf8")
      ).resolves.toBe("remote one\n")
      await validateEidosFile(path.join(clone, "project.eidos"))
    } finally {
      await Promise.all([
        sourceClient.close().catch(() => undefined),
        cloneClient.close().catch(() => undefined),
      ])
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 20_000)
})
