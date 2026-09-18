import type {
  TextFilePreviewResult,
  TextFileSaveRequest,
  TextFileSaveResult,
} from "../../shared/contracts"
import type { DiskSnapshot } from "@eidos.space/plugin-runtime/working-copy"
import { PluginError } from "@eidos.space/plugin-runtime/rpc"
export interface PluginDocumentSession {
  canonical: { id: string }
  previewTextFile(path: string): Promise<TextFilePreviewResult>
  saveTextFile(request: TextFileSaveRequest): Promise<TextFileSaveResult>
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
