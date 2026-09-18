import path from "node:path"
import fs from "node:fs/promises"
import { parse as parseYaml } from "yaml"
import { parseJson } from "./json"
import { record } from "./manifest"
import { PluginError } from "./errors"

export interface DependencyLock {
  assertResolved(packageName: string, file: string): Promise<string>
}
/** Verify installed package identities against local lock metadata; never install. */
export async function loadDependencyLock(
  root: string,
  read: (file: string) => Promise<Buffer>
): Promise<DependencyLock | undefined> {
  const fail = (message: string): never => {
    throw new PluginError("DEPENDENCY_MISSING", message)
  }
  const exists = (file: string) =>
    fs.access(file).then(
      () => true,
      () => false
    )
  const npm = path.join(root, "package-lock.json"),
    pnpm = path.join(root, "pnpm-lock.yaml")
  const hasNpm = await exists(npm),
    hasPnpm = await exists(pnpm)
  if (hasNpm && hasPnpm) fail("Choose one dependency lockfile")
  if (!hasNpm && !hasPnpm) return undefined
  const versions = new Map<string, Set<string>>()
  const add = (name: string, version: string) => {
    const set = versions.get(name) ?? new Set<string>()
    set.add(version)
    versions.set(name, set)
  }
  if (hasNpm) {
    const lock = record(parseJson((await read(npm)).toString("utf8")))
    if (lock.lockfileVersion !== 2 && lock.lockfileVersion !== 3)
      fail("Expected npm lockfile version 2 or 3")
    for (const [key, raw] of Object.entries(record(lock.packages))) {
      if (!key.includes("node_modules/")) continue
      const pkg = record(raw),
        name = key.slice(key.lastIndexOf("node_modules/") + 13)
      if (typeof pkg.version !== "string" || pkg.link)
        return fail(
          "Linked npm dependencies require a self-contained installation"
        )
      add(name, pkg.version)
    }
  } else {
    const lock = record(
      parseYaml((await read(pnpm)).toString("utf8"), {
        uniqueKeys: true,
        maxAliasCount: 0,
      })
    )
    if (String(lock.lockfileVersion) !== "9.0")
      fail("Expected pnpm lockfile version 9.0")
    for (const key of Object.keys(record(lock.packages))) {
      const match = /^(.*)@([^(@]+)(?:\(.*\))?$/.exec(key)
      if (!match) return fail("Unsupported pnpm package identity")
      add(match[1], match[2])
    }
  }
  return {
    async assertResolved(packageName, file) {
      let directory = path.dirname(file)
      while (true) {
        const metadata = path.join(directory, "package.json")
        if (await exists(metadata)) {
          const pkg = record(parseJson((await read(metadata)).toString("utf8")))
          // A published package can contain nested module-boundary metadata
          // (MapLibre's dist/package.json has a name/type but no version).
          if (pkg.name === packageName && pkg.version !== undefined) {
            if (
              typeof pkg.version !== "string" ||
              !versions.get(packageName)?.has(pkg.version)
            )
              fail(`Installed ${packageName} does not match the lockfile`)
            return directory
          }
        }
        const parent = path.dirname(directory)
        if (parent === directory)
          fail(`Cannot identify locked dependency ${packageName}`)
        directory = parent
      }
    },
  }
}
