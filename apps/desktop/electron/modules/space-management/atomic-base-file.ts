import { randomUUID } from "node:crypto"

import type { CreateBaseOptions } from "@eidos.space/base"
import type { SpaceFiles } from "@eidos.space/file-space"

export interface CreatedBaseHandle {
  close(): void
}

export type BaseFileInitializer = (
  systemPath: string,
  options: CreateBaseOptions
) => CreatedBaseHandle

function temporaryBasePath(relativePath: string): string {
  const separator = relativePath.lastIndexOf("/")
  const parent = separator >= 0 ? relativePath.slice(0, separator + 1) : ""
  const name = separator >= 0 ? relativePath.slice(separator + 1) : relativePath
  return `${parent}.${name}.eidos-${process.pid}-${randomUUID()}.tmp.base`
}

/**
 * Builds a Base beside its destination and only exposes the final path after
 * SQLite initialization has completed. A crash may leave a hidden temporary
 * file, but it can never leave a zero-byte canonical `.base` behind.
 */
export async function createBaseFileAtomically(
  files: SpaceFiles,
  relativePath: string,
  options: CreateBaseOptions,
  initialize: BaseFileInitializer
): Promise<void> {
  const temporaryPath = temporaryBasePath(relativePath)
  let handle: CreatedBaseHandle | null = null

  await files.createBinary(temporaryPath, new Uint8Array())
  try {
    const systemPath = await files.getSystemPath(temporaryPath)
    handle = initialize(systemPath, options)
    handle.close()
    handle = null
    await files.move(temporaryPath, relativePath)
  } finally {
    try {
      handle?.close()
    } finally {
      await files.remove(temporaryPath).catch(() => undefined)
    }
  }
}
