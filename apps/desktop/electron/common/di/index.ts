/**
 * DI System - NestJS-style dependency injection for Electron
 *
 * Usage:
 * ```typescript
 * // main.ts
 * import 'reflect-metadata'
 * import { bootstrap } from './common/di'
 * import { AppModule } from './app.module'
 *
 * bootstrap(AppModule)
 * ```
 */

// Export container and types
export { container, TYPES, getService, isServiceRegistered } from "./container"

// Export decorators
export {
  Inject,
  Injectable,
  Module,
  IpcInjectable,
  Optional,
  forwardRef,
  InjectForwardRef,
  getModuleMetadata,
  getIpcNamespace,
  type ModuleMetadata,
} from "./decorators"

// Export module scanner and bootstrap
export {
  scanModule,
  registerServices,
  bootstrapModule,
  instantiateIpcServices,
  getIpcServices,
  clearRegistrations,
  type ScanResult,
} from "./module-scanner"

// Export bootstrap function
export { bootstrap } from "./bootstrap"
