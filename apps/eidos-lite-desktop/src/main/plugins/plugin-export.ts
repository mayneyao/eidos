import fs from "node:fs/promises"
import { BrowserWindow, dialog } from "electron"
import type {
  FileExportRequest,
  FileExportResult,
} from "@eidos.space/plugin-sdk"
import { PluginError } from "@eidos.space/plugin-runtime/rpc"

/** Only the native dialog supplies the destination; guests never receive its path. */
export async function exportPluginFile(
  owner: number,
  input: FileExportRequest,
  authorize: () => Promise<void>
): Promise<FileExportResult> {
  const window = BrowserWindow.getAllWindows().find(
    (window) => window.webContents.id === owner
  )
  if (!window || window.isDestroyed())
    throw new PluginError("INSTANCE_CLOSED", "Plugin window closed")
  const selection = await dialog.showSaveDialog(window, {
    title: "Export file",
    defaultPath: input.name,
    properties: ["showOverwriteConfirmation", "createDirectory"],
  })
  if (selection.canceled || !selection.filePath) return { status: "cancelled" }
  if (window.isDestroyed())
    throw new PluginError("INSTANCE_CLOSED", "Plugin window closed")
  await authorize()
  await fs.writeFile(selection.filePath, input.data)
  return { status: "saved" }
}
