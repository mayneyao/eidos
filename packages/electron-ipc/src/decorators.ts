// IPC Decorator Framework - Zero Boilerplate IPC Management
import type { IpcMainInvokeEvent } from "electron"
import { ipcMain } from "electron"
import { registry } from "./registry"

// Logger interface for IPC logging
interface IpcLogger {
  log: (...args: any[]) => void
  info: (...args: any[]) => void
  warn: (...args: any[]) => void
  error: (...args: any[]) => void
}

// Default logger uses console
let defaultLogger: IpcLogger = console

/**
 * Set the default logger for IPC services
 * Call this in your main process to use a custom logger (e.g., electron-log)
 */
export function setIpcLogger(logger: IpcLogger): void {
  defaultLogger = logger
}

// Metadata keys for storing decorator metadata
const NAMESPACE_KEY = Symbol("ipc:namespace")
const METHODS_KEY = Symbol("ipc:methods")
const EXPOSE_MODE_KEY = Symbol("ipc:expose-mode")

/**
 * Get the list of IPC method names from a service class
 * Useful for createPreloadApi when using decorated mode
 *
 * @example
 * // In service file:
 * export const BrowserViewMethods = getIpcMethodNames(BrowserViewManager)
 *
 * // In preload.ts:
 * import { BrowserViewMethods } from "./window-manager/browser-view-manager"
 * browserView: createPreloadApi("browser-view", BrowserViewMethods)
 */
export function getIpcMethodNames<T extends new (...args: any[]) => any>(
  ServiceClass: T
): string[] {
  const constructor = ServiceClass as any
  const exposeMode = constructor[EXPOSE_MODE_KEY] || "all"

  // "decorated" mode: return methods with @IpcMethod
  if (exposeMode === "decorated") {
    const methods = constructor[METHODS_KEY] as
      | Map<string, string | symbol>
      | undefined
    return methods ? Array.from(methods.keys()) : []
  }

  // "all" mode: return all public methods from prototype
  const prototype = ServiceClass.prototype
  const names: string[] = []

  for (const name of Object.getOwnPropertyNames(prototype)) {
    if (name === "constructor") continue
    if (name.startsWith("_")) continue
    if (typeof prototype[name] !== "function") continue
    names.push(name)
  }

  return names
}

export interface IpcServiceOptions {
  /**
   * Exposure mode:
   * - "all": Expose all public methods (default)
   * - "decorated": Only expose methods with @IpcMethod decorator
   */
  exposeMode?: "all" | "decorated"
}

/**
 * Class decorator to mark a service as an IPC service
 * @param namespace - The IPC channel namespace (e.g., "browser-view", "rawdata")
 * @param options - Configuration options for exposure mode
 *
 * @example
 * @IpcService("browser-view")
 * class BrowserViewManager extends IpcServiceBase {}
 *
 * @IpcService("rawdata", { exposeMode: "decorated" })
 * class RawDataService extends IpcServiceBase {}
 */
export function IpcService(
  namespace: string,
  options?: IpcServiceOptions
): ClassDecorator {
  return (target: any) => {
    target[NAMESPACE_KEY] = namespace
    target[EXPOSE_MODE_KEY] = options?.exposeMode || "all"
    return target
  }
}

/**
 * Method decorator to explicitly mark a method for IPC exposure
 * Only effective when exposeMode is "decorated"
 * @param channel - Optional custom channel name (defaults to method name)
 *
 * @example
 * @IpcMethod()
 * async findAdapters(spaceId: string, url: string) { ... }
 *
 * @IpcMethod("custom-channel")
 * async myMethod() { ... }
 */
export function IpcMethod(channel?: string): MethodDecorator {
  return (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) => {
    const methods = target.constructor[METHODS_KEY] || new Map()
    methods.set(channel || String(propertyKey), propertyKey)
    target.constructor[METHODS_KEY] = methods
    return descriptor
  }
}

/**
 * Base class for IPC services
 * Provides automatic IPC handler registration with unified error handling
 */
export abstract class IpcServiceBase {
  private _registered = false
  private _channels: string[] = []
  private _methodNames: string[] = []

  /**
   * Register all IPC handlers for this service
   * Automatically called once, idempotent
   */
  register(): void {
    if (this._registered) return

    const constructor = this.constructor as any
    const namespace = constructor[NAMESPACE_KEY] || this.getDefaultNamespace()
    const methods = this.getMethodsFromPrototype()

    // Store method names for getRegisteredMethods and registry
    this._methodNames = Array.from(methods.keys())

    // Register to global registry for preload discovery
    registry.registerService(namespace, this._methodNames)

    for (const [channel, methodName] of methods) {
      const fullChannel = `${namespace}:${channel}`
      const handler = (this as any)[methodName].bind(this)

      ipcMain.handle(
        fullChannel,
        async (event: IpcMainInvokeEvent, ...args: any[]) => {
          return handler(...args)
        }
      )

      this._channels.push(fullChannel)
      defaultLogger.info(`[IPC] Registered: ${fullChannel}`)
    }

    this._registered = true
  }

  /**
   * Unregister all IPC handlers for this service
   * Call this when the service is being destroyed
   */
  unregister(): void {
    for (const channel of this._channels) {
      ipcMain.removeHandler(channel)
    }
    this._channels = []
    this._registered = false
  }

  /**
   * Get the list of registered method names
   * Used by the registry to expose methods to preload
   */
  getRegisteredMethods(): string[] {
    return this._methodNames
  }

  /**
   * Generate namespace from class name
   * BrowserViewManager -> browser-view-manager
   */
  private getDefaultNamespace(): string {
    const className = this.constructor.name
    return className
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .replace(/^-/, "")
  }

  /**
   * Get the exposure mode from decorator metadata
   */
  private getExposeMode(): "all" | "decorated" {
    const constructor = this.constructor as any
    return constructor[EXPOSE_MODE_KEY] || "all"
  }

  /**
   * Collect methods to expose based on exposure mode
   */
  private getMethodsFromPrototype(): Map<string, string | symbol> {
    const methods = new Map<string, string | symbol>()
    const constructor = this.constructor as any
    const exposeMode = this.getExposeMode()
    const decoratedMethods = constructor[METHODS_KEY] as
      | Map<string, string | symbol>
      | undefined

    // "decorated" mode: only expose methods with @IpcMethod
    if (exposeMode === "decorated") {
      if (decoratedMethods) {
        for (const [channel, methodName] of decoratedMethods) {
          methods.set(channel, methodName)
        }
      }
      return methods
    }

    // "all" mode: expose all public methods (default)
    const prototype = Object.getPrototypeOf(this)

    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === "constructor") continue
      if (name.startsWith("_")) continue // Private methods (underscore prefix)
      if (typeof (this as any)[name] !== "function") continue
      methods.set(name, name)
    }

    return methods
  }
}

// ========== Type Definitions ==========

/**
 * Transform a service class into its Preload API type
 * All methods become async and return raw results (errors throw naturally)
 */
type PreloadApi<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => any
    ? K
    : never]: T[K] extends (...args: infer P) => infer R
    ? (...args: P) => Promise<Awaited<R>>
    : never
}

/**
 * Extract the IPC API type from a service class
 * Use this in electron-env.d.ts for type definitions
 *
 * @example
 * interface Window {
 *   eidos: {
 *     browserView: ExtractIpcApi<typeof BrowserViewManager>
 *   }
 * }
 */
export type ExtractIpcApi<T extends new (...args: any[]) => any> = PreloadApi<
  InstanceType<T>
>

/**
 * IPC response wrapper type
 * All IPC methods return this structure
 */
export type IpcResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

// ========== Preload API Generator ==========

// Cache preload API objects to avoid recreating them
const preloadApiCache = new Map<
  string,
  Record<string, (...args: any[]) => Promise<any>>
>()

/**
 * Create a preload API object for contextBridge.exposeInMainWorld
 * Returns a plain object (not Proxy) that can be cloned
 *
 * @param namespace - The IPC namespace (must match @IpcService value)
 * @param methodNames - List of method names to expose (required for plain object)
 * @returns Plain object with methods that call ipcRenderer.invoke
 *
 * @example
 * // preload.ts - must specify method names
 * browserView: createPreloadApi("browser-view", [
 *   "open", "close", "reload", "goBack", "goForward",
 *   "loadURL", "setVisible", "capturePage", "setUserAgent",
 *   "getUserAgent", "openDevTools", "closeDevTools"
 * ])
 */
export function createPreloadApi<
  T extends Record<string, (...args: any[]) => any>,
>(namespace: string, methodNames: string[]): T {
  // Check cache
  const cacheKey = `${namespace}:${methodNames.join(",")}`
  if (preloadApiCache.has(cacheKey)) {
    return preloadApiCache.get(cacheKey) as T
  }

  // Create plain object (not Proxy) for contextBridge compatibility
  const api: Record<string, (...args: any[]) => Promise<any>> = {}

  for (const methodName of methodNames) {
    api[methodName] = (...args: any[]) => {
      const channel = `${namespace}:${methodName}`
      return require("electron").ipcRenderer.invoke(channel, ...args)
    }
  }

  preloadApiCache.set(cacheKey, api)
  return api as T
}
