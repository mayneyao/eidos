/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  return function (this: any, ...args: Parameters<T>) {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    const context = this

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      func.apply(context, args)
    }, wait)
  }
}

/**
 * Checks if value is an empty object, collection, map, or set.
 */
export function isEmpty(value: any): boolean {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  if (value == null) return true
  if (Array.isArray(value) || typeof value === "string")
    return value.length === 0
  if (value instanceof Map || value instanceof Set) return value.size === 0
  if (typeof value === "object") return Object.keys(value).length === 0
  return true
}
