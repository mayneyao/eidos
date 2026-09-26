import type {
  TextFilePreviewResult,
  TextFileSaveRequest,
  TextFileSaveResult,
} from "../../shared/contracts"
import type { DiskSnapshot } from "@eidos.space/plugin-runtime/working-copy"
import { PluginError } from "@eidos.space/plugin-runtime/rpc"
import type { Disposable, FileStat } from "@eidos.space/plugin-sdk"
export interface MediaFilePreviewResult {
  path: string
  name: string
  baseName: string
  extension: string
  mimeType: string
  size: number
  previewUrl: string
}

export interface PluginDocumentSession {
  canonical: { id: string }
  previewTextFile(path: string): Promise<TextFilePreviewResult>
  previewMediaFile?(
    path: string,
    identifier?: string
  ): Promise<MediaFilePreviewResult>
  readSidecarText?(
    path: string,
    extensionOrName: string
  ): Promise<{ text: string; path: string } | null>
  listSidecars?(
    path: string,
    extensions?: string[]
  ): Promise<
    Array<{ name: string; path: string; extension: string; size: number }>
  >
  saveTextFile(request: TextFileSaveRequest): Promise<TextFileSaveResult>
  readTextFile?(path: string): Promise<string>
  writeTextFile?(path: string, content: string): Promise<void>
  readBinaryFile?(path: string): Promise<Buffer>
  writeBinaryFile?(path: string, buffer: Buffer): Promise<void>
  deleteFile?(path: string): Promise<void>
  renameFile?(oldPath: string, newPath: string): Promise<void>
  statFile?(path: string): Promise<FileStat | null>
  listFiles?(
    folder: string,
    options?: { extensions?: string[] }
  ): Promise<FileStat[]>
  watchFiles?(folder: string, listener: () => void): Disposable
}
export function diskSnapshot(preview: TextFilePreviewResult): DiskSnapshot {
  if (preview.type !== "text")
    throw new PluginError(
      "DOCUMENT_UNAVAILABLE",
      "Plugin requires a text document"
    )
  if (preview.truncated)
    throw new PluginError("TOO_LARGE", "Plugin text limit is 2 MiB")
  return {
    text: preview.content,
    revision: preview.revision,
    encoding: preview.encoding,
    bom: preview.bom,
  }
}
