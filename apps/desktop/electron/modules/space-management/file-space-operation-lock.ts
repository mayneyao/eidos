const operationTails = new Map<string, Promise<void>>()

/**
 * Serialize main-process operations that may inspect or mutate one file Space.
 * This closes races between Graft restore and filesystem IPC mutations while
 * still allowing unrelated Spaces to make progress independently.
 */
export async function withFileSpaceOperationLock<T>(
  spaceId: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = operationTails.get(spaceId) ?? Promise.resolve()
  const result = previous.catch(() => undefined).then(operation)
  const tail = result.then(
    () => undefined,
    () => undefined
  )
  operationTails.set(spaceId, tail)

  try {
    return await result
  } finally {
    if (operationTails.get(spaceId) === tail) operationTails.delete(spaceId)
  }
}
