// Core exports
export * from './core/types'
export * from './core/message'
export * from './core/transport'
export * from './core/registry'

// Serialization exports
export * from './serialization/serializer'
export * from './serialization/non-serializable'
export * from './serialization/binary-data'

// Proxy exports
export * from './proxy/create-proxy'
export * from './proxy/iterator'
export * from './proxy/method-router'

// Middleware exports (re-export from middleware/index)
export * from './middleware'

// Re-export commonly used transports
export { WebWorkerTransport } from './transports/web-worker'
export { ElectronIPCTransport } from './transports/electron-ipc'
export { HTTPTransport } from './transports/http'
export { WebRTCTransport } from './transports/webrtc'
export { ChildProcessTransport } from './transports/child-process'

// Re-export all transport types for convenience
export type {
  IpcRenderer,
  ElectronIPCOptions,
} from './transports/electron-ipc'
export type { HTTPTransportOptions } from './transports/http'
export type { DataConnection } from './transports/webrtc'
export type { ChildProcess } from './transports/child-process'

