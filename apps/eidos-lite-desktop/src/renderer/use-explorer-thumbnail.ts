import { useEffect, useState, useSyncExternalStore } from "react"
import type { SpaceTreeEntry } from "../shared/contracts"
import {
  explorerMediaKind,
  type ExplorerThumbnailRequest,
} from "../shared/explorer-media"

const cache = new Map<string, { url: string | null; expires: number }>()
const pending = new Map<
  string,
  { promise: Promise<string | null>; readers: Set<() => boolean> }
>()
const queue: (() => void)[] = []
let activeRequests = 0
let cachedBytes = 0

const readPixelSize = () =>
  Math.ceil(56 * Math.max(1, Math.min(8, window.devicePixelRatio || 1)))
const ignorePixelSize = () => () => {}
function watchPixelSize(listener: () => void) {
  let media: MediaQueryList | undefined
  const update = () => {
    media?.removeEventListener("change", update)
    media = window.matchMedia?.(
      `(resolution: ${window.devicePixelRatio || 1}dppx)`
    )
    media?.addEventListener("change", update)
    listener()
  }
  update()
  window.addEventListener("resize", update)
  return () => {
    window.removeEventListener("resize", update)
    media?.removeEventListener("change", update)
  }
}

function requestThumbnail(
  key: string,
  request: ExplorerThumbnailRequest,
  active: () => boolean
): Promise<string | null> {
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) {
    cache.delete(key)
    cache.set(key, cached)
    return Promise.resolve(cached.url)
  }
  const existing = pending.get(key)
  if (existing) {
    existing.readers.add(active)
    return existing.promise
  }
  const readers = new Set([active])
  const promise = new Promise<string | null>((resolve) => {
    const run = () => {
      if (![...readers].some((reader) => reader())) {
        pending.delete(key)
        resolve(null)
        queueMicrotask(() => queue.shift()?.())
        return
      }
      if (activeRequests >= 2) {
        queue.push(run)
        return
      }
      activeRequests++
      void Promise.resolve()
        .then(() => window.eidosLite.getExplorerFileThumbnail(request))
        .catch(() => null)
        .then((url) => {
          const previous = cache.get(key)
          cachedBytes -= (previous?.url?.length ?? 0) * 2
          cache.set(key, { url, expires: url ? Infinity : Date.now() + 30_000 })
          cachedBytes += (url?.length ?? 0) * 2
          while (cache.size > 128 || cachedBytes > 16 * 1024 * 1024) {
            const oldest = cache.entries().next().value!
            cache.delete(oldest[0])
            cachedBytes -= (oldest[1].url?.length ?? 0) * 2
          }
          pending.delete(key)
          activeRequests--
          resolve(url)
          queueMicrotask(() => queue.shift()?.())
        })
    }
    queueMicrotask(run)
  })
  pending.set(key, { promise, readers })
  return promise
}

export function useExplorerThumbnail(
  spaceId: string,
  entry: SpaceTreeEntry,
  visible: boolean
): string | null {
  const pixelSize = useSyncExternalStore(
    explorerMediaKind(entry.name) ? watchPixelSize : ignorePixelSize,
    readPixelSize,
    () => 112
  )
  const fileKey = JSON.stringify([
    spaceId,
    entry.relativePath,
    entry.size,
    entry.modifiedAtMs,
  ])
  const key = JSON.stringify([fileKey, pixelSize])
  const cached = cache.get(key)
  const cachedUrl = cached && cached.expires > Date.now() ? cached.url : null
  const [result, setResult] = useState({ key, fileKey, url: cachedUrl })
  useEffect(() => {
    if (!visible || !explorerMediaKind(entry.name)) return
    let active = true
    void requestThumbnail(
      key,
      {
        spaceId,
        relativePath: entry.relativePath,
        size: entry.size,
        modifiedAtMs: entry.modifiedAtMs,
        pixelSize,
      },
      () => active
    ).then((url) => {
      if (active)
        setResult((previous) => ({
          key,
          fileKey,
          url: url ?? (previous.fileKey === fileKey ? previous.url : null),
        }))
    })
    return () => {
      active = false
    }
  }, [
    key,
    fileKey,
    pixelSize,
    visible,
    spaceId,
    entry.relativePath,
    entry.name,
    entry.size,
    entry.modifiedAtMs,
  ])
  return result.key === key
    ? result.url
    : (cachedUrl ?? (result.fileKey === fileKey ? result.url : null))
}
