import type { SqlDatabase } from '@/worker/sql';
import { useEffect, useState } from 'react';
import { useSqliteStore } from './store';

const worker = new Worker(new URL('../worker/sql.ts', import.meta.url), { type: 'module' })

let id = 0;

const SQLWorker = new Proxy<SqlDatabase>({} as any, {
  get(target, method) {
    const thisCallId = ++id;
    return function (params: any) {
      const [_params, ...rest] = arguments
      worker.postMessage({ method, params: [_params, ...rest], id: thisCallId })
      return new Promise((resolve, reject) => {
        worker.onmessage = (e) => {
          const { id: returnId, result } = e.data
          if (returnId === thisCallId) {
            resolve(result)
          }
        }
      })
    }
  }
})

export const useSqlite = () => {
  const { isInitialized, setInitialized, setSqlite, sqlite, setAllTables } = useSqliteStore();
  useEffect(() => {
    worker.onmessage = async (e) => {
      if (e.data === 'init') {
        setInitialized(true)
        setSqlite(SQLWorker)
      }
    }
  }, [setAllTables, setInitialized, setSqlite])

  if (!isInitialized) {
    return null
  }
  return sqlite
}


export const useAllTables = () => {
  const sqlite = useSqlite()
  const { setAllTables, allTables } = useSqliteStore()

  useEffect(() => {
    if (sqlite) {
      sqlite.sql`SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name`.then((res: any) => {
        setAllTables(res.map((item: any) => item[0]))
      })
    }
  }, [setAllTables, sqlite])

  return allTables
}

export const useTable = (tableName: string) => {
  const sqlite = useSqlite()
  const [data, setData] = useState<any[]>([])
  useEffect(() => {
    if (sqlite) {
      sqlite.sql`SELECT * FROM ${tableName}`.then((res: any) => {
        setData(res)
      })
    }
  }, [sqlite, tableName])
  return data
}