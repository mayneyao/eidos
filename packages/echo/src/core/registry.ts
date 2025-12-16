/**
 * Iterator function registry
 * Tracks which methods return AsyncIterables
 */

/**
 * Global registry of iterator functions
 */
const iteratorFunctions = new Set<string>([
  // DataSpace iterator functions
  'doc.watch',
  'table.rows.watch',
  'fs.watch',
  'queue.watch',
  'message.watch',
  'chat.watch',
  
  // Add more as needed
])

/**
 * Register a function as returning an AsyncIterable
 */
export function registerIteratorFunction(methodName: string): void {
  iteratorFunctions.add(methodName)
}

/**
 * Unregister an iterator function
 */
export function unregisterIteratorFunction(methodName: string): void {
  iteratorFunctions.delete(methodName)
}

/**
 * Check if a method is registered as an iterator function
 */
export function isIteratorFunction(methodName: string): boolean {
  return iteratorFunctions.has(methodName)
}

/**
 * Get all registered iterator functions
 */
export function getIteratorFunctions(): string[] {
  return Array.from(iteratorFunctions)
}

/**
 * Clear all registered iterator functions
 */
export function clearIteratorFunctions(): void {
  iteratorFunctions.clear()
}

/**
 * Create a custom registry (isolated from global)
 */
export function createRegistry(): {
  register: (methodName: string) => void
  unregister: (methodName: string) => void
  isIterator: (methodName: string) => boolean
  getAll: () => string[]
  clear: () => void
} {
  const registry = new Set<string>()

  return {
    register: (methodName: string) => registry.add(methodName),
    unregister: (methodName: string) => registry.delete(methodName),
    isIterator: (methodName: string) => registry.has(methodName),
    getAll: () => Array.from(registry),
    clear: () => registry.clear(),
  }
}

