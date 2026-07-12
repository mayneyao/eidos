import type { IpcMain, IpcRenderer } from "electron"

/**
 * IPC Service Registry
 *
 * This singleton registry tracks all IPC services and their methods.
 * It enables automatic method discovery between main and preload processes.
 */
class IpcRegistry {
  private methods = new Map<string, string[]>()

  /**
   * Register a service with its available method names
   * Called from main.ts after creating service instances
   */
  registerService(namespace: string, methods: string[]) {
    this.methods.set(namespace, methods)
  }

  /**
   * Get method names for a service synchronously
   * Used internally by the registry
   */
  getMethodsSync(namespace: string): string[] {
    return this.methods.get(namespace) || []
  }
}

// Singleton instance (created per-process, shared in each context)
export const registry = new IpcRegistry()

/**
 * Setup the IPC handler for synchronous method retrieval from preload
 * This runs in the main process context
 */
export function setupRegistryIpc() {
  const { ipcMain } = require("electron") as { ipcMain: IpcMain }
  // Use a unique channel for registry queries
  ipcMain.on("__ipc_registry_get_methods", (event, namespace: string) => {
    const methods = registry.getMethodsSync(namespace)
    event.returnValue = methods
  })
}

/**
 * Create a preload API for a given namespace.
 * Called from preload.ts to auto-generate the API object.
 *
 * Uses synchronous IPC to retrieve method names from the registry,
 * then creates a plain object with each method bound to ipcRenderer.invoke.
 *
 * Note: Use this inside contextBridge.exposeInMainWorld, not as the API itself
 * to avoid "An object could not be cloned" errors.
 */
export function createPreloadApiByNamespace(
  namespace: string
): Record<string, Function> {
  const { ipcRenderer } = require("electron") as { ipcRenderer: IpcRenderer }
  // Synchronously get method names from registry via IPC
  const methods = ipcRenderer.sendSync("__ipc_registry_get_methods", namespace)

  if (!Array.isArray(methods) || methods.length === 0) {
    console.warn(`[IPC] No methods found for namespace: ${namespace}`)
  }

  // Create a plain object with methods (not a Proxy - avoids serialization issues)
  const api: Record<string, Function> = {}

  for (const name of methods) {
    api[name] = (...args: any[]) =>
      ipcRenderer.invoke(`${namespace}:${name}`, ...args)
  }

  return api
}
