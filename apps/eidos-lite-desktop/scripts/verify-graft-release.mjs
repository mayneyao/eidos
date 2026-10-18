import fs from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const root = path.resolve(appRoot, "../..")
const require = createRequire(path.join(appRoot, "package.json"))
const nativeNames = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64-gnu",
  "linux-x64-gnu",
  "win32-x64-msvc",
].map((suffix) => `@eidos.space/graft-${suffix}`)
const remoteNames = [
  "@eidos.space/graft-remote",
  "@eidos.space/graft-remote-hono",
  "@eidos.space/graft-remote-cloudflare",
]
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

// Validate the declared and resolved dependency graph before loading native code.
// A same-version file tarball is still a source candidate, not a registry release.
export function validateGraftReleaseInputs({
  lite,
  remote,
  workspace,
  lock,
  environment = {},
  surface = "lite",
}) {
  const errors = []
  const isLite = surface === "lite"
  if (!isLite && surface !== "remote")
    throw new Error("Graft release surface must be lite or remote")
  if (isLite)
    for (const key of ["GRAFT_SDK_NATIVE_PATH", "EIDOS_LITE_GRAFT_SDK_PATH"]) {
      if (environment[key]?.trim()) errors.push(`${key} must be unset`)
    }
  const required = isLite
    ? ["@eidos.space/graft", ...nativeNames, remoteNames[0]]
    : remoteNames
  for (const [label, overrides] of [
    ["workspace", workspace.overrides],
    ["lockfile", lock.overrides],
  ]) {
    for (const key of Object.keys(overrides ?? {})) {
      if (required.some((name) => key === name || key.startsWith(`${name}@`)))
        errors.push(`${label} override for ${key} must be removed`)
    }
  }
  const manifest = isLite ? lite : remote
  const importerName = isLite ? "apps/eidos-lite-desktop" : "apps/graft-remote"
  const importer = lock.importers?.[importerName]
  const versions = {}
  for (const name of required) {
    const optional = nativeNames.includes(name)
    const section = optional ? "optionalDependencies" : "dependencies"
    const version = manifest[section]?.[name]
    versions[name] = version
    if (!exactVersion.test(version ?? "")) {
      errors.push(
        `${name} must use an exact registry version in ${importerName}`
      )
      continue
    }
    const entry = importer?.[section]?.[name]
    if (
      entry?.specifier !== version ||
      entry?.version?.split("(")[0] !== version
    )
      errors.push(
        `${name}@${version} does not resolve to its declared registry version`
      )
    const resolution = lock.packages?.[`${name}@${version}`]?.resolution
    if (!/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(resolution?.integrity ?? ""))
      errors.push(
        `${name}@${version} has no registry integrity in pnpm-lock.yaml`
      )
    if (resolution?.tarball) {
      try {
        const tarball = new URL(resolution.tarball)
        if (tarball.origin !== "https://registry.npmjs.org") throw new Error()
      } catch {
        errors.push(`${name}@${version} resolves to a non-registry tarball`)
      }
    }
  }
  if (isLite) {
    for (const name of nativeNames) {
      if (versions[name] !== versions["@eidos.space/graft"])
        errors.push(`${name} must match the root Graft SDK version`)
    }
  } else {
    for (const name of remoteNames) {
      if (versions[name] !== versions[remoteNames[0]])
        errors.push(`${name} must match the Graft Remote cohort version`)
    }
  }
  return errors
}

export function assertEncryptedSdk(sdk, version) {
  if (sdk.sdkVersion?.() !== version)
    throw new Error(
      "Installed native Graft SDK does not match the declared version"
    )
  if (typeof sdk.EncryptedRemoteSession !== "function")
    throw new Error("Published Graft SDK does not expose encrypted sessions")
  if (typeof sdk.RepositorySession?.prototype?.removeRemote !== "function")
    throw new Error(
      "Published Graft SDK lacks the required remote disconnect API"
    )
  if (typeof sdk.EncryptedRemoteSession.createPrivateDirectory !== "function")
    throw new Error(
      "Published Graft SDK lacks the required native private directory API"
    )
  // Invalid binding is rejected before disk access or network. The plain native
  // addon throws UNSUPPORTED_ENCRYPTED_PROFILE instead, even with an E2EE wrapper.
  try {
    new sdk.EncryptedRemoteSession({
      remoteName: "origin",
      url: "https://release-check.invalid/namespace/repository",
      uuid: "invalid",
      authenticationDomain: "https://release-check.invalid",
      accountSubject: "release-check",
      bearerToken: "synthetic-release-check",
      checkpointDirectory: "unused",
      recoveryDirectory: "unused",
      stagingDirectory: "unused",
      createCheckpoint: true,
    })
  } catch (error) {
    if (error?.code === "GRAFT_SDK_E2EE_INVALID_SESSION_BINDING") return
    throw new Error(
      "Published Graft native addon lacks the required E2EE profile",
      {
        cause: error,
      }
    )
  }
  throw new Error(
    "Published Graft native addon accepted an invalid session binding"
  )
}

export function assertEncryptedRemote(packageRoot) {
  // Resolve with Node's import condition from the consuming project's directory.
  // Remote intentionally has import-only exports; require.resolve rejects it.
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import * as remote from "@eidos.space/graft-remote";
if (typeof remote.parseEncryptedRoutingHint !== "function") {
  throw new Error("Published Graft Remote does not provide the encrypted remote API");
}`,
    ],
    { cwd: packageRoot, stdio: "pipe" }
  )
}

async function verify(surface) {
  const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"))
  const [lite, remote, workspace, lock, installedLock] = await Promise.all([
    json(path.join(appRoot, "package.json")),
    json(path.join(root, "apps/graft-remote/package.json")),
    fs.readFile(path.join(root, "pnpm-workspace.yaml"), "utf8").then(parse),
    fs.readFile(path.join(root, "pnpm-lock.yaml"), "utf8").then(parse),
    fs
      .readFile(path.join(root, "node_modules/.pnpm/lock.yaml"), "utf8")
      .then(parse),
  ])
  const errors = validateGraftReleaseInputs({
    lite,
    remote,
    workspace,
    lock,
    environment: process.env,
    surface,
  })
  errors.push(
    ...validateGraftReleaseInputs({
      lite,
      remote,
      workspace,
      lock: installedLock,
      environment: {},
      surface,
    }).map((error) => `installed dependencies: ${error}`)
  )
  if (errors.length)
    throw new Error(
      `Graft production dependencies are not release-ready:\n- ${errors.join("\n- ")}`
    )
  if (surface === "lite") {
    assertEncryptedSdk(
      require("@eidos.space/graft"),
      lite.dependencies["@eidos.space/graft"]
    )
  }
  assertEncryptedRemote(
    surface === "lite" ? appRoot : path.join(root, "apps/graft-remote")
  )
  console.log(
    `Verified registry-only Graft ${surface} dependencies and ${surface === "lite" ? "native/remote" : "remote"} E2EE APIs.`
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await verify(process.argv[2] ?? "lite")
}
