import { DatabaseSync } from "node:sqlite"
import type { FileMetaValues, FileMetaPatch } from "@eidos.space/plugin-sdk"
import { resolvePluginFile } from "../main/space/plugin-file-mutations"
import { resolveVTabExtensionPath } from "./vtab-resolver"

/** Runs only inside the utility boundary; no .eidos schema is required. */
export async function filemeta(
  root: string,
  relativePath: string,
  namespace: string,
  patch?: FileMetaPatch
): Promise<FileMetaValues> {
  const { fullPath, stats } = await resolvePluginFile(root, relativePath)
  if (!stats) throw new Error("File does not exist")
  const extension = resolveVTabExtensionPath("fs_meta")
  if (!extension) throw new Error("sqlite-fs-meta extension is unavailable")
  const db = new DatabaseSync(":memory:", { allowExtension: true })
  try {
    db.loadExtension(extension)
    db.enableLoadExtension(false)
    const supported = db
      .prepare(
        "SELECT name FROM pragma_function_list WHERE name = 'fs_meta_patch'"
      )
      .get()
    if (!supported)
      throw Object.assign(
        new Error(
          "This sqlite-fs-meta binary does not support the namespace property API"
        ),
        { code: "UNSUPPORTED_API" }
      )
    const row = patch
      ? db
          .prepare("SELECT fs_meta_patch(?, ?, ?, ?) AS json")
          .get(
            fullPath,
            namespace,
            JSON.stringify(patch.set ?? {}),
            JSON.stringify(patch.remove ?? [])
          )
      : db.prepare("SELECT fs_meta_read(?, ?) AS json").get(fullPath, namespace)
    return JSON.parse(String(row!.json)) as FileMetaValues
  } finally {
    db.close()
  }
}
