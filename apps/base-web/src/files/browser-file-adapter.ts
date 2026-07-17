export type FileAccessMode = "direct" | "copy"
export type FileWritePermission = "granted" | "prompt" | "denied"

// Kept at the browser boundary so the main-thread picker adapter does not pull
// the runtime/query implementation into the UI bundle. The worker remains the
// only consumer of @eidos.space/base executable code.
export const BASE_FILE_EXTENSION = ".base"
export const BASE_MIME_TYPE = "application/vnd.eidos.base+sqlite3"

export interface BaseFileVersion {
  size: number
  lastModified: number
  digest: string
}

export interface ReadBaseFile {
  bytes: ArrayBuffer
  version: BaseFileVersion
}

export interface OpenedBrowserFile extends ReadBaseFile {
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

const BASE_PICKER_TYPE: FilePickerAcceptType = {
  description: "Eidos Base",
  accept: { [BASE_MIME_TYPE]: [BASE_FILE_EXTENSION] },
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
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

export async function readBaseFile(file: File): Promise<ReadBaseFile> {
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

export async function pickDirectBaseFile(): Promise<OpenedBrowserFile | null> {
  if (!supportsDirectFileAccess()) return null
  try {
    const handles = await window.showOpenFilePicker?.({
      multiple: false,
      types: [BASE_PICKER_TYPE],
      excludeAcceptAllOption: false,
    })
    const handle = handles?.[0]
    if (!handle) return null
    const file = await handle.getFile()
    const read = await readBaseFile(file)
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

export async function openBaseFileHandle(
  handle: FileSystemFileHandle
): Promise<OpenedBrowserFile> {
  const file = await handle.getFile()
  if (!file.name.toLowerCase().endsWith(BASE_FILE_EXTENSION)) {
    throw new Error(
      `“${file.name}” is not an Eidos Base file. Choose a ${BASE_FILE_EXTENSION} file.`
    )
  }
  const read = await readBaseFile(file)
  return {
    ...read,
    fileName: file.name,
    mode: "direct",
    permission: await queryWritePermission(handle),
    handle,
  }
}

export async function openImportedBaseFile(
  file: File
): Promise<OpenedBrowserFile> {
  const read = await readBaseFile(file)
  return {
    ...read,
    fileName: file.name,
    mode: "copy",
    permission: "denied",
  }
}

export function sameFileVersion(
  left: BaseFileVersion,
  right: BaseFileVersion
): boolean {
  return left.digest === right.digest
}

export async function readHandleVersion(
  handle: FileSystemFileHandle
): Promise<ReadBaseFile> {
  return readBaseFile(await handle.getFile())
}

export async function writeAndVerifyHandle(
  handle: FileSystemFileHandle,
  bytes: Uint8Array
): Promise<BaseFileVersion> {
  const writable = await handle.createWritable({ keepExistingData: false })
  try {
    await writable.write(bytes)
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

  const digestInput = new Uint8Array(bytes.byteLength)
  digestInput.set(bytes)
  const expectedDigest = await digestBytes(digestInput.buffer)
  const written = await readHandleVersion(handle)
  if (written.version.digest !== expectedDigest) {
    throw new Error(
      "The browser closed the file, but the bytes on disk do not match the saved Base. Your recoverable working copy is still available."
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
        suggestedName: suggestedName.toLowerCase().endsWith(BASE_FILE_EXTENSION)
          ? suggestedName
          : `${suggestedName}${BASE_FILE_EXTENSION}`,
        types: [BASE_PICKER_TYPE],
        excludeAcceptAllOption: false,
      })) ?? null
    )
  } catch (error) {
    if (isAbort(error)) return null
    throw error
  }
}

export function downloadBaseCopy(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes], { type: BASE_MIME_TYPE })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName.toLowerCase().endsWith(BASE_FILE_EXTENSION)
    ? fileName
    : `${fileName}${BASE_FILE_EXTENSION}`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
