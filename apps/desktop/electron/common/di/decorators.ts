/**
 * DI Decorators - NestJS-style decorators for Electron IPC services
 *
 * These decorators integrate inversify with the existing @eidos.space/electron-ipc
 * framework to provide a seamless DI experience.
 */

import { inject, injectable } from "inversify"
import "reflect-metadata"
import {
  IpcService,
  IpcServiceBase,
  type IpcServiceOptions,
} from "@eidos.space/electron-ipc"

// Re-export inversify decorators
export { inject as Inject, injectable as Injectable }

// Metadata keys
const MODULE_METADATA_KEY = Symbol("module:metadata")
const IPC_SERVICE_OPTIONS_KEY = Symbol("ipc:service-options")

/**
 * Module metadata interface
 */
export interface ModuleMetadata {
  /** Module imports - other modules this module depends on */
  imports?: Array<new (...args: any[]) => any>
  /** Controllers/Services to instantiate */
  providers?: Array<new (...args: any[]) => any>
  /** Services to export for other modules */
  exports?: Array<new (...args: any[]) => any | symbol>
  /** Services that should be available globally */
  global?: boolean
}

/**
 * @Module decorator - Marks a class as a NestJS-style module
 *
 * @example
 * @Module({
 *   imports: [ConfigModule],
 *   providers: [FileSystemService],
 *   exports: [FileSystemService]
 * })
 * export class FileModule {}
 */
export function Module(metadata: ModuleMetadata): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata(MODULE_METADATA_KEY, metadata, target)

    // Mark as injectable
    injectable()(target)

    return target
  }
}

/**
 * Get module metadata
 */
export function getModuleMetadata(target: any): ModuleMetadata | undefined {
  return Reflect.getMetadata(MODULE_METADATA_KEY, target)
}

/**
 * Injectable IPC Service decorator
 * Combines @Injectable with @IpcService functionality
 *
 * @example
 * @IpcInjectable("file-system")
 * export class FileSystemService extends IpcServiceBase {
 *   constructor(@Inject(TYPES.ConfigService) private config: ConfigService) {
 *     super()
 *   }
 * }
 */
export function IpcInjectable(
  namespace: string,
  options?: IpcServiceOptions
): ClassDecorator {
  return (target: any) => {
    // Store IPC options for later use
    Reflect.defineMetadata(
      IPC_SERVICE_OPTIONS_KEY,
      { namespace, options },
      target
    )

    // Apply both decorators
    injectable()(target)
    IpcService(namespace, options)(target)

    // Ensure it extends IpcServiceBase
    const originalRegister = target.prototype.register
    target.prototype.register = function () {
      if (this._registered) return

      // Call original register which handles IPC binding
      if (originalRegister) {
        originalRegister.call(this)
      } else {
        // Fallback to base class registration
        IpcServiceBase.prototype.register.call(this)
      }
    }

    return target
  }
}

/**
 * Get IPC service namespace
 */
export function getIpcNamespace(target: any): string | undefined {
  const metadata = Reflect.getMetadata(IPC_SERVICE_OPTIONS_KEY, target)
  return metadata?.namespace
}

/**
 * Optional decorator - Marks a dependency as optional
 */
export function Optional() {
  return (
    target: any,
    propertyKey: string | symbol,
    parameterIndex: number
  ) => {
    const existingOptionalParams =
      Reflect.getMetadata("optional:param:indexes", target) || []
    existingOptionalParams.push(parameterIndex)
    Reflect.defineMetadata(
      "optional:param:indexes",
      existingOptionalParams,
      target
    )
  }
}

/**
 * Forward reference for circular dependencies
 */
export function forwardRef(fn: () => new (...args: any[]) => any): any {
  return {
    forwardRef: fn,
    unwrap: () => fn(),
  }
}

/**
 * Inject a forward reference
 */
export function InjectForwardRef(
  ref: ReturnType<typeof forwardRef>
): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    const service = ref.unwrap()
    inject(service)(target, propertyKey as string, parameterIndex)
  }
}
