export type RpcRequest =
  | {
      id: string
      type: "call"
      path: string[] // e.g. ['doc', 'list']
      args: any[]
    }
  | {
      id: string
      type: "execute-payload"
      payload: {
        method: string
        params: any[]
        space: string
        dbName: string
        userId: string
      }
    }

export type RpcResponse = {
  id: string
  type: "response"
  result?: any
  error?: {
    message: string
    stack?: string
  }
}

export interface PathConfig {
  spacePath: string
  simplePathConfig: {
    libPath: string
    dictPath: string
  }
  vecPathConfig: {
    libPath: string
  }
  graftPathConfig: {
    libPath: string
    cliPath: string
    enabled: boolean
    syncEnabled?: boolean
    remote: string
    /** Ephemeral only; never persisted or logged. */
    remoteToken?: string
    requireRemoteClone?: boolean
    useVfs?: boolean
  }
}

import type { SpaceInfo } from "@eidos.space/space-manager"

export interface WorkerInitData {
  spaceInfo: SpaceInfo
  paths: PathConfig
}

export type InitMessage = WorkerInitData & {
  type: "init"
  spaceId: string
}
