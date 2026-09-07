import { randomUUID } from "node:crypto"
import path from "node:path"
import { EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX } from "../../shared/contracts"
import type {
  RestoreTextVersionRequest,
  RestoreTextVersionResult,
} from "../../shared/path-history"
import {
  normalizeMutableRelativePath,
  resolveSpaceDirectory,
  resolveSpacePath,
} from "./space-paths"
import { readTextFilePreview, saveTextFile } from "./text-file-preview"
import { writeTextDraftCopy } from "./text-draft-copy"

/** Called under the host mutation gate. Backups survive success and failure. */
export async function restoreTextVersion(
  root: string,
  request: RestoreTextVersionRequest,
  content: string
): Promise<RestoreTextVersionResult> {
  const relativePath = normalizeMutableRelativePath(request.path)
  if (relativePath.toLowerCase().endsWith(".eidos"))
    throw new Error("Use text files for file history recovery")
  if (
    Buffer.byteLength(content) > EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX ||
    (request.draft !== undefined &&
      Buffer.byteLength(request.draft) > EIDOS_LITE_TEXT_PREVIEW_BYTES_MAX)
  ) {
    throw new Error("History recovery is limited to 2 MB text files")
  }
  const parent = path.posix.dirname(relativePath)
  await resolveSpaceDirectory(root, parent === "." ? null : parent)
  const destination = resolveSpacePath(root, relativePath)
  const current = await readTextFilePreview(root, relativePath).catch(
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
      throw error
    }
  )
  if (
    (current &&
      (current.type !== "text" ||
        current.truncated ||
        current.revision !== request.expectedRevision)) ||
    (!current && request.expectedRevision !== null)
  ) {
    throw new Error(
      "File changed on disk. Refresh file history before restoring."
    )
  }
  const backupPaths: string[] = []
  const backup = async (value: string, label: string) => {
    const ext = path.posix.extname(relativePath)
    const name = `${relativePath.slice(0, ext ? -ext.length : undefined)}.${label}-${randomUUID()}${ext}`
    await writeTextDraftCopy(resolveSpacePath(root, name), value)
    backupPaths.push(name)
  }
  // Preserve both the visible draft and the disk version before any replacement.
  if (current?.type === "text") await backup(current.content, "before-restore")
  if (request.draft !== undefined)
    await backup(request.draft, "draft-before-restore")
  if (current?.type === "text") {
    const result = await saveTextFile(root, {
      relativePath,
      expectedRevision: current.revision,
      content: content.replace(/^\uFEFF/, ""),
    })
    if (result.status !== "saved")
      throw new Error(
        "File changed on disk. Recovery copies are preserved; refresh before restoring."
      )
  } else {
    // Exclusive creation also protects files recreated externally after the read.
    await writeTextDraftCopy(destination, content)
  }
  return { backupPaths }
}
