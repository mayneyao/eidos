import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"

const root = process.cwd()
const app = path.join(root, "apps/eidos-lite-desktop")
const output = path.join(app, "dist-app")
const evidence = path.join(root, "candidate-evidence")
const arch = process.arch
const platform = process.platform
const pnpm = platform === "win32" ? "pnpm.cmd" : "pnpm"
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: app,
    stdio: "inherit",
    env: process.env,
    shell: platform === "win32" && command.endsWith(".cmd"),
    ...options,
  })
  assert.equal(
    result.status,
    0,
    `${command} exited ${result.status ?? result.signal}`
  )
}
const builder = (args) =>
  run(pnpm, ["exec", "electron-builder", ...args, "--publish", "never"])
const mode = process.argv[2]
fs.mkdirSync(evidence, { recursive: true })
if (mode === "build") {
  for (const script of [
    "prepare:terminal",
    "prepare:vtab",
    "prepare:plugin-compiler",
    "prepare:publish-engine",
  ])
    run(pnpm, ["run", script])
  run(pnpm, ["exec", "vite", "build", "--mode", "eidos-production"])
  run(process.execPath, ["scripts/verify-build-environment.mjs", "production"])
  run(process.execPath, ["scripts/verify-electron-output.mjs"])
  if (platform === "darwin") {
    assert(
      process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD,
      "Existing Developer ID CI signing inputs are required"
    )
    builder([
      "--dir",
      "--mac",
      `--${arch}`,
      "--config",
      "electron-builder.json",
      "-c.mac.notarize=false",
    ])
    const bundle = path.join(
      output,
      arch === "arm64" ? "mac-arm64" : "mac",
      "Eidos Lite.app"
    )
    run("codesign", ["--verify", "--deep", "--strict", bundle])
    builder([
      `--prepackaged=${bundle}`,
      "--mac",
      "dmg",
      "zip",
      `--${arch}`,
      "--config",
      "electron-builder.json",
      "-c.mac.notarize=false",
    ])
  } else if (platform === "win32") {
    builder(["--dir", "--win", "--x64", "--config", "electron-builder.json"])
    builder([
      `--prepackaged=${path.join(output, "win-unpacked")}`,
      "--win",
      "nsis",
      "--x64",
      "--config",
      "electron-builder.json",
    ])
  } else {
    builder([
      "--dir",
      "--linux",
      `--${arch}`,
      "--config",
      "electron-builder.linux.json",
    ])
    const unpacked = path.join(
      output,
      arch === "arm64" ? "linux-arm64-unpacked" : "linux-unpacked"
    )
    builder([
      `--prepackaged=${unpacked}`,
      "--linux",
      "deb",
      "AppImage",
      `--${arch}`,
      "--config",
      "electron-builder.linux.json",
    ])
  }
  run(
    process.execPath,
    [path.join(root, "verification/check-update-metadata.mjs")],
    { cwd: root }
  )
} else if (mode === "accept") {
  const extension =
    platform === "darwin" ? ".dmg" : platform === "win32" ? ".exe" : ".deb"
  const installers = fs
    .readdirSync(output)
    .filter((name) => name.endsWith(extension))
  assert.equal(installers.length, 1)
  const installer = path.join(output, installers[0])
  const installedEvidence = path.join(evidence, "installed")
  run(process.execPath, [
    "scripts/installed-upgrade-smoke.mjs",
    "--previous-tag=lite-v0.29.7",
    `--candidate=${installer}`,
    "--version=0.30.0-rc.0",
    `--evidence=${installedEvidence}`,
  ])
  const temporary = fs
    .readFileSync(path.join(installedEvidence, "temporary-root.txt"), "utf8")
    .trim()
  const executable =
    platform === "darwin"
      ? path.join(
          temporary,
          "application/Eidos Lite.app/Contents/MacOS/Eidos Lite"
        )
      : platform === "win32"
        ? path.join(temporary, "application/Eidos Lite.exe")
        : "/opt/eidos-lite/eidos-lite-desktop"
  const resources =
    platform === "darwin"
      ? path.resolve(path.dirname(executable), "../Resources")
      : path.join(path.dirname(executable), "resources")
  assert(
    !process.env.EIDOS_LITE_GRAFT_SDK_PATH && !process.env.GRAFT_SDK_NATIVE_PATH
  )
  assert(
    process.env.EIDOS_LITE_SPARK_TEST_CERTIFICATE,
    "Production-signed CI fixture is required"
  )
  const environment = {
    ...process.env,
    EIDOS_LITE_PACKAGED_APP: executable,
    EIDOS_LITE_SMOKE_EXPECTED_ENVIRONMENT: "production",
    EIDOS_LITE_SMOKE_PERFORMANCE_POLICY: "observe",
    EIDOS_LITE_SPARK_REQUIRE_SIGNED_TEST_CERTIFICATE: "1",
    EIDOS_LITE_SMOKE_EVIDENCE_DIRECTORY: path.join(evidence, "packaged"),
  }
  run(process.execPath, ["scripts/packaged-smoke.mjs"], { env: environment })
  if (platform === "linux") {
    const images = fs
      .readdirSync(output)
      .filter((name) => name.endsWith(".AppImage"))
    assert.equal(images.length, 1)
    const image = path.join(output, images[0])
    const extraction = path.join(
      process.env.RUNNER_TEMP ?? "/tmp",
      `lite-appimage-${arch}`
    )
    fs.mkdirSync(extraction, { recursive: true, mode: 0o700 })
    fs.chmodSync(image, 0o755)
    run(image, ["--appimage-extract"], { cwd: extraction, stdio: "ignore" })
    const appRun = path.join(extraction, "squashfs-root/AppRun")
    run(process.execPath, ["scripts/packaged-smoke.mjs"], {
      env: {
        ...environment,
        APPIMAGE: image,
        EIDOS_LITE_PACKAGED_APP: appRun,
        EIDOS_LITE_SMOKE_EVIDENCE_DIRECTORY: path.join(
          evidence,
          "appimage-packaged"
        ),
      },
    })
    fs.writeFileSync(
      path.join(evidence, "appimage-startup.json"),
      JSON.stringify(
        {
          status: "passed",
          image,
          entry: appRun,
          mode: "AppImage normal extraction then AppRun; no FUSE assumption or sandbox disable",
          chromiumSandboxDisabled: false,
        },
        null,
        2
      ) + "\n"
    )
  }
  const protocolEnvironment = { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
  for (const name of [
    "EIDOS_LITE_SPARK_TEST_CERTIFICATE",
    "GH_TOKEN",
    "GITHUB_TOKEN",
    "CSC_LINK",
    "CSC_KEY_PASSWORD",
  ])
    delete protocolEnvironment[name]
  for (const program of [
    "node-transfer-progress",
    "node-plain-transfer-progress",
  ]) {
    const stdout = fs.openSync(path.join(evidence, `${program}.json`), "w")
    const stderr = fs.openSync(path.join(evidence, `${program}.log`), "w")
    try {
      run(executable, [`tests/e2ee/${program}.mjs`, resources], {
        cwd: path.join(root, "verification/graft-protocol"),
        env: protocolEnvironment,
        stdio: ["ignore", stdout, stderr],
      })
    } finally {
      fs.closeSync(stdout)
      fs.closeSync(stderr)
    }
  }
  const suffix = `${platform}-${arch}${platform === "linux" ? "-gnu" : platform === "win32" ? "-msvc" : ""}`
  const native = path.join(
    resources,
    "app.asar.unpacked/node_modules/@eidos.space",
    `graft-${suffix}`,
    `graft-sdk.${suffix}.node`
  )
  const sha = (file) =>
    createHash("sha256").update(fs.readFileSync(file)).digest("hex")
  const cli = path.join(
    resources,
    "publish-engine",
    platform === "win32" ? "eidos.exe" : "eidos"
  )
  fs.writeFileSync(
    path.join(evidence, "installed-identities.json"),
    JSON.stringify(
      {
        source: process.env.GITHUB_SHA,
        platform,
        arch,
        executable,
        resources,
        installer: { path: installer, sha256: sha(installer) },
        archiveSha256: sha(path.join(resources, "app.asar")),
        native: { path: native, sha256: sha(native) },
        bundledCli: { path: cli, sha256: sha(cli) },
        sdkRuntimeOverrides: false,
        notarized: false,
      },
      null,
      2
    ) + "\n"
  )
} else throw new Error("Expected build or accept")
