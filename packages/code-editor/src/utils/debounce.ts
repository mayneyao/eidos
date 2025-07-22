export interface DebounceOptions {
  delay: number
  immediate?: boolean
  maxWait?: number
}


export function debounce<T extends (...args: any[]) => any>(
  func: T,
  options: DebounceOptions | number
): (...args: Parameters<T>) => void {
  const config = typeof options === 'number'
    ? { delay: options }
    : options

  let timeout: NodeJS.Timeout | null = null
  let maxTimeout: NodeJS.Timeout | null = null
  let lastCallTime = 0

  return (...args: Parameters<T>) => {
    const now = Date.now()

    if (timeout) {
      clearTimeout(timeout)
    }

    if (config.immediate && !timeout) {
      func(...args)
      lastCallTime = now
      return
    }

    if (config.maxWait && !maxTimeout) {
      maxTimeout = setTimeout(() => {
        func(...args)
        timeout = null
        maxTimeout = null
        lastCallTime = now
      }, config.maxWait)
    }

    timeout = setTimeout(() => {
      func(...args)
      timeout = null
      if (maxTimeout) {
        clearTimeout(maxTimeout)
        maxTimeout = null
      }
      lastCallTime = now
    }, config.delay)
  }
}

export const EditorDebounceConfig = {
  CONTENT_SYNC: {
    delay: 500,
    maxWait: 2000,
  },
  TYPE_CHECK: {
    delay: 800,
    maxWait: 3000,
  },
  INTELLISENSE: {
    delay: 200,
    immediate: true,
  },
  SYNTAX_HIGHLIGHT: {
    delay: 100,
    immediate: true,
  },
  ERROR_MARKERS: {
    delay: 1000,
    maxWait: 5000,
  },
} as const


export function createEditorDebounce<T extends (...args: any[]) => any>(
  func: T,
  type: keyof typeof EditorDebounceConfig
): (...args: Parameters<T>) => void {
  return debounce(func, EditorDebounceConfig[type])
}


export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCallTime = 0
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    const now = Date.now()
    const timeSinceLastCall = now - lastCallTime

    if (timeSinceLastCall >= delay) {
      func(...args)
      lastCallTime = now
    } else {
      if (timeout) {
        clearTimeout(timeout)
      }
      timeout = setTimeout(() => {
        func(...args)
        lastCallTime = Date.now()
        timeout = null
      }, delay - timeSinceLastCall)
    }
  }
}


export function debounceThrottle<T extends (...args: any[]) => any>(
  func: T,
  debounceDelay: number,
  throttleDelay: number
): (...args: Parameters<T>) => void {
  const debouncedFunc = debounce(func, debounceDelay)
  const throttledFunc = throttle(func, throttleDelay)

  let lastThrottleTime = 0

  return (...args: Parameters<T>) => {
    const now = Date.now()

    if (now - lastThrottleTime >= throttleDelay) {
      throttledFunc(...args)
      lastThrottleTime = now
    } else {
      debouncedFunc(...args)
    }
  }
}
