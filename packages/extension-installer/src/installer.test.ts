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
  uninstallExtensionPackage,
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
      return new Response(Uint8Array.from(archive), {
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

  it("normalizes an optional monorepo package path", () => {
    expect(
      normalizeGitHubExtensionRequest({
        repository: "example/extensions",
        requested: "main",
        subdirectory: "packages/task-counter",
      })
    ).toEqual({
      repository: "https://github.com/example/extensions",
      owner: "example",
      repo: "extensions",
      requested: "main",
      subdirectory: "packages/task-counter",
    })
  })

  it("rejects non-GitHub hosts, repository URL subpaths, credentials, and unsafe values", () => {
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
    expect(() =>
      normalizeGitHubExtensionRequest({
        repository: "a/b",
        subdirectory: "../task-counter",
      })
    ).toThrow("package path")
    expect(() =>
      normalizeGitHubExtensionRequest({
        repository: "a/b",
        subdirectory: " packages/task-counter ",
      })
    ).toThrow("package path")
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

  it("extracts only the selected package from a monorepo snapshot", async () => {
    const root = await temporaryRoot()
    const archive = await createArchive(root, {
      "README.md": "# Extensions\n",
      "packages/other/extension.json": manifest(),
      "packages/other/extension.lock.json": "ignored outside selection",
      "packages/task-counter/extension.json": manifest(),
      "packages/task-counter/src/extension.ts":
        "export const activate = () => undefined\n",
    })

    const result = await resolveGitHubExtensionSnapshot(
      {
        repository: "example/extensions",
        requested: "main",
        subdirectory: "packages/task-counter",
      },
      { fetch: githubFetch(archive) }
    )

    expect(result.source).toEqual({
      kind: "github",
      repository: "https://github.com/example/extensions",
      requested: "main",
      commit: COMMIT,
      subdirectory: "packages/task-counter",
    })
    expect(result.files.map((file) => file.path)).toEqual([
      "extension.json",
      "src/extension.ts",
    ])
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

  it("omits local development artifacts from an install snapshot", async () => {
    const root = await temporaryRoot()
    const archive = await createArchive(
      root,
      {
        "extension.json": manifest(),
        "package.json": '{"private":true}\n',
        "src/extension.ts": "export const activate = () => undefined\n",
        "node_modules/dependency/index.js": "generated dependency\n",
        "dist/extension.js": "generated bundle\n",
        "coverage/index.html": "test output\n",
      },
      async (repositoryRoot) => {
        await symlink(
          "index.js",
          path.join(repositoryRoot, "node_modules", "dependency", "linked.js")
        )
      }
    )

    const files = await parseGitHubTarball(archive)

    expect(files.map(({ path: filePath }) => filePath)).toEqual([
      "extension.json",
      "package.json",
      "src/extension.ts",
    ])
  })

  it("counts ignored archive bytes against the expansion limit", async () => {
    const root = await temporaryRoot()
    const archive = await createArchive(root, {
      "extension.json": "{}",
      "node_modules/dependency/blob.bin": "1234567890",
    })

    await expect(
      parseGitHubTarball(archive, {
        maxFileBytes: 64,
        maxTotalBytes: 8,
      })
    ).rejects.toThrow("expands beyond")
  })

  it("reports a missing monorepo package path", async () => {
    const root = await temporaryRoot()
    const archive = await createArchive(root, {
      "extension.json": manifest(),
    })
    await expect(
      parseGitHubTarball(archive, { subdirectory: "packages/missing" })
    ).rejects.toThrow("packages/missing")
  })
})

describe("atomic extension installation", () => {
  it("removes a misplaced file from the extensions root", async () => {
    const root = await temporaryRoot()
    const extensionsRoot = path.join(root, "space", ".eidos", "extensions")
    const stagingParent = path.join(
      root,
      "space",
      ".eidos",
      "cache",
      "extensions",
      "staging"
    )
    await mkdir(extensionsRoot, { recursive: true })
    await mkdir(stagingParent, { recursive: true })
    const misplacedManifest = path.join(extensionsRoot, "extension.json")
    await writeFile(misplacedManifest, manifest())

    await uninstallExtensionPackage(
      misplacedManifest,
      stagingParent,
      undefined,
      "0.33.0"
    )

    await expect(readFile(misplacedManifest)).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  it("removes an invalid symlink without following its target", async () => {
    const root = await temporaryRoot()
    const extensionsRoot = path.join(root, "space", ".eidos", "extensions")
    const stagingParent = path.join(
      root,
      "space",
      ".eidos",
      "cache",
      "extensions",
      "staging"
    )
    await mkdir(extensionsRoot, { recursive: true })
    await mkdir(stagingParent, { recursive: true })
    const externalSource = path.join(root, "external-extension.json")
    const invalidLink = path.join(extensionsRoot, "linked-extension")
    await writeFile(externalSource, manifest())
    await symlink(externalSource, invalidLink)

    await uninstallExtensionPackage(
      invalidLink,
      stagingParent,
      undefined,
      "0.33.0"
    )

    await expect(readFile(invalidLink)).rejects.toMatchObject({
      code: "ENOENT",
    })
    await expect(readFile(externalSource, "utf8")).resolves.toBe(manifest())
  })

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

  it("records a monorepo package path in the host-owned lock", async () => {
    const root = await temporaryRoot()
    const extensionsRoot = path.join(root, "space", ".eidos", "extensions")
    const stagingParent = path.join(
      root,
      "space",
      ".eidos",
      "cache",
      "extensions",
      "staging"
    )
    await mkdir(extensionsRoot, { recursive: true })
    const archive = await createArchive(root, {
      "examples/task-counter/extension.json": manifest(),
      "examples/task-counter/src/extension.ts":
        "export const activate = () => 1\n",
      "examples/unrelated/README.md": "not installed\n",
    })

    const prepared = await prepareGitHubExtensionInstall({
      request: {
        repository: "example/extensions",
        requested: "main",
        subdirectory: "examples/task-counter",
      },
      stagingParent,
      extensionsRoot,
      hostVersion: "0.33.0",
      fetch: githubFetch(archive),
    })

    expect(prepared.lock.source.subdirectory).toBe("examples/task-counter")
    expect(prepared.fileChanges.map((change) => change.path)).not.toContain(
      "examples/unrelated/README.md"
    )
  })

  it("does not silently update from another path in the same repository", async () => {
    const root = await temporaryRoot()
    const extensionsRoot = path.join(root, "space", ".eidos", "extensions")
    const stagingParent = path.join(
      root,
      "space",
      ".eidos",
      "cache",
      "extensions",
      "staging"
    )
    await mkdir(extensionsRoot, { recursive: true })
    const archive = await createArchive(root, {
      "packages/first/extension.json": manifest(),
      "packages/first/src/extension.ts": "export const activate = () => 1\n",
      "packages/second/extension.json": manifest("1.1.0"),
      "packages/second/src/extension.ts": "export const activate = () => 2\n",
    })
    const first = await prepareGitHubExtensionInstall({
      request: {
        repository: "example/extensions",
        subdirectory: "packages/first",
      },
      stagingParent,
      extensionsRoot,
      hostVersion: "0.33.0",
      fetch: githubFetch(archive),
    })
    await commitPreparedExtensionInstall({
      prepared: first,
      extensionsRoot,
      hostVersion: "0.33.0",
    })

    await expect(
      prepareGitHubExtensionInstall({
        request: {
          repository: "example/extensions",
          subdirectory: "packages/second",
        },
        stagingParent,
        extensionsRoot,
        hostVersion: "0.33.0",
        fetch: githubFetch(archive),
      })
    ).rejects.toThrow("different GitHub source location")
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
