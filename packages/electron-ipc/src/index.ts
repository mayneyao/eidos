// IPC Decorator Framework - Zero Boilerplate IPC Management for Electron

export {
  IpcService,
  IpcMethod,
  IpcServiceBase,
  createPreloadApi,
  getIpcMethodNames,
  setIpcLogger,
} from "./decorators"

export type {
  ExtractIpcApi,
  IpcServiceOptions,
  IpcResponse,
} from "./decorators"

export {
  registry,
  createPreloadApiByNamespace,
  setupRegistryIpc,
} from "./registry"
