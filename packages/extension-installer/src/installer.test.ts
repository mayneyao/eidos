import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { create } from "tar"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  commitPreparedExtensionInstall,
  prepareGitHubExtensionInstall,
  readExtensionInstallTarget,
} from "./node"
import {
  normalizeGitHubExtensionRequest,
  resolveGitHubExtensionSnapshot,
} from "./github"
import { parseGitHubTarball } from "./tarball"

const roots: string[] = []
const COMMIT = "0123456789abcdef0123456789abcdef01234567"

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-extension-installer-"))
  roots.push(root)
  return root
}

function manifest(version = "1.0.0", extraRead: string[] = []): string {
  return JSON.stringify({
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
  })
}

async function createArchive(
  root: string,
  files: Record<string, string>,
  setup?: (repositoryRoot: string) => Promise<void>
): Promise<Uint8Array> {
  const archiveRoot = path.join(root, "example-task-counter-archive")
  await mkdir(archiveRoot, { recursive: true })
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(archiveRoot, ...file.split("/"))
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  await setup?.(archiveRoot)
  const stream = create({ cwd: root, gzip: true, portable: true }, [
    path.basename(archiveRoot),
  ])
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return new Uint8Array(Buffer.concat(chunks))
}

function githubFetch(archive: Uint8Array): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes("/commits/")) {
      return new Response(JSON.stringify({ sha: COMMIT }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }
    if (url.endsWith(`/tarball/${COMMIT}`)) {
      return new Response(archive, {
        status: 200,
        headers: { "content-type": "application/gzip" },
      })
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("GitHub source normalization", () => {
  it("normalizes repository shorthand, .git suffix, and an omitted ref", () => {
    expect(
      normalizeGitHubExtensionRequest({
        repository: "example/task-counter.git",
      })
    ).toEqual({
      repository: "https://github.com/example/task-counter",
      owner: "example",
      repo: "task-counter",
      requested: "HEAD",
    })
  })

  it("rejects non-GitHub hosts, repository subpaths, credentials, and ref newlines", () => {
    expect(() =>
      normalizeGitHubExtensionRequest({ repository: "https://example.com/a/b" })
    ).toThrow("github.com")
    expect(() =>
      normalizeGitHubExtensionRequest({
        repository: "https://github.com/a/b/tree/main",
      })
    ).toThrow("owner/repository")
    expect(() =>
      normalizeGitHubExtensionRequest({
        repository: "https://token@github.com/a/b",
      })
    ).toThrow("canonical")
    expect(() =>
      normalizeGitHubExtensionRequest({
        repository: "a/b",
        requested: "main\nnext",
      })
    ).toThrow("ref")
  })
})

describe("GitHub immutable snapshot", () => {
  it("resolves a mutable ref before downloading the exact commit archive", async () => {
    const root = await temporaryRoot()
    const archive = await createArchive(root, {
      "extension.json": manifest(),
      "src/extension.ts": "export const activate = () => undefined\n",
    })
    const fetcher = githubFetch(archive)

    const result = await resolveGitHubExtensionSnapshot(
      {
        repository: "https://github.com/example/task-counter",
        requested: "refs/heads/main",
      },
      { fetch: fetcher }
    )

    expect(result.source).toEqual({
      kind: "github",
      repository: "https://github.com/example/task-counter",
      requested: "refs/heads/main",
      commit: COMMIT,
    })
    expect(result.files.map((file) => file.path)).toEqual([
      "extension.json",
      "src/extension.ts",
    ])
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `https://api.github.com/repos/example/task-counter/tarball/${COMMIT}`,
      expect.objectContaining({ redirect: "follow" })
    )
  })
})

describe("GitHub tarball validation", () => {
  it("rejects source-provided lock files and symbolic links", async () => {
    const firstRoot = await temporaryRoot()
    const lockArchive = await createArchive(firstRoot, {
      "extension.json": manifest(),
      "extension.lock.json": "{}",
    })
    await expect(parseGitHubTarball(lockArchive)).rejects.toThrow(
      "host-managed"
    )

    const secondRoot = await temporaryRoot()
    const linkedArchive = await createArchive(
      secondRoot,
      { "extension.json": manifest(), "src/extension.ts": "source" },
      async (repositoryRoot) => {
        await symlink(
          "extension.json",
          path.join(repositoryRoot, "manifest-link")
        )
      }
    )
    await expect(parseGitHubTarball(linkedArchive)).rejects.toThrow(
      "regular file"
    )
  })

  it("enforces expanded byte and file count limits", async () => {
    const root = await temporaryRoot()
    const archive = await createArchive(root, {
      "extension.json": manifest(),
      "src/extension.ts": "1234567890",
    })
    await expect(
      parseGitHubTarball(archive, { maxTotalBytes: 8 })
    ).rejects.toThrow("expands beyond")
    await expect(parseGitHubTarball(archive, { maxFiles: 1 })).rejects.toThrow(
      "more than 1 files"
    )
  })
})

describe("atomic extension installation", () => {
  it("previews, locks, and atomically installs an immutable package", async () => {
    const root = await temporaryRoot()
    const spaceRoot = path.join(root, "space")
    const extensionsRoot = path.join(spaceRoot, ".eidos", "extensions")
    const stagingParent = path.join(
      spaceRoot,
      ".eidos",
      "cache",
      "extensions",
      "staging"
    )
    await mkdir(extensionsRoot, { recursive: true })
    const archive = await createArchive(root, {
      "extension.json": manifest(),
      "src/extension.ts": "export const activate = () => undefined\n",
      "README.md": "# Task Counter\n",
    })

    const prepared = await prepareGitHubExtensionInstall({
      request: { repository: "example/task-counter", requested: "v1.0.0" },
      stagingParent,
      extensionsRoot,
      hostVersion: "0.33.0",
      fetch: githubFetch(archive),
    })

    expect(prepared).toMatchObject({
      operation: "install",
      canonicalId: "example.task-counter",
      source: { requested: "v1.0.0", commit: COMMIT },
      fileCount: 4,
      permissionChanges: [
        { kind: "files.read", value: "**/*.md", change: "added" },
      ],
    })
    expect(prepared.fileChanges.map((change) => change.path)).toEqual([
      "README.md",
      "extension.json",
      "extension.lock.json",
      "src/extension.ts",
    ])
    await expect(
      commitPreparedExtensionInstall({
        prepared,
        extensionsRoot,
        hostVersion: "0.33.0",
      })
    ).resolves.toEqual({
      canonicalId: "example.task-counter",
      operation: "install",
    })

    const installedRoot = path.join(extensionsRoot, "example.task-counter")
    expect(
      JSON.parse(
        await readFile(path.join(installedRoot, "extension.lock.json"), "utf8")
      )
    ).toEqual(prepared.lock)
    await expect(
      readExtensionInstallTarget(installedRoot, "0.33.0")
    ).resolves.toMatchObject({
      locallyModified: false,
      lock: { contentDigest: prepared.inspection.contentDigest },
    })
  })

  it("shows update diffs and refuses to overwrite a locally modified install", async () => {
    const root = await temporaryRoot()
    const spaceRoot = path.join(root, "space")
    const extensionsRoot = path.join(spaceRoot, ".eidos", "extensions")
    const stagingParent = path.join(
      spaceRoot,
      ".eidos",
      "cache",
      "extensions",
      "staging"
    )
    await mkdir(extensionsRoot, { recursive: true })
    const firstArchive = await createArchive(path.join(root, "first"), {
      "extension.json": manifest(),
      "src/extension.ts": "export const activate = () => 'first'\n",
    })
    const first = await prepareGitHubExtensionInstall({
      request: { repository: "example/task-counter", requested: "v1" },
      stagingParent,
      extensionsRoot,
      hostVersion: "0.33.0",
      fetch: githubFetch(firstArchive),
    })
    await commitPreparedExtensionInstall({
      prepared: first,
      extensionsRoot,
      hostVersion: "0.33.0",
    })

    const secondArchive = await createArchive(path.join(root, "second"), {
      "extension.json": manifest("1.1.0", ["notes/*.txt"]),
      "src/extension.ts": "export const activate = () => 'second'\n",
    })
    const update = await prepareGitHubExtensionInstall({
      request: { repository: "example/task-counter", requested: "v1.1.0" },
      stagingParent,
      extensionsRoot,
      hostVersion: "0.33.0",
      fetch: githubFetch(secondArchive),
    })
    expect(update.operation).toBe("update")
    expect(update.fileChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "extension.json", kind: "modified" }),
        expect.objectContaining({ path: "src/extension.ts", kind: "modified" }),
      ])
    )
    expect(update.permissionChanges).toContainEqual({
      kind: "files.read",
      value: "notes/*.txt",
      change: "added",
    })

    await writeFile(
      path.join(extensionsRoot, "example.task-counter", "src", "extension.ts"),
      "export const activate = () => 'local edit'\n"
    )
    await expect(
      commitPreparedExtensionInstall({
        prepared: update,
        extensionsRoot,
        hostVersion: "0.33.0",
      })
    ).rejects.toThrow("changed after review")
    await expect(
      prepareGitHubExtensionInstall({
        request: { repository: "example/task-counter", requested: "v1.1.0" },
        stagingParent,
        extensionsRoot,
        hostVersion: "0.33.0",
        fetch: githubFetch(secondArchive),
      })
    ).rejects.toThrow("local changes")
  })
})
