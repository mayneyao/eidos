export type RpcRequest = {
  id: string;
  type: 'call';
  path: string[]; // e.g. ['doc', 'list']
  args: any[];
} | {
  id: string;
  type: 'execute-payload';
  payload: {
    method: string;
    params: any[];
    space: string;
    dbName: string;
    userId: string;
  };
};

export type RpcResponse = {
  id: string;
  type: 'response';
  result?: any;
  error?: {
    message: string;
    stack?: string;
  };
};

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
    enabled: boolean
    remote: string
    credentials?: any
  }
}

import type { SpaceInfo } from "../space-registry"

export interface WorkerInitData {
  spaceInfo: SpaceInfo
  paths: PathConfig
}

export type InitMessage = WorkerInitData & {
  type: "init"
  spaceId: string
}
