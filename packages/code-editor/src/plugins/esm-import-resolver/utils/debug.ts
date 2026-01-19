/**
 * Debug utilities for ESM Import Resolver
 * Set DEBUG_ESM to true to enable verbose logging
 */

export const DEBUG_ESM = false

export function debugLog(prefix: string, ...args: unknown[]): void {
  if (DEBUG_ESM) {
    console.log(`[${prefix}]`, ...args)
  }
}

export function debugWarn(prefix: string, ...args: unknown[]): void {
  if (DEBUG_ESM) {
    console.warn(`[${prefix}]`, ...args)
  }
}

export function debugError(prefix: string, ...args: unknown[]): void {
  if (DEBUG_ESM) {
    console.error(`[${prefix}]`, ...args)
  }
}

// Pre-configured debug functions for specific modules
export const esmTypesDebug = {
  log: (...args: unknown[]) => debugLog('ESM Types', ...args),
  warn: (...args: unknown[]) => debugWarn('ESM Types', ...args),
  error: (...args: unknown[]) => debugError('ESM Types', ...args),
}

export const esmMonacoDebug = {
  log: (...args: unknown[]) => debugLog('ESM Monaco', ...args),
  error: (...args: unknown[]) => debugError('ESM Monaco', ...args),
}

export const esmPluginDebug = {
  log: (...args: unknown[]) => debugLog('ESM Plugin', ...args),
  warn: (...args: unknown[]) => debugWarn('ESM Plugin', ...args),
  error: (...args: unknown[]) => debugError('ESM Plugin', ...args),
}

export const importParserDebug = {
  warn: (...args: unknown[]) => debugWarn('Import Parser', ...args),
  error: (...args: unknown[]) => debugError('Import Parser', ...args),
}
