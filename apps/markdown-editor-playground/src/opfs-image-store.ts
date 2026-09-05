import type {
  MarkdownEditorPasteImageRequest,
  MarkdownEditorPastedImage,
  MarkdownEditorResolveImageUrlRequest,
} from "@eidos.space/markdown"

const STORAGE_DIRECTORY = "markdown-editor-playground"
const IMAGE_DIRECTORY = "images"
const IMAGE_URL_PREFIX = `opfs://${STORAGE_DIRECTORY}/${IMAGE_DIRECTORY}/`
const DEFAULT_ORPHAN_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000

type IterableFileSystemDirectoryHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

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

export function referencedOpfsImageFileNames(markdown: string): Set<string> {
  const names = new Set<string>()
  const pattern = new RegExp(
    `${IMAGE_URL_PREFIX.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}([a-f0-9-]+\\.[a-z0-9]{1,10})`,
    "giu"
  )
  for (const match of markdown.matchAll(pattern)) names.add(match[1])
  return names
}

export class PlaygroundOpfsImageStore {
  readonly #objectUrls = new Map<string, string>()
  #directoryPromise?: Promise<FileSystemDirectoryHandle>
  #generation = 0

  #assertActive(signal: AbortSignal, generation: number): void {
    abortIfNeeded(signal)
    if (generation !== this.#generation)
      throw new DOMException("Image store was disposed", "AbortError")
  }

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
    const generation = this.#generation
    this.#assertActive(signal, generation)
    const directory = await this.#directory()
    this.#assertActive(signal, generation)

    const fileName = `${crypto.randomUUID()}.${extensionFor(file)}`
    const markdownUrl = `${IMAGE_URL_PREFIX}${fileName}`
    let writable: FileSystemWritableFileStream | undefined
    try {
      const handle = await directory.getFileHandle(fileName, { create: true })
      this.#assertActive(signal, generation)
      writable = await handle.createWritable()
      this.#assertActive(signal, generation)
      await writable.write(file)
      this.#assertActive(signal, generation)
      await writable.close()
      this.#assertActive(signal, generation)
    } catch (cause) {
      try {
        await writable?.abort(cause)
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
    const generation = this.#generation
    this.#assertActive(signal, generation)

    const cached = this.#objectUrls.get(markdownUrl)
    if (cached) return cached
    const directory = await this.#directory()
    this.#assertActive(signal, generation)
    const handle = await directory.getFileHandle(fileName)
    this.#assertActive(signal, generation)
    const file = await handle.getFile()
    this.#assertActive(signal, generation)
    return this.#displayUrl(markdownUrl, file)
  }

  async sweepUnusedImages(
    markdown: string,
    options: { minimumAgeMs?: number; now?: number } = {}
  ): Promise<void> {
    const referenced = referencedOpfsImageFileNames(markdown)
    const minimumAgeMs = options.minimumAgeMs ?? DEFAULT_ORPHAN_GRACE_PERIOD_MS
    const now = options.now ?? Date.now()
    const directory = await this.#directory()

    for await (const [name, handle] of (
      directory as IterableFileSystemDirectoryHandle
    ).entries()) {
      if (handle.kind !== "file" || referenced.has(name)) continue
      const file = await (handle as FileSystemFileHandle).getFile()
      if (now - file.lastModified < minimumAgeMs) continue
      await directory.removeEntry(name)
      const markdownUrl = `${IMAGE_URL_PREFIX}${name}`
      const objectUrl = this.#objectUrls.get(markdownUrl)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      this.#objectUrls.delete(markdownUrl)
    }
  }

  dispose(): void {
    // Invalidate pending work as well as existing URLs. A later operation may
    // reuse this store (for example after React StrictMode effect replay).
    this.#generation += 1
    for (const url of this.#objectUrls.values()) URL.revokeObjectURL(url)
    this.#objectUrls.clear()
  }
}
