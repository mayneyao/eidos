import type {
  TextFilePreviewResult,
  TextFileSaveRequest,
  TextFileSaveResult,
} from "../../shared/contracts"
import type { DiskSnapshot } from "@eidos.space/plugin-runtime/working-copy"
import { PluginError } from "@eidos.space/plugin-runtime/rpc"
import type { Disposable } from "@eidos.space/plugin-sdk"
export interface PluginDocumentSession {
  canonical: { id: string }
  previewTextFile(path: string): Promise<TextFilePreviewResult>
  saveTextFile(request: TextFileSaveRequest): Promise<TextFileSaveResult>
  openOrCreateMarkdownFile(
    path: string
  ): Promise<{ path: string; created: boolean }>
  listMarkdownFiles(folder: string): Promise<{
    paths: string[]
    truncated: boolean
  }>
  countMarkdownLines(
    paths: string[]
  ): Promise<Array<{ path: string; lines: number | null }>>
  watchMarkdownFiles(folder: string, listener: () => void): Disposable
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
