import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import {
  extensionIssuesUrl,
  extensionRegistryUrl,
  extensionRepositoryUrl,
  publicExtensionPackages,
} from "./file-extension-public-packages.mjs"

const execFileAsync = promisify(execFile)
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
)
const pnpmCli = process.env.npm_execpath

if (!pnpmCli) {
  throw new Error(
    "This smoke test must be started through pnpm so the active pnpm CLI is known"
  )
}

const packages = publicExtensionPackages.map((packageInfo) => ({
  ...packageInfo,
}))

for (const packageInfo of packages) {
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
  packageInfo.version = manifest.version
}

async function run(
  executable,
  args,
  { cwd = workspaceRoot, capture = false } = {}
) {
  let result
  try {
    result = await execFileAsync(executable, args, {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        CI: "1",
      },
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch (error) {
    if (error && typeof error === "object") {
      if ("stdout" in error && error.stdout) process.stderr.write(error.stdout)
      if ("stderr" in error && error.stderr) process.stderr.write(error.stderr)
    }
    throw error
  }
  if (!capture) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  return result.stdout.trim()
}

function pnpm(args, options) {
  return run(process.execPath, [pnpmCli, ...args], options)
}

async function pnpmFailure(args, { cwd }) {
  try {
    await execFileAsync(process.execPath, [pnpmCli, ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, CI: "1" },
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch (error) {
    assert.equal(error?.code, 1)
    return String(error.stdout ?? "").trim()
  }
  assert.fail(`Command unexpectedly succeeded: pnpm ${args.join(" ")}`)
}

const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "eidos-extension-tooling-smoke-")
)

try {
  const tarballRoot = path.join(temporaryRoot, "tarballs")
  const consumerRoot = path.join(temporaryRoot, "consumer")
  await mkdir(tarballRoot)
  await mkdir(consumerRoot)

  await pnpm(["--filter", "@eidos.space/extension-cli", "run", "build"])

  for (const packageInfo of packages) {
    await pnpm(["pack", "--out", path.join(tarballRoot, packageInfo.archive)], {
      cwd: path.join(workspaceRoot, "packages", packageInfo.directory),
    })
  }

  const dependencies = Object.fromEntries(
    packages.map((packageInfo) => [
      packageInfo.name,
      `file:../tarballs/${packageInfo.archive}`,
    ])
  )
  await writeFile(
    path.join(consumerRoot, "package.json"),
    `${JSON.stringify(
      {
        name: "eidos-extension-tooling-smoke-consumer",
        private: true,
        type: "module",
        dependencies,
        pnpm: { overrides: dependencies },
      },
      null,
      2
    )}\n`,
    "utf8"
  )

  await pnpm(
    [
      "install",
      "--prod",
      "--prefer-offline",
      "--ignore-scripts",
      "--frozen-lockfile=false",
    ],
    { cwd: consumerRoot }
  )

  for (const packageInfo of packages) {
    const installedManifest = JSON.parse(
      await readFile(
        path.join(
          consumerRoot,
          "node_modules",
          ...packageInfo.name.split("/"),
          "package.json"
        ),
        "utf8"
      )
    )
    assert.equal(installedManifest.name, packageInfo.name)
    assert.equal(installedManifest.version, packageInfo.version)
    assert.equal(installedManifest.author, "mayneyao")
    assert.deepEqual(installedManifest.repository, {
      type: "git",
      url: extensionRepositoryUrl,
      directory: `packages/${packageInfo.directory}`,
    })
    assert.equal(installedManifest.bugs?.url, extensionIssuesUrl)
    assert.deepEqual(installedManifest.publishConfig, {
      access: "public",
      registry: extensionRegistryUrl,
    })
    assert.equal(
      JSON.stringify(installedManifest).includes("workspace:"),
      false,
      `${packageInfo.name} leaked a workspace dependency into its tarball`
    )
    for (const [dependency, version] of Object.entries(
      installedManifest.dependencies ?? {}
    )) {
      if (!dependency.startsWith("@eidos.space/extension-")) continue
      assert.ok(
        packages.some(({ name }) => name === dependency),
        `${packageInfo.name} references an unshipped package: ${dependency}`
      )
      const dependencyPackage = packages.find(({ name }) => name === dependency)
      assert.equal(
        version,
        dependencyPackage.version,
        `${packageInfo.name} does not pin ${dependency} to the release version`
      )
    }
  }

  const cliLicense = await readFile(
    path.join(
      consumerRoot,
      "node_modules",
      "@eidos.space",
      "extension-cli",
      "LICENSE"
    ),
    "utf8"
  )
  assert.match(cliLicense, /^ISC License/u)
  const installedCliManifest = JSON.parse(
    await readFile(
      path.join(
        consumerRoot,
        "node_modules",
        "@eidos.space",
        "extension-cli",
        "package.json"
      ),
      "utf8"
    )
  )
  assert.equal(installedCliManifest.engines?.node, ">=18.0.0")

  assert.equal(
    await pnpm(["exec", "eidos-extension", "--version"], {
      cwd: consumerRoot,
      capture: true,
    }),
    packages.find(({ name }) => name === "@eidos.space/extension-cli").version
  )

  const projects = [
    {
      id: "example.external-command",
      template: "command",
      entrypoints: ["worker"],
    },
    {
      id: "example.external-panel",
      template: "panel",
      entrypoints: ["worker", "ui"],
    },
    {
      id: "example.external-editor",
      template: "text-editor",
      entrypoints: ["ui"],
    },
  ]
  for (const project of projects) {
    await pnpm(
      [
        "exec",
        "eidos-extension",
        "init",
        project.id,
        "--template",
        project.template,
      ],
      { cwd: consumerRoot }
    )
    const projectRoot = path.join(consumerRoot, project.id)
    const projectManifest = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8")
    )
    const toolingVersion = packages.find(
      ({ name }) => name === "@eidos.space/extension-cli"
    ).version
    assert.deepEqual(projectManifest, {
      name: project.id,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: { check: "eidos-extension check ." },
      devDependencies: {
        "@eidos.space/extension-cli": `^${toolingVersion}`,
        "@eidos.space/extension-sdk": `^${toolingVersion}`,
      },
    })
    assert.match(
      await readFile(path.join(projectRoot, ".gitignore"), "utf8"),
      /^node_modules\//mu
    )
    assert.deepEqual(
      JSON.parse(
        await readFile(path.join(projectRoot, "tsconfig.json"), "utf8")
      ).include,
      ["src/**/*.ts", "src/**/*.tsx"]
    )

    await mkdir(path.join(projectRoot, "node_modules", "broken"), {
      recursive: true,
    })
    await writeFile(
      path.join(projectRoot, "node_modules", "broken", "index.ts"),
      "this is deliberately not valid TypeScript }\n",
      "utf8"
    )
    await mkdir(path.join(projectRoot, "dist"), { recursive: true })
    await writeFile(
      path.join(projectRoot, "dist", "generated.ts"),
      "this is also deliberately invalid }\n",
      "utf8"
    )
    await pnpm(["run", "check"], { cwd: projectRoot })
    await pnpm(["exec", "tsc", "--noEmit", "-p", projectRoot], {
      cwd: consumerRoot,
    })

    const incompatibleOutput = await pnpmFailure(
      [
        "exec",
        "eidos-extension",
        "check",
        projectRoot,
        "--host-version",
        "0.32.0",
        "--json",
      ],
      { cwd: consumerRoot }
    )
    const incompatible = JSON.parse(incompatibleOutput)
    assert.equal(incompatible.ok, false)
    assert.equal(incompatible.status, "incompatible")
    assert.equal(incompatible.canonicalId, project.id)
    assert.equal(incompatible.version, "0.1.0")
    assert.equal(incompatible.packageRoot.endsWith(project.id), true)
    assert.match(incompatible.contentDigest, /^sha256:[a-f0-9]{64}$/u)
    assert.match(incompatible.permissionHash, /^sha256:[a-f0-9]{64}$/u)
    assert.equal(incompatible.locallyModified, false)
    assert.deepEqual(incompatible.entrypoints, [])
    assert.ok(
      incompatible.diagnostics.some(
        ({ code, severity }) =>
          code === "manifest-incompatible" && severity === "warning"
      )
    )
    const output = await pnpm(
      [
        "exec",
        "eidos-extension",
        "check",
        projectRoot,
        "--host-version",
        "0.33.0",
        "--json",
      ],
      { cwd: consumerRoot, capture: true }
    )
    const result = JSON.parse(output)
    assert.equal(result.ok, true)
    assert.equal(result.status, "ready")
    assert.equal(result.canonicalId, project.id)
    assert.deepEqual(
      result.entrypoints.map(({ kind }) => kind),
      project.entrypoints
    )
  }

  await run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      [
        'import { checkExtensionPackage } from "@eidos.space/extension-cli"',
        'const result = await checkExtensionPackage({ packageRoot: "example.external-command", hostVersion: "0.33.0" })',
        'if (!result.ok) throw new Error("Library API check failed")',
      ].join("\n"),
    ],
    { cwd: consumerRoot }
  )

  console.log(
    JSON.stringify({
      ok: true,
      packages: packages.map(({ name }) => name),
      templates: projects.map(({ template }) => template),
      consumer: "isolated-tarballs",
    })
  )
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
