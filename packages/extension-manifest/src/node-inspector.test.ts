import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  discoverExtensionPackages,
  inspectExtensionPackage,
  inspectExtensionPackageSnapshot,
} from "./node"
import type { ExtensionManifestV1 } from "./index"

const temporaryRoots: string[] = []

function validManifest(): ExtensionManifestV1 {
  return {
    manifestVersion: 1,
    publisher: "example",
    name: "task-counter",
    displayName: "Task Counter",
    version: "1.0.0",
    engines: { eidos: ">=0.34.0 <1.0.0" },
    entrypoints: { worker: "src/extension.ts" },
    contributes: {
      commands: [{ id: "example.task-counter.count", title: "Count tasks" }],
    },
    permissions: {
      files: { read: ["**/*.md"], write: [] },
      network: [],
    },
  }
}

async function createPackage(): Promise<{
  extensionsRoot: string
  packageRoot: string
}> {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-extension-test-"))
  temporaryRoots.push(root)
  const extensionsRoot = path.join(root, ".eidos", "extensions")
  const packageRoot = path.join(extensionsRoot, "example.task-counter")
  await mkdir(path.join(packageRoot, "src"), { recursive: true })
  await writeFile(
    path.join(packageRoot, "extension.json"),
    `${JSON.stringify(validManifest(), null, 2)}\n`
  )
  await writeFile(
    path.join(packageRoot, "src", "extension.ts"),
    [
      'import { helper } from "./helper.js"',
      "export const activate = () => helper()",
      "",
    ].join("\n")
  )
  await writeFile(
    path.join(packageRoot, "src", "helper.ts"),
    "export const helper = () => 1\n"
  )
  return { extensionsRoot, packageRoot }
}

afterEach(async () => {
  const roots = temporaryRoots.splice(0)
  await Promise.all(
    roots.map((root) => rm(root, { recursive: true, force: true }))
  )
})

function codes(result: Awaited<ReturnType<typeof inspectExtensionPackage>>) {
  return result.diagnostics.map(({ code }) => code)
}

describe("inspectExtensionPackage", () => {
  it("discovers a valid package without loading or compiling it", async () => {
    const { packageRoot } = await createPackage()

    const result = await inspectExtensionPackage(packageRoot, {
      hostVersion: "0.34.0",
    })

    expect(result.status).toBe("ready")
    expect(result.canonicalId).toBe("example.task-counter")
    expect(result.contentDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(result.permissionHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(result.normalizedPermissions).toEqual({
      files: { read: ["**/*.md"], write: [] },
      network: [],
    })
    expect(result.files.map(({ path: filePath }) => filePath)).toEqual([
      "extension.json",
      "src/extension.ts",
      "src/helper.ts",
    ])
    expect(result.diagnostics).toEqual([])
  })

  it("returns the exact stable bytes used for the inspected digest", async () => {
    const { packageRoot } = await createPackage()

    const snapshot = await inspectExtensionPackageSnapshot(packageRoot, {
      hostVersion: "0.34.0",
    })

    expect(snapshot.inspection.status).toBe("ready")
    expect(
      new TextDecoder().decode(
        snapshot.files.find(({ path }) => path === "src/helper.ts")?.content
      )
    ).toBe("export const helper = () => 1\n")

    await writeFile(
      path.join(packageRoot, "src", "helper.ts"),
      "export const helper = () => 999\n"
    )
    expect(
      new TextDecoder().decode(
        snapshot.files.find(({ path }) => path === "src/helper.ts")?.content
      )
    ).toBe("export const helper = () => 1\n")
  })

  it("excludes the lock from content identity and reports local changes", async () => {
    const { packageRoot } = await createPackage()
    const initial = await inspectExtensionPackage(packageRoot)
    expect(initial.contentDigest).toBeDefined()
    const lockFile = path.join(packageRoot, "extension.lock.json")
    await writeFile(
      lockFile,
      JSON.stringify({
        lockVersion: 1,
        source: {
          kind: "github",
          repository: "https://github.com/example/task-counter",
          requested: "v1.0.0",
          commit: "a".repeat(40),
        },
        contentDigest: initial.contentDigest,
      })
    )

    const locked = await inspectExtensionPackage(packageRoot)
    expect(locked.status).toBe("ready")
    expect(locked.contentDigest).toBe(initial.contentDigest)
    expect(codes(locked)).not.toContain("package-locally-modified")

    await writeFile(
      path.join(packageRoot, "src", "helper.ts"),
      "export const helper = () => 2\n"
    )
    const modified = await inspectExtensionPackage(packageRoot)
    expect(modified.status).toBe("ready")
    expect(modified.contentDigest).not.toBe(initial.contentDigest)
    expect(modified.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "package-locally-modified",
        severity: "warning",
      })
    )
  })

  it("rejects imports that bypass the vendored-package boundary", async () => {
    const { packageRoot } = await createPackage()
    await writeFile(
      path.join(packageRoot, "src", "extension.ts"),
      [
        'import fs from "node:fs"',
        'const name = "helper"',
        'void import("./" + name)',
        'require("./helper")',
        "export { fs }",
      ].join("\n")
    )

    const result = await inspectExtensionPackage(packageRoot)

    expect(result.status).toBe("invalid")
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "package-import-unsupported",
        "package-import-unsupported",
        "package-import-unsupported",
      ])
    )
  })

  it("rejects missing entrypoints, invalid UTF-8, symlinks, and hard links", async () => {
    const { packageRoot } = await createPackage()
    await rm(path.join(packageRoot, "src", "extension.ts"))
    await writeFile(
      path.join(packageRoot, "src", "invalid.ts"),
      Buffer.from([0xff, 0xfe])
    )
    await symlink(
      path.join(packageRoot, "src", "helper.ts"),
      path.join(packageRoot, "src", "linked.ts")
    )
    await link(
      path.join(packageRoot, "src", "helper.ts"),
      path.join(packageRoot, "src", "hard-linked.ts")
    )

    const result = await inspectExtensionPackage(packageRoot)

    expect(result.status).toBe("invalid")
    expect(codes(result)).toEqual(
      expect.arrayContaining([
        "package-entrypoint-missing",
        "package-import-syntax",
        "package-symlink",
        "package-hardlink",
      ])
    )
  })

  it("enforces explicit package resource limits", async () => {
    const { packageRoot } = await createPackage()
    const result = await inspectExtensionPackage(packageRoot, {
      maxEntries: 2,
      maxFiles: 2,
    })

    expect(result.status).toBe("invalid")
    expect(codes(result)).toContain("package-limit")
  })
})

describe("discoverExtensionPackages", () => {
  it("returns an empty discovery for a missing root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-extension-test-"))
    temporaryRoots.push(root)
    const missing = path.join(root, ".eidos", "extensions")

    await expect(discoverExtensionPackages(missing)).resolves.toEqual({
      extensionsRoot: missing,
      packages: [],
      diagnostics: [],
    })
  })

  it("reports valid, incompatible, and invalid root entries separately", async () => {
    const { extensionsRoot } = await createPackage()
    await writeFile(path.join(extensionsRoot, "README.md"), "not a package\n")
    await symlink(
      path.join(extensionsRoot, "example.task-counter"),
      path.join(extensionsRoot, "example.linked")
    )

    const result = await discoverExtensionPackages(extensionsRoot, {
      hostVersion: "1.2.0",
    })

    expect(
      result.packages.map(({ directoryName, status }) => [
        directoryName,
        status,
      ])
    ).toEqual([
      ["README.md", "invalid"],
      ["example.linked", "invalid"],
      ["example.task-counter", "incompatible"],
    ])
  })

  it("stops discovery before an oversized root can allocate unbounded state", async () => {
    const { extensionsRoot } = await createPackage()
    await writeFile(path.join(extensionsRoot, "README.md"), "one\n")

    const result = await discoverExtensionPackages(extensionsRoot, {
      maxPackages: 1,
    })

    expect(result.packages).toEqual([])
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "package-limit" })
    )
  })
})
