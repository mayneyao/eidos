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

export type InitMessage = {
  type: 'init';
  spaceId: string;
  spaceInfo: any;
  paths: {
    spacePath: string;
    simplePathConfig: any;
    vecPathConfig: any;
    graftPathConfig: any;
  };
};
