import { randomUUID } from "node:crypto"

import type { CreateEidosFileOptions } from "@eidos.space/eidos-file"
import type { SpaceFiles } from "@eidos.space/file-space"

export interface CreatedEidosFileHandle {
  close(): void
}

export type EidosFileInitializer = (
  systemPath: string,
  options: CreateEidosFileOptions
) => CreatedEidosFileHandle

function temporaryEidosFilePath(relativePath: string): string {
  const separator = relativePath.lastIndexOf("/")
  const parent = separator >= 0 ? relativePath.slice(0, separator + 1) : ""
  const name = separator >= 0 ? relativePath.slice(separator + 1) : relativePath
  return `${parent}.${name}.eidos-${process.pid}-${randomUUID()}.tmp.eidos`
}

/**
 * Builds an Eidos File beside its destination and only exposes the final path after
 * SQLite initialization has completed. A crash may leave a hidden temporary
 * file, but it can never leave a zero-byte canonical `.eidos` behind.
 */
export async function createEidosFileAtomically(
  files: SpaceFiles,
  relativePath: string,
  options: CreateEidosFileOptions,
  initialize: EidosFileInitializer
): Promise<void> {
  const temporaryPath = temporaryEidosFilePath(relativePath)
  let handle: CreatedEidosFileHandle | null = null

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
