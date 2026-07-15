import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import semver from "semver"

import {
  extensionRegistryUrl,
  publicExtensionPackages,
} from "./file-extension-public-packages.mjs"

const execFileAsync = promisify(execFile)
const modulePath = fileURLToPath(import.meta.url)
const defaultWorkspaceRoot = path.resolve(path.dirname(modulePath), "..")
const releaseTagPrefix = "extension-tooling-v"
const releaseModes = new Set(["plan", "bootstrap", "stage"])
const publicExtensionPackageNames = new Set(
  publicExtensionPackages.map(({ name }) => name)
)
const dependencyFields = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
]
const manifestDependencyFields = [...dependencyFields, "devDependencies"]

function releaseError(message) {
  return new Error(`Extension release refused: ${message}`)
}

export function sortReleasePackages(packages) {
  const byName = new Map(
    packages.map((packageInfo) => [packageInfo.name, packageInfo])
  )
  const visiting = new Set()
  const visited = new Set()
  const ordered = []

  const visit = (packageInfo) => {
    if (visited.has(packageInfo.name)) return
    if (visiting.has(packageInfo.name)) {
      throw releaseError(
        `internal package dependency cycle at ${packageInfo.name}`
      )
    }
    visiting.add(packageInfo.name)
    for (const dependency of packageInfo.internalDependencies) {
      const dependencyPackage = byName.get(dependency)
      if (!dependencyPackage) {
        throw releaseError(
          `${packageInfo.name} references unshipped internal package ${dependency}`
        )
      }
      visit(dependencyPackage)
    }
    visiting.delete(packageInfo.name)
    visited.add(packageInfo.name)
    ordered.push(packageInfo)
  }

  for (const packageInfo of packages) visit(packageInfo)
  return ordered
}

export async function loadReleasePackages({
  workspaceRoot = defaultWorkspaceRoot,
  expectedVersion,
} = {}) {
  if (!semver.valid(expectedVersion)) {
    throw releaseError(
      `expected version must be exact semver, received ${expectedVersion}`
    )
  }
  const packages = []
  for (const packageInfo of publicExtensionPackages) {
    const manifest = JSON.parse(
      await readFile(
        path.join(
          workspaceRoot,
          "packages",
          packageInfo.directory,
          "package.json"
        ),
        "utf8"
      )
    )
    if (manifest.name !== packageInfo.name) {
      throw releaseError(
        `${packageInfo.directory} declares unexpected package name ${manifest.name}`
      )
    }
    if (manifest.version !== expectedVersion) {
      throw releaseError(
        `${manifest.name} is ${manifest.version}; expected every package to be ${expectedVersion}`
      )
    }
    const internalDependencies = new Set()
    for (const field of manifestDependencyFields) {
      for (const [dependency, specifier] of Object.entries(
        manifest[field] ?? {}
      )) {
        if (!publicExtensionPackageNames.has(dependency)) continue
        if (specifier !== "workspace:*") {
          throw releaseError(
            `${manifest.name} must use workspace:* for ${dependency} before packing`
          )
        }
        if (dependencyFields.includes(field)) {
          internalDependencies.add(dependency)
        }
      }
    }
    packages.push({
      ...packageInfo,
      version: manifest.version,
      internalDependencies: [...internalDependencies],
      manifest,
      packageRoot: path.join(workspaceRoot, "packages", packageInfo.directory),
    })
  }
  return sortReleasePackages(packages)
}

export function createPublishManifest(packageInfo) {
  const manifest = structuredClone(packageInfo.manifest)
  for (const field of manifestDependencyFields) {
    const dependencies = manifest[field]
    if (!dependencies) continue
    manifest[field] = Object.fromEntries(
      Object.entries(dependencies)
        .map(([name, specifier]) => [
          name,
          specifier === "workspace:*" && publicExtensionPackageNames.has(name)
            ? packageInfo.version
            : specifier,
        ])
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    )
  }
  if (JSON.stringify(manifest).includes("workspace:")) {
    throw releaseError(
      `${packageInfo.name} publish manifest still contains a workspace protocol`
    )
  }
  return manifest
}

export function createReleasePlan(packages, registryStates, mode) {
  if (!releaseModes.has(mode))
    throw releaseError(`unknown release mode ${mode}`)
  return packages.map((packageInfo) => {
    const state = registryStates.get(packageInfo.name)
    if (!state)
      throw releaseError(`registry state missing for ${packageInfo.name}`)
    if (state.versionExists) {
      if (state.integrity !== packageInfo.integrity) {
        throw releaseError(
          `${packageInfo.name}@${packageInfo.version} already exists with different integrity`
        )
      }
      return { ...packageInfo, registry: state, action: "skip" }
    }
    if (mode === "bootstrap") {
      if (state.packageExists) {
        throw releaseError(
          `${packageInfo.name} already exists; use stage mode for later versions`
        )
      }
      return { ...packageInfo, registry: state, action: "publish" }
    }
    if (mode === "stage") {
      if (!state.packageExists) {
        throw releaseError(
          `${packageInfo.name} is unpublished; staged publishing cannot create a package`
        )
      }
      return { ...packageInfo, registry: state, action: "stage" }
    }
    return {
      ...packageInfo,
      registry: state,
      action: state.packageExists ? "stage" : "publish",
    }
  })
}

export function assertPublishEnvironment(version, environment = process.env) {
  if (environment.GITHUB_ACTIONS !== "true") {
    throw releaseError("publishing is only allowed from GitHub Actions")
  }
  if (environment.GITHUB_REF_TYPE !== "tag") {
    throw releaseError("publishing requires a tag ref")
  }
  const expectedTag = `${releaseTagPrefix}${version}`
  if (environment.GITHUB_REF_NAME !== expectedTag) {
    throw releaseError(
      `tag ${environment.GITHUB_REF_NAME ?? "<missing>"} must equal ${expectedTag}`
    )
  }
}

function parseArguments(args) {
  const options = {
    mode: "plan",
    publish: false,
  }
  const optionNames = new Map([
    ["--mode", "mode"],
    ["--version", "version"],
    ["--output-dir", "outputDir"],
    ["--artifact-dir", "artifactDir"],
  ])
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === "--publish") {
      options.publish = true
      continue
    }
    if (!optionNames.has(argument)) {
      throw releaseError(`unknown argument ${argument}`)
    }
    const value = args[index + 1]
    if (!value || value.startsWith("--")) {
      throw releaseError(`${argument} requires a value`)
    }
    options[optionNames.get(argument)] = value
    index += 1
  }
  if (!releaseModes.has(options.mode)) {
    throw releaseError(`mode must be plan, bootstrap, or stage`)
  }
  if (!semver.valid(options.version)) {
    throw releaseError("--version must be an exact semantic version")
  }
  if (options.publish && options.mode === "plan") {
    throw releaseError("--publish requires bootstrap or stage mode")
  }
  if (options.publish && !options.artifactDir) {
    throw releaseError("--publish requires a reviewed --artifact-dir")
  }
  if (options.artifactDir && options.outputDir) {
    throw releaseError("--artifact-dir and --output-dir are mutually exclusive")
  }
  return options
}

async function run(executable, args, { cwd, capture = false, env } = {}) {
  try {
    const result = await execFileAsync(executable, args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, CI: "1", ...env },
      maxBuffer: 16 * 1024 * 1024,
    })
    if (!capture) {
      if (result.stdout) process.stdout.write(result.stdout)
      if (result.stderr) process.stderr.write(result.stderr)
    }
    return result.stdout.trim()
  } catch (error) {
    if (error && typeof error === "object") {
      if ("stdout" in error && error.stdout) process.stderr.write(error.stdout)
      if ("stderr" in error && error.stderr) process.stderr.write(error.stderr)
    }
    throw error
  }
}

async function prepareOutputDirectory(outputDirectory) {
  if (!outputDirectory) {
    return mkdtemp(path.join(tmpdir(), "eidos-extension-release-"))
  }
  const resolved = path.resolve(outputDirectory)
  await mkdir(resolved, { recursive: true })
  const existing = await readdir(resolved)
  if (existing.length > 0) {
    throw releaseError(`output directory must be empty: ${resolved}`)
  }
  return resolved
}

async function preparePublishRoot(packageInfo, stagingDirectory) {
  const publishRoot = path.join(stagingDirectory, packageInfo.directory)
  await cp(packageInfo.packageRoot, publishRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(packageInfo.packageRoot, source)
      if (!relative) return true
      const firstSegment = relative.split(path.sep)[0]
      return !["node_modules", ".turbo"].includes(firstSegment)
    },
  })
  await writeFile(
    path.join(publishRoot, "package.json"),
    `${JSON.stringify(createPublishManifest(packageInfo), null, 2)}\n`,
    "utf8"
  )
  return publishRoot
}

async function packPublishRoot(packageInfo, { publishRoot, outputDirectory }) {
  const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm"
  const packedJson = await run(
    npmExecutable,
    ["pack", "--json", "--pack-destination", outputDirectory],
    {
      cwd: publishRoot,
      capture: true,
      env: { npm_config_ignore_scripts: "true" },
    }
  )
  const packed = JSON.parse(packedJson)
  const generatedName = packed[0]?.filename
  if (!generatedName || path.basename(generatedName) !== generatedName) {
    throw releaseError(`${packageInfo.name} returned an unsafe archive name`)
  }
  const generatedPath = path.join(outputDirectory, generatedName)
  const archivePath = path.join(outputDirectory, packageInfo.archive)
  await rename(generatedPath, archivePath)
  return archivePath
}

async function packReleasePackages(
  packages,
  { workspaceRoot, outputDirectory }
) {
  const pnpmCli = process.env.npm_execpath
  if (!pnpmCli) {
    throw releaseError("start the release planner through pnpm")
  }
  await run(
    process.execPath,
    [pnpmCli, "--filter", "@eidos.space/extension-cli", "run", "build"],
    { cwd: workspaceRoot }
  )
  const stagingDirectory = await mkdtemp(
    path.join(tmpdir(), "eidos-extension-publish-root-")
  )
  try {
    const packed = []
    for (const packageInfo of packages) {
      const publishRoot = await preparePublishRoot(
        packageInfo,
        stagingDirectory
      )
      const archivePath = await packPublishRoot(packageInfo, {
        publishRoot,
        outputDirectory,
      })
      const archive = await readFile(archivePath)
      packed.push({
        ...packageInfo,
        archivePath,
        ...hashArchive(archive),
      })
    }
    return packed
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true })
  }
}

function hashArchive(archive) {
  return {
    bytes: archive.byteLength,
    integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
    shasum: createHash("sha1").update(archive).digest("hex"),
  }
}

export async function loadReleaseArtifact(
  packages,
  { artifactDirectory, expectedVersion, expectedMode, expectedSourceSha }
) {
  const resolvedDirectory = path.resolve(artifactDirectory)
  const report = JSON.parse(
    await readFile(path.join(resolvedDirectory, "release-plan.json"), "utf8")
  )
  const expectedTag = `${releaseTagPrefix}${expectedVersion}`
  if (
    report.version !== expectedVersion ||
    report.mode !== expectedMode ||
    report.tag !== expectedTag ||
    report.sourceSha !== expectedSourceSha
  ) {
    throw releaseError(
      "reviewed artifact does not match the requested version, mode, tag, and source commit"
    )
  }
  if (report.packages?.length !== packages.length) {
    throw releaseError("reviewed artifact has an unexpected package count")
  }
  const verified = []
  for (let index = 0; index < packages.length; index += 1) {
    const packageInfo = packages[index]
    const reviewed = report.packages[index]
    if (
      reviewed?.name !== packageInfo.name ||
      reviewed.version !== packageInfo.version ||
      reviewed.archive !== packageInfo.archive
    ) {
      throw releaseError(
        `reviewed artifact package ${index + 1} does not match ${packageInfo.name}`
      )
    }
    const archivePath = path.join(resolvedDirectory, reviewed.archive)
    if (path.dirname(archivePath) !== resolvedDirectory) {
      throw releaseError(`${packageInfo.name} uses an unsafe archive path`)
    }
    const archive = await readFile(archivePath)
    const actual = hashArchive(archive)
    if (
      actual.bytes !== reviewed.bytes ||
      actual.integrity !== reviewed.integrity ||
      actual.shasum !== reviewed.shasum
    ) {
      throw releaseError(`${packageInfo.name} reviewed archive was modified`)
    }
    verified.push({ ...packageInfo, ...actual, archivePath })
  }
  return { packages: verified, report, outputDirectory: resolvedDirectory }
}

export async function readRegistryState(
  packageInfo,
  { fetchImpl = fetch, registryUrl = extensionRegistryUrl } = {}
) {
  const url = new URL(encodeURIComponent(packageInfo.name), registryUrl)
  const response = await fetchImpl(url, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) {
    return { packageExists: false, versionExists: false }
  }
  if (!response.ok) {
    throw releaseError(
      `registry returned ${response.status} for ${packageInfo.name}`
    )
  }
  const packument = await response.json()
  const published = packument.versions?.[packageInfo.version]
  return {
    packageExists: true,
    versionExists: !!published,
    integrity: published?.dist?.integrity,
    shasum: published?.dist?.shasum,
  }
}

async function readSourceSha(workspaceRoot) {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA
  return run("git", ["rev-parse", "HEAD"], {
    cwd: workspaceRoot,
    capture: true,
  })
}

async function executePlan(plan, mode) {
  const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm"
  if (mode === "bootstrap") {
    if (!process.env.NODE_AUTH_TOKEN) {
      throw releaseError("bootstrap mode requires NODE_AUTH_TOKEN")
    }
    await run(npmExecutable, ["whoami", "--registry", extensionRegistryUrl])
  }
  for (const item of plan) {
    if (item.action === "skip") {
      console.log(
        `✓ Skip ${item.name}@${item.version}; identical version exists`
      )
      continue
    }
    if (item.action === "publish") {
      await run(npmExecutable, [
        "publish",
        item.archivePath,
        "--access",
        "public",
        "--provenance",
        "--registry",
        extensionRegistryUrl,
      ])
      continue
    }
    await run(npmExecutable, [
      "stage",
      "publish",
      item.archivePath,
      "--access",
      "public",
      "--provenance",
      "--registry",
      extensionRegistryUrl,
    ])
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args)
  if (options.publish) assertPublishEnvironment(options.version)
  const workspaceRoot = defaultWorkspaceRoot
  const packages = await loadReleasePackages({
    workspaceRoot,
    expectedVersion: options.version,
  })
  const sourceSha = await readSourceSha(workspaceRoot)
  let outputDirectory
  let packed
  if (options.artifactDir) {
    const artifact = await loadReleaseArtifact(packages, {
      artifactDirectory: options.artifactDir,
      expectedVersion: options.version,
      expectedMode: options.mode,
      expectedSourceSha: sourceSha,
    })
    outputDirectory = artifact.outputDirectory
    packed = artifact.packages
  } else {
    outputDirectory = await prepareOutputDirectory(options.outputDir)
    packed = await packReleasePackages(packages, {
      workspaceRoot,
      outputDirectory,
    })
  }
  const registryStates = new Map()
  for (const packageInfo of packed) {
    registryStates.set(packageInfo.name, await readRegistryState(packageInfo))
  }
  const plan = createReleasePlan(packed, registryStates, options.mode)
  const report = {
    version: options.version,
    mode: options.mode,
    tag: `${releaseTagPrefix}${options.version}`,
    sourceSha,
    outputDirectory,
    packages: plan.map((item) => ({
      name: item.name,
      version: item.version,
      action: item.action,
      archive: item.archive,
      bytes: item.bytes,
      integrity: item.integrity,
      shasum: item.shasum,
      packageExists: item.registry.packageExists,
      versionExists: item.registry.versionExists,
    })),
  }
  if (!options.artifactDir) {
    await writeFile(
      path.join(outputDirectory, "release-plan.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    )
  }
  console.log(JSON.stringify(report, null, 2))
  if (options.publish) await executePlan(plan, options.mode)
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
