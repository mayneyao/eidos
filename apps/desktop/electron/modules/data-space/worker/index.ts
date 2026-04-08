/**
 * Core DataSpace module - Node.js runtime only
 *
 * This module contains the core DataSpace implementation that runs
 * in the worker process (Node.js environment, no Electron APIs).
 *
 * For Electron main process APIs, use modules/data-space
 */

// Re-export RPC types
export type { WorkerInitData, InitMessage } from "./rpc/rpc-types"

// Re-export RPC client/server
export { RpcClient } from "./rpc/rpc-client"
export { RpcServer } from "./rpc/rpc-server"
