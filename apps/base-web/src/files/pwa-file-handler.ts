import {
  openBaseFileHandle,
  type OpenedBrowserFile,
} from "./browser-file-adapter"

export interface PwaLaunchParams {
  files?: readonly FileSystemHandle[]
  targetURL?: string
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

type LaunchSubscriber = Pick<
  RegisterPwaBaseFileHandlerOptions,
  "onOpen" | "onError"
>

type PendingLaunch =
  | { type: "open"; file: OpenedBrowserFile }
  | { type: "error"; error: unknown }

interface LaunchQueueState {
  subscriber: LaunchSubscriber | null
  pending: PendingLaunch[]
  generation: number
  drainTimer: ReturnType<typeof setTimeout> | null
}

const launchTargetStates = new WeakMap<PwaLaunchTarget, LaunchQueueState>()

async function deliverLaunch(
  subscriber: LaunchSubscriber,
  launch: PendingLaunch
): Promise<void> {
  if (launch.type === "open") {
    await subscriber.onOpen(launch.file)
  } else {
    subscriber.onError(launch.error)
  }
}

function schedulePendingLaunches(state: LaunchQueueState): void {
  if (state.pending.length === 0 || !state.subscriber) return
  if (state.drainTimer !== null) clearTimeout(state.drainTimer)

  const generation = state.generation
  state.drainTimer = setTimeout(() => {
    state.drainTimer = null
    const subscriber = state.subscriber
    if (!subscriber || generation !== state.generation) {
      schedulePendingLaunches(state)
      return
    }

    const pending = state.pending.splice(0)
    void (async () => {
      for (let index = 0; index < pending.length; index += 1) {
        if (
          state.subscriber !== subscriber ||
          state.generation !== generation
        ) {
          state.pending.unshift(...pending.slice(index))
          schedulePendingLaunches(state)
          return
        }
        try {
          await deliverLaunch(subscriber, pending[index])
        } catch (error) {
          subscriber.onError(error)
        }
      }
    })()
  }, 0)
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
  const queue = target.launchQueue
  if (!queue) return () => undefined

  const subscriber: LaunchSubscriber = { onOpen, onError }
  let state = launchTargetStates.get(target)
  if (!state) {
    state = {
      subscriber,
      pending: [],
      generation: 1,
      drainTimer: null,
    }
    launchTargetStates.set(target, state)
    queue.setConsumer(async ({ files = [] }) => {
      try {
        const handle = files.find(
          (candidate): candidate is FileSystemFileHandle =>
            candidate.kind === "file"
        )
        if (!handle) return
        const file = await openBaseFileHandle(handle)
        state!.pending.push({
          type: "open",
          file,
        })
      } catch (error) {
        state!.pending.push({ type: "error", error })
      }
      schedulePendingLaunches(state!)
    })
  } else {
    state.subscriber = subscriber
    state.generation += 1
    schedulePendingLaunches(state)
  }

  return () => {
    if (state.subscriber === subscriber) {
      state.subscriber = null
      state.generation += 1
    }
  }
}
