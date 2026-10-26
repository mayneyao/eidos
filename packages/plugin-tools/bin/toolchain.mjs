import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

const toolsRoot = fileURLToPath(new URL("../", import.meta.url))
const sdkRoot = path.resolve(toolsRoot, "../plugin-sdk")

export async function isCheckoutToolchain() {
  return fs
    .access(path.resolve(toolsRoot, "../plugin-runtime/src/compiler.ts"))
    .then(
      () => true,
      () => false
    )
}

/** Portable candidates let projects and CI use an unreleased checkout API. */
export async function snapshotToolchain(destination) {
  const absolute = path.resolve(destination)
  await fs.mkdir(absolute, { recursive: true })
  const dependencies = {}
  for (const root of [sdkRoot, toolsRoot]) {
    const pkg = JSON.parse(
      await fs.readFile(path.join(root, "package.json"), "utf8")
    )
    execFileSync("pnpm", ["pack", "--pack-destination", absolute], {
      cwd: root,
      stdio: "pipe",
    })
    dependencies[pkg.name] = path.join(
      absolute,
      `${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`
    )
  }
  return dependencies
}

export async function templateDependencies() {
  const pkg = JSON.parse(
    await fs.readFile(path.join(toolsRoot, "package.json"), "utf8")
  )
  // SDK and tools are published as a shared-version cohort.
  return {
    "@eidos.space/plugin-sdk": pkg.version,
    "@eidos.space/plugin-tools": pkg.version,
  }
}
