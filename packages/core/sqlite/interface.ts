import type { MsgType } from "@/lib/const"

export interface AggregateItem {
  column: string;
  function: "sum" | "avg" | "count" | "min" | "max" | "count_distinct";
  alias?: string;
}

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
  /**
   * Handle iterator/streaming functions that return AsyncIterable
   * Returns an AsyncIterable that yields values from the remote iterator
   */
  onIterator?: <TValue = any>(thisCallId: string) => AsyncIterable<TValue>
}


export abstract class BaseServerDatabase {
  filename?: string

  get isWalMode() {
    return true
  }

  pages(): Promise<{ [key: string]: any; }> {
    return Promise.resolve({})
  }

  status(): Promise<{ [key: string]: any; }> {
    return Promise.resolve({})
  }

  pull(): Promise<{ [key: string]: any; }> {
    return Promise.resolve({})
  }

  push(): Promise<{ [key: string]: any; }> {
    return Promise.resolve({})
  }

  reset(): Promise<{ [key: string]: any; }> {
    return Promise.resolve({})
  }


  abstract prepare(sql: string): {
    run: (bind?: any[]) => void;
    all: (bind?: any[]) => Promise<any[]>;
  };
  abstract close(): void;
  abstract selectObjects(sql: string, bind?: any[]): Promise<{ [columnName: string]: any }[]>;
  abstract transaction(func: (db: BaseServerDatabase) => void): any;
  abstract exec(opts: string | {
    sql: string;
    bind?: any[];
    rowMode?: "array" | "object";
    returnValue?: "resultRows" | "saveSql";
  }): Promise<any>;
  abstract createFunction(opt: {
    name: string;
    xFunc: (...args: any[]) => any;
  }): any;
}
