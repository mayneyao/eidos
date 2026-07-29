import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { EidosFileRuntimeDataSource } from "@eidos.space/eidos-file"
import { openEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const repositoryRoot = path.resolve(appRoot, "../..")
const selectedBackend =
  process.env.EIDOS_LITE_GRAFT_BACKEND === "cli" ? "cli" : "sdk"

function createGraftClient(): GraftClient {
  return new GraftClient({
    backend: selectedBackend,
    ...(selectedBackend === "sdk"
      ? { sdkTransport: new GraftInProcessTransport() }
      : {}),
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
        backend: selectedBackend,
        version: selectedBackend === "sdk" ? "0.1.0" : "0.8.1",
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
      expect(reopened).toEqual(first)
    } finally {
      await client.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 20_000)

  it("keeps official HTTP credentials in SDK session memory only", async () => {
    if (selectedBackend !== "sdk") return
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
    if (selectedBackend !== "sdk") return
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
