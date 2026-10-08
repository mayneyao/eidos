import { parseFileExport } from "@eidos.space/plugin-runtime/file-export"
import type { FileExportResult } from "@eidos.space/plugin-sdk"

/** Run in the trusted parent page, never in the plugin iframe. */
export function downloadPluginFile(params: unknown): FileExportResult {
  const input = parseFileExport(params)
  const url = URL.createObjectURL(
    new Blob([input.data], { type: input.mimeType })
  )
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = input.name
  document.body.append(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    // Allow the browser to consume the URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  return { status: "download-started" }
}
