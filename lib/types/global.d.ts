interface FileSystemDirectoryHandle {
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  keys(): AsyncIterableIterator<string>
  values(): AsyncIterableIterator<FileSystemHandle>
}

interface ImportMeta {
  env: Record<string, unknown>
}
