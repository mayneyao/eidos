/** Coalesce transient progress, without delaying task completion or writes. */
export function createTaskProgress<T>(publish: (value: T) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest: { value: T } | undefined
  const cancel = () => {
    clearTimeout(timer)
    timer = undefined
    latest = undefined
  }
  const flush = () => {
    const pending = latest
    cancel()
    if (pending) publish(pending.value)
  }
  return {
    update(value: T) {
      latest = { value }
      if (timer === undefined) timer = setTimeout(flush, 100)
    },
    flush,
    cancel,
  }
}
