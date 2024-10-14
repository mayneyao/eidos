import { MsgType } from "../const"

export type IQuery = {
  type: MsgType.CallFunction
  data: {
    method: string
    params: [string, string[]]
    dbName: string
    userId: string
  }
  id: string
}

export type IQueryResp = {
  id: string
  data: {
    result: any
  }
  type: MsgType.QueryResp
}

export type ITreeItem = {
  id: string
  name: string
  type: "table" | "doc"
}

export interface ISqlite<T, D> {
  connector: T
  send: (data: D) => void | Promise<any>
  onCallBack: (thisCallId: string) => Promise<any>
}


export abstract class BaseServerDatabase {
  filename?: string
  abstract prepare(sql: string): any;
  abstract close(): void;
  abstract selectObjects(sql: string, bind?: any[]): Promise<{ [columnName: string]: any }[]>;
  abstract transaction(func: (db: BaseServerDatabase) => void): any;
  abstract exec(opts: any): Promise<any>;
  abstract createFunction(opt: {
    name: string;
    xFunc: (...args: any[]) => any;
  }): any;
}
