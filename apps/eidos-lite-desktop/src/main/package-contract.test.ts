import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
)

async function readJson(
  relativePath: string
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await fs.readFile(path.join(appRoot, relativePath), "utf8")
  ) as Record<string, unknown>
}

describe("Eidos Lite package identity", () => {
  it("keeps heavy packaged verification outside the first-window startup path", async () => {
    const [bootstrapSource, applicationSource, startupSmokeSource] =
      await Promise.all([
        fs.readFile(path.resolve(appRoot, "src/main/main.ts"), "utf8"),
        fs.readFile(path.resolve(appRoot, "src/main/application.ts"), "utf8"),
        fs.readFile(
          path.resolve(appRoot, "src/main/packaged-startup-smoke.ts"),
          "utf8"
        ),
      ])

    expect(bootstrapSource).toMatch(/^import \{ app \} from "electron"/m)
    expect(bootstrapSource).not.toContain("WindowController")
    expect(bootstrapSource).toContain('import("./application")')
    expect(applicationSource).not.toMatch(/^import .*packaged-.*smoke/m)
    expect(applicationSource).toContain('"./packaged-startup-smoke"')
    expect(applicationSource).toContain('await import("./packaged-smoke")')
    expect(applicationSource).toContain("process.exit(isPackagedSmoke ? 2 : 0)")
    expect(startupSmokeSource).not.toContain(
      "@eidos.space/eidos-file/better-sqlite3"
    )
  })

  it("keeps an independent application identity and release metadata", async () => {
    const packageJson = await readJson("package.json")
    const builder = await readJson("electron-builder.json")
    const scripts = packageJson.scripts as Record<string, string>

    expect(packageJson.name).toBe("@eidos.space/eidos-lite-desktop")
    expect(packageJson.author).toBe("mayneyao")
    expect(packageJson.homepage).toBe("https://eidos.space")
    expect(builder.appId).toBe("space.eidos.lite")
    expect(builder.productName).toBe("Eidos Lite")
    expect(builder.protocols).toBeUndefined()
    expect(builder.fileAssociations).toEqual([
      {
        ext: "eidos",
        name: "Eidos File",
        description: "Eidos local database file",
        role: "Editor",
      },
    ])
    for (const scriptName of [
      "build",
      "build:production",
      "package:dir",
      "package:production:dir",
    ]) {
      expect(scripts[scriptName]).toContain("verify-electron-output.mjs")
    }
  })

  it("packages only the Graft SDK without a CLI fallback", async () => {
    const packageJson = await readJson("package.json")
    const builder = await readJson("electron-builder.json")
    const scripts = packageJson.scripts as Record<string, string>

    expect(packageJson.dependencies).toMatchObject({
      "@eidos.space/graft": expect.any(String),
    })
    expect(packageJson.dependencies).not.toHaveProperty("better-sqlite3")
    expect(packageJson.dependencies).not.toHaveProperty("bindings")
    expect(packageJson.dependencies).not.toHaveProperty("file-uri-to-path")
    expect(scripts["native:node"]).toBeUndefined()
    expect(scripts["native:electron"]).toBeUndefined()
    expect(JSON.stringify(builder)).not.toContain("better-sqlite3")
    expect(builder.extraResources).toBeUndefined()
    expect(scripts["test:graft:cli"]).toBeUndefined()
    expect(scripts["graft:install"]).toBeUndefined()
    expect(scripts["package:dir"]).not.toContain("graft:install")
    expect(scripts["package:production:dir"]).not.toContain("graft:install")
    await expect(
      fs.access(path.join(appRoot, "graft-runtime-manifest.json"))
    ).rejects.toThrow()
    await expect(
      fs.access(path.join(appRoot, "scripts/install-graft-runtime.mjs"))
    ).rejects.toThrow()
  })

  it("uses the checked-in cyan Eidos Lite icons on every target", async () => {
    const builder = await readJson("electron-builder.json")
    const mac = builder.mac as Record<string, unknown>
    const win = builder.win as Record<string, unknown>
    const linux = builder.linux as Record<string, unknown>
    const icons = [
      [mac.icon, Buffer.from("icns")],
      [win.icon, Buffer.from([0, 0, 1, 0])],
      [linux.icon, Buffer.from([0x89, 0x50, 0x4e, 0x47])],
    ] as const

    expect(mac.icon).toBe("assets/logo.icns")
    expect(win.icon).toBe("assets/logo.ico")
    expect(linux.icon).toBe("assets/logo.png")

    for (const [configuredPath, signature] of icons) {
      expect(typeof configuredPath).toBe("string")
      const bytes = await fs.readFile(
        path.resolve(appRoot, configuredPath as string)
      )
      expect(bytes.subarray(0, signature.length)).toEqual(signature)
    }

    const source = await fs.readFile(
      path.resolve(appRoot, "assets/logo.svg"),
      "utf8"
    )
    expect(source).toContain('fill="#007284"')
    expect(source).not.toContain('fill="#828282"')
  })

  it("keeps both macOS packaged smoke architectures in the Lite-only gate", async () => {
    const workflow = await fs.readFile(
      path.resolve(
        appRoot,
        "../../.github/workflows/eidos-lite-desktop-gates.yml"
      ),
      "utf8"
    )

    expect(workflow).toContain("runner: macos-15\n")
    expect(workflow).toContain("runner: macos-15-intel\n")
    expect(workflow).toContain("run: pnpm build:eidos-lite:dev")
    expect(workflow).toContain("run: pnpm smoke:eidos-lite-packaged")
    expect(workflow).toContain("test:performance")
    expect(workflow).not.toContain("softprops/action-gh-release")
  })

  it("ships Lite through an isolated release and update channel", async () => {
    const packageJson = await readJson("package.json")
    const builder = await readJson("electron-builder.json")
    const mac = builder.mac as Record<string, unknown>
    const win = builder.win as Record<string, unknown>
    const linux = builder.linux as Record<string, unknown>
    const publish = builder.publish as Record<string, unknown>
    const workflow = await fs.readFile(
      path.resolve(
        appRoot,
        "../../.github/workflows/build-and-release-eidos-lite.yml"
      ),
      "utf8"
    )
    const scripts = packageJson.scripts as Record<string, string>

    expect(packageJson.dependencies).toMatchObject({
      "electron-updater": expect.any(String),
    })
    expect(scripts["build:release"]).toContain("--mode eidos-release")
    expect(scripts["package:release"]).toContain("--publish never")
    expect(publish).toEqual({
      provider: "generic",
      url: "https://download.eidos.space/lite/updates/stable",
      channel: "latest",
    })
    expect(mac.forceCodeSigning).toBe(true)
    expect(mac.hardenedRuntime).toBe(true)
    expect(mac.notarize).toBe(true)
    expect(win.forceCodeSigning).toBe(false)
    expect(linux.executableName).toBe("eidos-lite-desktop")
    expect(workflow).toContain('- "lite-v*"')
    expect(workflow).toContain("pnpm build:eidos-lite:release")
    expect(workflow).toContain("Build signed and notarized macOS release")
    expect(workflow).toContain('--config.mac.notarize.teamId="$APPLE_TEAM_ID"')
    expect(workflow).toContain("Build unsigned Windows or Linux release")
    expect(workflow).not.toContain(
      "matrix.platform == 'mac' && secrets.MACOS_CERTIFICATE"
    )
    expect(workflow).toContain('executable="$(realpath "$executable")"')
    expect(workflow).toContain("EIDOS_LITE_SMOKE_PERFORMANCE_POLICY: observe")
    expect(workflow).toContain("Enforce packaged release performance")
    expect(workflow).not.toContain("Enforce packaged Linux release performance")
    expect(workflow).toContain("dbus-run-session -- xvfb-run")
    expect(workflow).toContain(
      "EIDOS_LITE_SMOKE_EXPECTED_ENVIRONMENT: production"
    )
    expect(workflow).not.toContain(
      "Build unsigned staging package for process-boundary smoke"
    )
    expect(workflow).toContain("codesign --verify --deep --strict")
    expect(workflow).toContain("Get-AuthenticodeSignature")
    expect(workflow).toContain('$signature.Status -ne "NotSigned"')
    expect(workflow).not.toContain("WINDOWS_CERTIFICATE")
    expect(workflow).toContain("latest-mac.yml mac arm64")
    expect(workflow).toContain("softprops/action-gh-release@v2")
  })

  it("keeps local-first performance budgets and the real-Space gate executable", async () => {
    const packageJson = await readJson("package.json")
    const scripts = packageJson.scripts as Record<string, string>
    const [contract, performanceSmoke, architecture, operations, conversions] =
      await Promise.all([
        fs.readFile(
          path.resolve(appRoot, "src/shared/performance-contract.ts"),
          "utf8"
        ),
        fs.readFile(
          path.resolve(appRoot, "scripts/performance-smoke.mjs"),
          "utf8"
        ),
        fs.readFile(path.resolve(appRoot, "docs/ARCHITECTURE.md"), "utf8"),
        fs.readFile(path.resolve(appRoot, "docs/OPERATIONS.md"), "utf8"),
        fs.readFile(
          path.resolve(
            appRoot,
            "../../packages/eidos-file/FIELD-CONVERSION.md"
          ),
          "utf8"
        ),
      ])

    expect(scripts["test:performance"]).toContain("performance-smoke.mjs")
    expect(scripts["test:performance:large"]).toContain(
      "large-space-performance.mjs"
    )
    expect(contract).toContain("packagedColdStart: 2_000")
    expect(contract).toContain("nativeOpenTenMiB: 1_500")
    expect(contract).toContain("gridFirstPageHundredThousandRows: 2_000")
    expect(contract).toContain("tableOpenMillionRows: 2_000")
    expect(contract).toContain("tableRowMutationP95: 200")
    expect(contract).toContain("tablePhysicalSchemaMutationMillionRows: 5_000")
    expect(contract).toContain("fieldConversionRewriteMillionRows: 60_000")
    expect(contract).toContain("csvImportMillionRows: 60_000")
    expect(contract).toContain("checkpointAcknowledgement: 2_000")
    expect(contract).toContain('saveVersion: ["graft-stage", "graft-commit"]')
    expect(performanceSmoke).toContain("table-performance.test.ts")
    expect(performanceSmoke).toContain("field-conversion-performance.test.ts")
    expect(performanceSmoke).toContain("csv-performance.test.ts")
    expect(architecture).toContain("### Local-first performance contract")
    expect(architecture).toContain("one-million-row")
    expect(operations).toContain("million-row matrix")
    expect(operations).toContain("pnpm test:eidos-lite:performance:large")
    expect(conversions).toContain("## Editor conversion matrix")
    expect(conversions).toContain("## Performance contract")
  })

  it("documents install, upgrade, rollback, diagnostics, and external release gates", async () => {
    const runbook = await fs.readFile(
      path.resolve(appRoot, "docs/RELEASE-RUNBOOK.md"),
      "utf8"
    )

    expect(runbook).toContain("## Install and upgrade")
    expect(runbook).toContain("## Rollback")
    expect(runbook).toContain("## Diagnostics and support handoff")
    expect(runbook).toContain("## Uninstall")
    expect(runbook).toContain("## Public-release blockers")
    expect(runbook).toContain("must leave all ordinary Space folders untouched")
  })
})
