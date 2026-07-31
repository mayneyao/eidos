export type FileAccessMode = "direct" | "copy"
export type FileWritePermission = "granted" | "prompt" | "denied"

// Kept at the browser boundary so the main-thread picker adapter does not pull
// the runtime/query implementation into the UI bundle. The worker remains the
// only consumer of @eidos.space/eidos-file executable code.
import {
  EIDOS_FILE_EXTENSION,
  EIDOS_FILE_MIME_TYPE,
} from "@eidos.space/eidos-file"

export { EIDOS_FILE_EXTENSION, EIDOS_FILE_MIME_TYPE }

export interface EidosFileVersion {
  size: number
  lastModified: number
  digest: string
}

export interface ReadEidosFile {
  bytes: ArrayBuffer
  version: EidosFileVersion
}

export interface OpenedBrowserFile extends ReadEidosFile {
  fileName: string
  mode: FileAccessMode
  permission: FileWritePermission
  handle?: FileSystemFileHandle
}

declare global {
  interface Window {
    showOpenFilePicker?: (
      options?: OpenFilePickerOptions
    ) => Promise<FileSystemFileHandle[]>
    showSaveFilePicker?: (
      options?: SaveFilePickerOptions
    ) => Promise<FileSystemFileHandle>
  }
}

const EIDOS_FILE_PICKER_TYPE: FilePickerAcceptType = {
  description: "Eidos File",
  accept: { [EIDOS_FILE_MIME_TYPE]: [EIDOS_FILE_EXTENSION] },
}

function assertEidosFileName(fileName: string): void {
  if (fileName.toLowerCase().endsWith(EIDOS_FILE_EXTENSION)) return
  throw new Error(
    `“${fileName}” is not a valid Eidos File. Choose a ${EIDOS_FILE_EXTENSION} file.`
  )
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

export function isFilePermissionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false
  }
  return error.name === "NotAllowedError" || error.name === "SecurityError"
}

export function supportsDirectFileAccess(
  target: Pick<Window, "showOpenFilePicker"> = window
): boolean {
  return typeof target.showOpenFilePicker === "function"
}

export function supportsSavePicker(
  target: Pick<Window, "showSaveFilePicker"> = window
): boolean {
  return typeof target.showSaveFilePicker === "function"
}

export async function digestBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

function copyBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export async function readEidosFile(file: File): Promise<ReadEidosFile> {
  const bytes = await file.arrayBuffer()
  return {
    bytes,
    version: {
      size: file.size,
      lastModified: file.lastModified,
      digest: await digestBytes(bytes),
    },
  }
}

export async function queryWritePermission(
  handle: FileSystemFileHandle
): Promise<FileWritePermission> {
  try {
    return await handle.queryPermission({ mode: "readwrite" })
  } catch {
    return "denied"
  }
}

export async function requestWritePermission(
  handle: FileSystemFileHandle
): Promise<FileWritePermission> {
  try {
    return await handle.requestPermission({ mode: "readwrite" })
  } catch {
    return "denied"
  }
}

export async function pickDirectEidosFile(): Promise<OpenedBrowserFile | null> {
  if (!supportsDirectFileAccess()) return null
  try {
    const handles = await window.showOpenFilePicker?.({
      multiple: false,
      types: [EIDOS_FILE_PICKER_TYPE],
      excludeAcceptAllOption: false,
    })
    const handle = handles?.[0]
    if (!handle) return null
    const file = await handle.getFile()
    assertEidosFileName(file.name)
    const read = await readEidosFile(file)
    return {
      ...read,
      fileName: file.name,
      mode: "direct",
      permission: await queryWritePermission(handle),
      handle,
    }
  } catch (error) {
    if (isAbort(error)) return null
    throw error
  }
}

export async function openEidosFileHandle(
  handle: FileSystemFileHandle
): Promise<OpenedBrowserFile> {
  const file = await handle.getFile()
  assertEidosFileName(file.name)
  const read = await readEidosFile(file)
  return {
    ...read,
    fileName: file.name,
    mode: "direct",
    permission: await queryWritePermission(handle),
    handle,
  }
}

export async function openImportedEidosFile(
  file: File
): Promise<OpenedBrowserFile> {
  assertEidosFileName(file.name)
  const read = await readEidosFile(file)
  return {
    ...read,
    fileName: file.name,
    mode: "copy",
    permission: "denied",
  }
}

export function sameFileVersion(
  left: EidosFileVersion,
  right: EidosFileVersion
): boolean {
  return left.digest === right.digest
}

export async function readHandleVersion(
  handle: FileSystemFileHandle
): Promise<ReadEidosFile> {
  return readEidosFile(await handle.getFile())
}

export async function readHandleVersionIfGranted(
  handle: FileSystemFileHandle,
  permission: FileWritePermission
): Promise<ReadEidosFile | null> {
  // Handles restored from IndexedDB commonly return "prompt". Reading them
  // before a user gesture would throw NotAllowedError and does not mean the
  // handle is stale or unusable.
  if (permission !== "granted") return null
  return readHandleVersion(handle)
}

export async function writeAndVerifyHandle(
  handle: FileSystemFileHandle,
  bytes: Uint8Array
): Promise<EidosFileVersion> {
  const writtenBytes = copyBytes(bytes)
  const writable = await handle.createWritable({ keepExistingData: false })
  try {
    await writable.write(writtenBytes)
    await writable.close()
  } catch (error) {
    try {
      await writable.abort(error)
    } catch {
      // The stream may already be closed or aborted. The caller still receives
      // the original write failure and retains the OPFS recovery copy.
    }
    throw error
  }

  const expectedDigest = await digestBytes(writtenBytes)
  const written = await readHandleVersion(handle)
  if (written.version.digest !== expectedDigest) {
    throw new Error(
      "The browser closed the file, but the bytes on disk do not match the saved Eidos File. Your recoverable working copy is still available."
    )
  }
  return written.version
}

export async function pickSaveHandle(
  suggestedName: string
): Promise<FileSystemFileHandle | null> {
  if (!supportsSavePicker()) return null
  try {
    return (
      (await window.showSaveFilePicker?.({
        suggestedName: suggestedName
          .toLowerCase()
          .endsWith(EIDOS_FILE_EXTENSION)
          ? suggestedName
          : `${suggestedName}${EIDOS_FILE_EXTENSION}`,
        types: [EIDOS_FILE_PICKER_TYPE],
        excludeAcceptAllOption: false,
      })) ?? null
    )
  } catch (error) {
    if (isAbort(error)) return null
    throw error
  }
}

export function downloadEidosFileCopy(
  bytes: Uint8Array,
  fileName: string
): void {
  const blob = new Blob([copyBytes(bytes)], { type: EIDOS_FILE_MIME_TYPE })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName.toLowerCase().endsWith(EIDOS_FILE_EXTENSION)
    ? fileName
    : `${fileName}${EIDOS_FILE_EXTENSION}`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
