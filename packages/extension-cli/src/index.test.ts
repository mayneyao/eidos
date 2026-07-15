import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { runExtensionCli } from "./command"
import { checkExtensionPackage, createExtensionProject } from "./index"

const roots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "eidos-extension-cli-"))
  roots.push(root)
  return root
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
})
