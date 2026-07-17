import {
  openBaseFileHandle,
  type OpenedBrowserFile,
} from "./browser-file-adapter"

export interface PwaLaunchParams {
  files: readonly FileSystemHandle[]
}

export interface PwaLaunchQueue {
  setConsumer(consumer: (params: PwaLaunchParams) => void | Promise<void>): void
}

export interface PwaLaunchTarget {
  launchQueue?: PwaLaunchQueue
}

interface RegisterPwaBaseFileHandlerOptions {
  onOpen: (file: OpenedBrowserFile) => void | Promise<void>
  onError: (error: unknown) => void
  target?: PwaLaunchTarget
}

export function supportsPwaFileHandling(
  target: PwaLaunchTarget = window as Window & PwaLaunchTarget
): boolean {
  return typeof target.launchQueue?.setConsumer === "function"
}

/**
 * Bridges the installed-PWA launch event into the same browser file adapter
 * used by the in-app Open command. launchQueue has no unregister API, so the
 * returned cleanup function makes an old React consumer inert.
 */
export function registerPwaBaseFileHandler({
  onOpen,
  onError,
  target = window as Window & PwaLaunchTarget,
}: RegisterPwaBaseFileHandlerOptions): () => void {
  let active = true
  const queue = target.launchQueue
  if (!queue) return () => undefined

  queue.setConsumer(async ({ files }) => {
    const handle = files.find(
      (candidate): candidate is FileSystemFileHandle =>
        candidate.kind === "file"
    )
    if (!handle || !active) return

    try {
      const opened = await openBaseFileHandle(handle)
      if (active) await onOpen(opened)
    } catch (error) {
      if (active) onError(error)
    }
  })

  return () => {
    active = false
  }
}
