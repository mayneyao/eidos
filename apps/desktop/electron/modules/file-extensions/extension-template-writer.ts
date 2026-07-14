import { randomUUID } from "node:crypto"
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ExtensionTemplate } from "@eidos.space/extension-manifest"

import {
  ensureExtensionStagingRoot,
  extensionRootIsUnchanged,
  resolveExtensionProjectPaths,
  type ExtensionProjectPaths,
} from "./extension-paths"

const CANONICAL_ID_PATTERN = /^[a-z][a-z0-9-]{1,62}\.[a-z][a-z0-9-]{1,62}$/

export interface WrittenExtensionTemplate {
  canonicalId: string
  root: `.eidos/extensions/${string}`
  files: string[]
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}

function completePaths(
  paths: ExtensionProjectPaths
): asserts paths is Required<ExtensionProjectPaths> {
  if (!paths.eidosRoot || !paths.extensionsRoot || !paths.extensionsIdentity) {
    throw new Error("Unable to prepare the extension project directory")
  }
}

export async function writeExtensionTemplate(
  spacePath: string,
  template: ExtensionTemplate
): Promise<WrittenExtensionTemplate> {
  if (!CANONICAL_ID_PATTERN.test(template.canonicalId)) {
    throw new Error("Extension template has an invalid canonical ID")
  }

  const paths = await resolveExtensionProjectPaths(spacePath, true)
  completePaths(paths)
  const stagingRoot = await ensureExtensionStagingRoot(paths)
  const temporaryRoot = await mkdtemp(
    path.join(stagingRoot, `${template.canonicalId}-${randomUUID()}-`)
  )
  const destination = path.join(paths.extensionsRoot, template.canonicalId)

  try {
    for (const file of template.files) {
      const segments = file.path.split("/")
      if (
        file.path.includes("\\") ||
        file.path.includes("\0") ||
        path.posix.normalize(file.path) !== file.path ||
        segments.length === 0 ||
        segments.some(
          (segment) => !segment || segment === "." || segment === ".."
        )
      ) {
        throw new Error(`Extension template has an invalid path: ${file.path}`)
      }
      const target = path.join(temporaryRoot, ...segments)
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
      await writeFile(target, file.content, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o644,
      })
    }

    try {
      await lstat(destination)
      throw new Error(`Extension already exists: ${template.canonicalId}`)
    } catch (error) {
      if (!isMissing(error)) throw error
    }
    if (!(await extensionRootIsUnchanged(spacePath, paths))) {
      throw new Error("Extension project directory changed during creation")
    }
    await rename(temporaryRoot, destination)
    return {
      canonicalId: template.canonicalId,
      root: `.eidos/extensions/${template.canonicalId}`,
      files: template.files.map((file) => file.path),
    }
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(
      () => undefined
    )
    throw error
  }
}
