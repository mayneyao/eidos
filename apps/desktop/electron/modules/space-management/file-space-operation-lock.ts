type FileSpaceOperationKind = "read" | "write"

interface FileSpaceOperationWaiter {
  kind: FileSpaceOperationKind
  start: () => void
}

interface FileSpaceOperationState {
  activeReaders: number
  writerActive: boolean
  queue: FileSpaceOperationWaiter[]
}

const operationStates = new Map<string, FileSpaceOperationState>()

function stateFor(spaceId: string): FileSpaceOperationState {
  const existing = operationStates.get(spaceId)
  if (existing) return existing
  const state: FileSpaceOperationState = {
    activeReaders: 0,
    writerActive: false,
    queue: [],
  }
  operationStates.set(spaceId, state)
  return state
}

function release(
  spaceId: string,
  state: FileSpaceOperationState,
  kind: FileSpaceOperationKind
): void {
  if (kind === "read") state.activeReaders -= 1
  else state.writerActive = false
  drain(spaceId, state)
}

function drain(spaceId: string, state: FileSpaceOperationState): void {
  if (state.writerActive) return

  const next = state.queue[0]
  if (state.activeReaders > 0) {
    if (next?.kind === "read") {
      while (state.queue[0]?.kind === "read") state.queue.shift()?.start()
    }
    return
  }

  if (next?.kind === "write") {
    state.queue.shift()?.start()
    return
  }
  while (state.queue[0]?.kind === "read") state.queue.shift()?.start()

  if (
    state.activeReaders === 0 &&
    !state.writerActive &&
    state.queue.length === 0 &&
    operationStates.get(spaceId) === state
  ) {
    operationStates.delete(spaceId)
  }
}

function withFileSpaceLock<T>(
  spaceId: string,
  kind: FileSpaceOperationKind,
  operation: () => Promise<T>
): Promise<T> {
  const state = stateFor(spaceId)
  return new Promise<T>((resolve, reject) => {
    const waiter: FileSpaceOperationWaiter = {
      kind,
      start: () => {
        if (kind === "read") state.activeReaders += 1
        else state.writerActive = true
        void Promise.resolve()
          .then(operation)
          .then(
            (value) => {
              release(spaceId, state, kind)
              resolve(value)
            },
            (error: unknown) => {
              release(spaceId, state, kind)
              reject(error)
            }
          )
      },
    }
    const canStart =
      !state.writerActive &&
      state.queue.length === 0 &&
      (kind === "read" || state.activeReaders === 0)
    if (canStart) waiter.start()
    else state.queue.push(waiter)
  })
}

/**
 * Run a read-only operation without blocking other reads in the same Space.
 * A queued writer remains exclusive and is never overtaken by later readers.
 */
export function withFileSpaceReadLock<T>(
  spaceId: string,
  operation: () => Promise<T>
): Promise<T> {
  return withFileSpaceLock(spaceId, "read", operation)
}

/**
 * Serialize main-process operations that may mutate one file Space. Writers
 * also wait for active readers, closing races with Graft restore and filesystem
 * mutations while unrelated Spaces continue independently.
 */
export function withFileSpaceOperationLock<T>(
  spaceId: string,
  operation: () => Promise<T>
): Promise<T> {
  return withFileSpaceLock(spaceId, "write", operation)
}
