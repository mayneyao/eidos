import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import packageMetadata from "../package.json" with { type: "json" }

import { runExtensionCli } from "./command"
import {
  checkExtensionPackage,
  createExtensionProject,
  createLegacyPortingProject,
} from "./index"

const roots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-extension-cli-"))
  roots.push(root)
  return root
}

async function createLegacyArchive(
  parent: string,
  options: {
    candidate?: "command" | "file-editor" | null
    readiness?: string
    fileExtensions?: string[]
  } = {}
): Promise<string> {
  const archiveRoot = path.join(parent, `archive-${roots.length}`)
  await mkdir(path.join(archiveRoot, "src"), { recursive: true })
  const candidate =
    options.candidate === undefined ? "command" : options.candidate
  await writeFile(
    path.join(archiveRoot, "legacy-extension.json"),
    `${JSON.stringify(
      {
        format: "eidos-legacy-extension-archive",
        formatVersion: 2,
        identity: { id: "legacy-1", slug: "task-counter" },
        presentation: {
          name: "Task Counter",
          description: "Counts legacy tasks",
        },
        sourceModel: { type: candidate === "file-editor" ? "block" : "script" },
        portability: {
          readiness: options.readiness ?? "manual-port",
          reasonCode:
            options.readiness === "blocked-by-v1"
              ? "unsupported-contribution"
              : candidate === "file-editor"
                ? "manual-file-editor-port"
                : "manual-command-port",
          legacyContribution:
            options.readiness === "blocked-by-v1"
              ? "tableView"
              : candidate === "file-editor"
                ? "fileHandler"
                : "tableAction",
          candidateContribution: candidate,
          metadataState: "valid",
          sourceState: "typescript",
          legacyFileExtensions: options.fileExtensions ?? [],
          summary: "This extension requires a reviewed manual port.",
          manualSteps: ["Replace the legacy global API."],
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  )
  await writeFile(
    path.join(archiveRoot, "README.md"),
    "Legacy archive\n",
    "utf8"
  )
  await writeFile(
    path.join(
      archiveRoot,
      "src",
      candidate === "file-editor" ? "view.tsx" : "extension.ts"
    ),
    "export const legacySource = true\n",
    "utf8"
  )
  return archiveRoot
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe("extension developer workflow", () => {
  it("supports top-level help and version flags", async () => {
    for (const args of [["--help"], ["--version"]]) {
      const stdout: string[] = []
      const stderr: string[] = []
      expect(
        await runExtensionCli(args, {
          stdout: (value) => stdout.push(value),
          stderr: (value) => stderr.push(value),
        })
      ).toBe(0)
      expect(stdout.join("\n")).not.toBe("")
      expect(stderr).toEqual([])
    }
  })

  it.each(["command", "text-editor"] as const)(
    "creates and checks a %s project with the production compiler",
    async (template) => {
      const outDir = await temporaryRoot()
      const created = await createExtensionProject({
        canonicalId: `example.${template}`,
        template,
        outDir,
        engineRange: ">=0.33.0",
      })

      const result = await checkExtensionPackage({
        packageRoot: created.packageRoot,
        hostVersion: "0.33.0",
      })

      expect(result).toMatchObject({
        ok: true,
        status: "ready",
        canonicalId: `example.${template}`,
        diagnostics: [],
      })
      expect(result.entrypoints.map((item) => item.kind)).toEqual([
        template === "command" ? "worker" : "ui",
      ])

      expect(created.files).toEqual(
        expect.arrayContaining([
          ".gitignore",
          "package.json",
          "tsconfig.json",
          "extension.json",
          "README.md",
        ])
      )
      const projectManifest = JSON.parse(
        await readFile(path.join(created.packageRoot, "package.json"), "utf8")
      )
      expect(projectManifest).toEqual({
        name: `example.${template}`,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: { check: "eidos-extension check ." },
        devDependencies: {
          "@eidos.space/extension-cli": `^${packageMetadata.version}`,
          "@eidos.space/extension-sdk": `^${packageMetadata.version}`,
        },
      })
      expect(
        JSON.parse(
          await readFile(
            path.join(created.packageRoot, "tsconfig.json"),
            "utf8"
          )
        )
      ).toMatchObject({
        compilerOptions: {
          moduleResolution: "Bundler",
          noEmit: true,
          strict: true,
          types: [],
        },
        include: ["src/**/*.ts", "src/**/*.tsx"],
      })
      expect(
        await readFile(path.join(created.packageRoot, ".gitignore"), "utf8")
      ).toContain("node_modules/")
    }
  )

  it("reports compiler failures and exits non-zero", async () => {
    const outDir = await temporaryRoot()
    const created = await createExtensionProject({
      canonicalId: "example.broken-tools",
      outDir,
    })
    const sourcePath = path.join(created.packageRoot, "src/extension.ts")
    await writeFile(
      sourcePath,
      `${await readFile(sourcePath, "utf8")}\nexport const broken = ;\n`
    )

    const result = await checkExtensionPackage({
      packageRoot: created.packageRoot,
      hostVersion: "0.33.0",
    })

    expect(result.ok).toBe(false)
    expect(result.status).toBe("invalid")
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "package-import-syntax" }),
      ])
    )
  })

  it("reports TypeScript SDK and semantic errors from the inspected snapshot", async () => {
    const outDir = await temporaryRoot()
    const created = await createExtensionProject({
      canonicalId: "example.typed-tools",
      outDir,
    })
    const sourcePath = path.join(created.packageRoot, "src/extension.ts")
    await writeFile(
      sourcePath,
      [
        'import type { MissingSdkType } from "@eidos.space/extension-sdk"',
        'const count: number = "not a number"',
        "export function activate(_context: MissingSdkType) { return count }",
        "",
      ].join("\n")
    )

    const result = await checkExtensionPackage({
      packageRoot: created.packageRoot,
      hostVersion: "0.33.0",
    })

    expect(result.ok).toBe(false)
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TS2305", path: "src/extension.ts" }),
        expect.objectContaining({ code: "TS2322", path: "src/extension.ts" }),
      ])
    )
  })

  it("never overwrites an existing package directory", async () => {
    const outDir = await temporaryRoot()
    await createExtensionProject({
      canonicalId: "example.safe-tools",
      outDir,
    })

    await expect(
      createExtensionProject({
        canonicalId: "example.safe-tools",
        outDir,
      })
    ).rejects.toThrow("Refusing to overwrite")
  })

  it("provides agent-friendly JSON output", async () => {
    const outDir = await temporaryRoot()
    const stdout: string[] = []
    const stderr: string[] = []
    expect(
      await runExtensionCli(
        [
          "init",
          "example.json-tools",
          "--out-dir",
          outDir,
          "--template",
          "command",
        ],
        {
          stdout: (value) => stdout.push(value),
          stderr: (value) => stderr.push(value),
        }
      )
    ).toBe(0)

    stdout.length = 0
    expect(
      await runExtensionCli(
        [
          "check",
          path.join(outDir, "example.json-tools"),
          "--host-version",
          "0.33.0",
          "--json",
        ],
        {
          stdout: (value) => stdout.push(value),
          stderr: (value) => stderr.push(value),
        }
      )
    ).toBe(0)
    expect(JSON.parse(stdout.join("\n"))).toMatchObject({
      ok: true,
      canonicalId: "example.json-tools",
    })
    expect(stderr).toEqual([])
  })

  it("creates a non-installable command porting workspace without importing legacy code", async () => {
    const root = await temporaryRoot()
    const archiveRoot = await createLegacyArchive(root)
    const outDir = path.join(root, "ports")

    const created = await createLegacyPortingProject({
      archiveRoot,
      publisher: "example",
      outDir,
    })

    expect(created).toMatchObject({
      canonicalId: "example.task-counter",
      candidateContribution: "command",
      archivedFiles: expect.arrayContaining([
        "legacy/legacy-extension.json",
        "legacy/src/extension.ts",
      ]),
    })
    await expect(
      readFile(path.join(created.packageRoot, "extension.json"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" })
    expect(
      JSON.parse(await readFile(created.draftManifestPath, "utf8"))
    ).toMatchObject({
      publisher: "example",
      name: "task-counter",
      contributes: { commands: expect.any(Array) },
    })
    expect(await readFile(created.portingGuidePath, "utf8")).toContain(
      "non-installable porting workspace"
    )
    expect(
      await readFile(
        path.join(created.packageRoot, "legacy", "src", "extension.ts"),
        "utf8"
      )
    ).toBe("export const legacySource = true\n")
    expect(
      await readFile(
        path.join(created.packageRoot, "src", "extension.ts"),
        "utf8"
      )
    ).toContain("legacy/ is reference-only")

    const check = await checkExtensionPackage({
      packageRoot: created.packageRoot,
    })
    expect(check).toMatchObject({ ok: false, status: "invalid" })
    expect(check.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "package-manifest-missing" }),
      ])
    )
  })

  it("infers a file-editor selector but keeps its manifest as a draft", async () => {
    const root = await temporaryRoot()
    const archiveRoot = await createLegacyArchive(root, {
      candidate: "file-editor",
      fileExtensions: [".md"],
    })

    const created = await createLegacyPortingProject({
      archiveRoot,
      publisher: "example",
      outDir: path.join(root, "ports"),
    })
    const manifest = JSON.parse(
      await readFile(created.draftManifestPath, "utf8")
    )
    expect(manifest).toMatchObject({
      entrypoints: { ui: "src/editor.ts" },
      contributes: {
        fileEditors: [{ selector: [{ filenamePattern: "**/*.md" }] }],
      },
    })
  })

  it("refuses blocked archives before creating any project", async () => {
    const root = await temporaryRoot()
    const archiveRoot = await createLegacyArchive(root, {
      candidate: null,
      readiness: "blocked-by-v1",
    })
    const outDir = path.join(root, "ports")

    await expect(
      createLegacyPortingProject({
        archiveRoot,
        publisher: "example",
        outDir,
      })
    ).rejects.toThrow("unsupported-contribution")
    await expect(
      lstat(path.join(outDir, "example.task-counter"))
    ).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("supports an agent-friendly port command", async () => {
    const root = await temporaryRoot()
    const archiveRoot = await createLegacyArchive(root)
    const stdout: string[] = []
    const stderr: string[] = []

    expect(
      await runExtensionCli(
        [
          "port",
          archiveRoot,
          "--publisher",
          "agent",
          "--out-dir",
          path.join(root, "ports"),
          "--json",
        ],
        {
          stdout: (value) => stdout.push(value),
          stderr: (value) => stderr.push(value),
        }
      )
    ).toBe(0)
    expect(JSON.parse(stdout.join("\n"))).toMatchObject({
      canonicalId: "agent.task-counter",
      candidateContribution: "command",
    })
    expect(stderr).toEqual([])
  })
})
