/**
 * Module Scanner - Scans and registers modules, providers, and IPC services
 *
 * This is the core bootstrapping logic that processes @Module decorators
 * and wires up the dependency injection container.
 */

import type { Container } from "inversify"
import { ipcMain } from "electron"
import electronLog from "electron-log"
import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { getModuleMetadata, getIpcNamespace } from "./decorators"

// Track registered modules to avoid duplicate registration
const registeredModules = new Set<any>()
const registeredServices = new Set<any>()

/**
 * Module scan result
 */
export interface ScanResult {
  modules: any[]
  providers: any[]
  ipcServices: Array<{ service: any; namespace: string }>
}

/**
 * Scan a module and its dependencies
 */
export function scanModule(
  moduleClass: any,
  result: ScanResult = {
    modules: [],
    providers: [],
    ipcServices: [],
  }
): ScanResult {
  // Skip already registered modules
  if (registeredModules.has(moduleClass)) {
    return result
  }

  const metadata = getModuleMetadata(moduleClass)
  if (!metadata) {
    electronLog.warn(`[DI] Class ${moduleClass.name} is not a module`)
    return result
  }

  electronLog.info(`[DI] Scanning module: ${moduleClass.name}`)
  registeredModules.add(moduleClass)
  result.modules.push(moduleClass)

  // Process imports first (dependencies)
  if (metadata.imports) {
    for (const importedModule of metadata.imports) {
      scanModule(importedModule, result)
    }
  }

  // Process providers
  if (metadata.providers) {
    for (const provider of metadata.providers) {
      if (registeredServices.has(provider)) continue
      registeredServices.add(provider)
      result.providers.push(provider)

      // Check if it's an IPC service
      const namespace = getIpcNamespace(provider)
      if (namespace) {
        result.ipcServices.push({ service: provider, namespace })
      }
    }
  }

  return result
}

/**
 * Register all services in the container
 */
export function registerServices(
  container: Container,
  services: any[],
  options?: {
    bindToSelf?: boolean
  }
): void {
  for (const service of services) {
    // Skip if already registered
    if (container.isBound(service)) {
      electronLog.info(
        `[DI] Service ${service.name} already registered, skipping`
      )
      continue
    }

    electronLog.info(`[DI] Registering service: ${service.name}`)

    // If it's an IPC service, bind with activation callback for auto-registration
    if (service.prototype instanceof IpcServiceBase) {
      container
        .bind(service)
        .toSelf()
        .onActivation((context, instance) => {
          // Auto-register IPC handlers when service is instantiated
          const isRegistered = (instance as any)._registered === true
          if (instance instanceof IpcServiceBase && !isRegistered) {
            electronLog.info(
              `[DI] Auto-registering IPC handlers for: ${service.name}`
            )
            instance.register()
          }
          return instance
        })
    } else {
      // Regular service - bind to itself for @Inject(ServiceClass) pattern
      container.bind(service).toSelf()
    }
  }
}

/**
 * Bootstrap a module and all its dependencies
 * Returns the scan result for further processing
 */
export function bootstrapModule(
  container: Container,
  rootModule: any
): ScanResult {
  electronLog.info(`[DI] Bootstrapping root module: ${rootModule.name}`)

  const scanResult = scanModule(rootModule)

  electronLog.info(
    `[DI] Found ${scanResult.modules.length} modules, ${scanResult.providers.length} providers`
  )

  // First pass: bind all providers to the container
  registerServices(container, scanResult.providers)

  // Bind the root module itself
  if (!container.isBound(rootModule)) {
    container.bind(rootModule).toSelf()
  }

  electronLog.info(`[DI] Bootstrap complete`)

  return scanResult
}

/**
 * Get all IPC services from scan result
 */
export function getIpcServices(
  scanResult: ScanResult
): Array<{ service: any; namespace: string }> {
  return scanResult.ipcServices
}

/**
 * Instantiate all IPC services to trigger auto-registration via onActivation
 */
export function instantiateIpcServices(
  container: Container,
  scanResult: ScanResult
): void {
  electronLog.info(`[DI] Instantiating IPC services...`)

  for (const { service, namespace } of scanResult.ipcServices) {
    try {
      // Instantiation triggers onActivation which registers IPC handlers
      const instance = container.get<IpcServiceBase>(service)
      electronLog.info(`[DI] IPC service ready: ${namespace}`)
    } catch (error) {
      electronLog.error(
        `[DI] Failed to instantiate IPC service ${service.name}:`,
        error
      )
    }
  }
}

/**
 * Clear all registrations (useful for testing)
 */
export function clearRegistrations(): void {
  registeredModules.clear()
  registeredServices.clear()
}
