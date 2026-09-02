import type {
  MarkdownEditorPasteImageRequest,
  MarkdownEditorPastedImage,
  MarkdownEditorResolveImageUrlRequest,
} from "@eidos.space/markdown-editor"

const STORAGE_DIRECTORY = "markdown-editor-playground"
const IMAGE_DIRECTORY = "images"
const IMAGE_URL_PREFIX = `opfs://${STORAGE_DIRECTORY}/${IMAGE_DIRECTORY}/`

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
}

function abortIfNeeded(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Operation aborted", "AbortError")
}

function extensionFor(file: File): string {
  const fromMime = MIME_EXTENSIONS[file.type.toLowerCase()]
  if (fromMime) return fromMime
  return file.name.match(/\.([a-z0-9]{1,10})$/iu)?.[1]?.toLowerCase() ?? "img"
}

function altFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/u, "") || name || "Pasted image"
}

function fileNameFromMarkdownUrl(markdownUrl: string): string | null {
  if (!markdownUrl.startsWith(IMAGE_URL_PREFIX)) return null
  const encodedName = markdownUrl.slice(IMAGE_URL_PREFIX.length)
  try {
    const name = decodeURIComponent(encodedName)
    return /^[a-f0-9-]+\.[a-z0-9]{1,10}$/u.test(name) ? name : null
  } catch {
    return null
  }
}

export class PlaygroundOpfsImageStore {
  readonly #objectUrls = new Map<string, string>()
  #directoryPromise?: Promise<FileSystemDirectoryHandle>

  async #directory(): Promise<FileSystemDirectoryHandle> {
    if (!navigator.storage?.getDirectory) {
      throw new Error("This browser does not support OPFS image storage.")
    }
    this.#directoryPromise ??= navigator.storage
      .getDirectory()
      .then((root) =>
        root.getDirectoryHandle(STORAGE_DIRECTORY, { create: true })
      )
      .then((directory) =>
        directory.getDirectoryHandle(IMAGE_DIRECTORY, { create: true })
      )
    return this.#directoryPromise
  }

  #displayUrl(markdownUrl: string, file: Blob): string {
    const cached = this.#objectUrls.get(markdownUrl)
    if (cached) return cached
    const displayUrl = URL.createObjectURL(file)
    this.#objectUrls.set(markdownUrl, displayUrl)
    return displayUrl
  }

  async persistImage({
    file,
    signal,
  }: MarkdownEditorPasteImageRequest): Promise<MarkdownEditorPastedImage> {
    abortIfNeeded(signal)
    const directory = await this.#directory()
    abortIfNeeded(signal)

    const fileName = `${crypto.randomUUID()}.${extensionFor(file)}`
    const markdownUrl = `${IMAGE_URL_PREFIX}${fileName}`
    const handle = await directory.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    try {
      abortIfNeeded(signal)
      await writable.write(file)
      abortIfNeeded(signal)
      await writable.close()
    } catch (cause) {
      try {
        await writable.abort(cause)
      } catch {
        // The stream may already be closed; the unique entry is removed below.
      }
      try {
        await directory.removeEntry(fileName)
      } catch {
        // Cleanup failure should not hide the original persistence error.
      }
      throw cause
    }

    return {
      markdownUrl,
      displayUrl: this.#displayUrl(markdownUrl, file),
      alt: altFromFileName(file.name),
    }
  }

  async resolveImageUrl({
    markdownUrl,
    signal,
  }: MarkdownEditorResolveImageUrlRequest): Promise<string | null> {
    const fileName = fileNameFromMarkdownUrl(markdownUrl)
    if (!fileName) return null
    abortIfNeeded(signal)

    const cached = this.#objectUrls.get(markdownUrl)
    if (cached) return cached
    const directory = await this.#directory()
    abortIfNeeded(signal)
    const handle = await directory.getFileHandle(fileName)
    const file = await handle.getFile()
    abortIfNeeded(signal)
    return this.#displayUrl(markdownUrl, file)
  }

  dispose(): void {
    for (const url of this.#objectUrls.values()) URL.revokeObjectURL(url)
    this.#objectUrls.clear()
  }
}
