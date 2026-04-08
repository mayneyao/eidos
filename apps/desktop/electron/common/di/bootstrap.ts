/**
 * Bootstrap - Application entry point for DI-based initialization
 */

import electronLog from "electron-log"
import { setIpcLogger, setupRegistryIpc } from "@eidos.space/electron-ipc"

import { container } from "./container"
import {
  bootstrapModule,
  clearRegistrations,
  instantiateIpcServices,
} from "./module-scanner"

// Configure IPC logger to use electron-log
setIpcLogger(electronLog)

export interface BootstrapOptions {
  /** Whether to auto-register IPC handlers */
  autoRegisterIpc?: boolean
  /** Whether to setup the registry IPC for preload discovery */
  setupRegistry?: boolean
  /** Callback before container initialization */
  beforeInit?: () => void | Promise<void>
  /** Callback after container initialization */
  afterInit?: () => void | Promise<void>
}

/**
 * Bootstrap the application with the root module
 *
 * @example
 * ```typescript
 * import 'reflect-metadata'
 * import { bootstrap } from './common/di'
 * import { AppModule } from './app.module'
 *
 * async function main() {
 *   await bootstrap(AppModule)
 *   // Application is ready
 * }
 * ```
 */
export async function bootstrap(
  rootModule: any,
  options: BootstrapOptions = {}
): Promise<void> {
  const {
    autoRegisterIpc = true,
    setupRegistry = true,
    beforeInit,
    afterInit,
  } = options

  electronLog.info("[Bootstrap] Starting application...")

  // Clear previous registrations (for hot reload scenarios)
  clearRegistrations()

  // Pre-initialization hook
  if (beforeInit) {
    await beforeInit()
  }

  // Setup registry IPC for preload discovery
  if (setupRegistry) {
    electronLog.info("[Bootstrap] Setting up registry IPC...")
    setupRegistryIpc()
  }

  // Bootstrap the DI container with all modules
  electronLog.info("[Bootstrap] Initializing DI container...")
  const scanResult = bootstrapModule(container, rootModule)

  // Instantiate IPC services (triggers auto-registration via onActivation)
  if (autoRegisterIpc) {
    instantiateIpcServices(container, scanResult)
  }

  // Instantiate the root module (triggers all eager singletons)
  electronLog.info("[Bootstrap] Instantiating root module...")
  container.get(rootModule)

  // Post-initialization hook
  if (afterInit) {
    await afterInit()
  }

  electronLog.info("[Bootstrap] Application ready!")
}

/**
 * Get the DI container instance
 */
export function getContainer() {
  return container
}
