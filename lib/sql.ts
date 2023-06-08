'use client'

import type { SqlDatabase } from '@/worker/sql';
import { useEffect, useState } from 'react';
import { sqlToJSONSchema2 } from './sqlite/sql2jsonschema';
import { useSqliteStore } from './store';
import { v4 as uuidv4 } from 'uuid';

const worker = new Worker(new URL('@/worker/sql.ts', import.meta.url), { type: 'module' })

const SQLWorker = new Proxy<SqlDatabase>({} as any, {
  get(target, method) {
    return function (params: any) {
      const thisCallId = uuidv4();
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
  const { isInitialized, setInitialized, setSqlite, setAllTables } = useSqliteStore();
  useEffect(() => {
    worker.onmessage = async (e) => {
      if (e.data === 'init') {
        setInitialized(true)
      }
    }
  }, [setAllTables, setInitialized, setSqlite])

  if (!isInitialized) {
    return null
  }
  return SQLWorker
}


export const useAllTables = () => {
  const sqlite = useSqlite()
  const { setAllTables, allTables } = useSqliteStore()

  useEffect(() => {
    if (sqlite) {
      setTimeout(() => {
        // FIXME: it's wired that the first time we get the tables, it's empty, settimeout is a workaround
        sqlite.sql`SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name`.then((res: any) => {
          setAllTables(res.map((item: any) => item[0]))
        })
      }, 500);
    }
  }, [setAllTables, sqlite])

  return allTables
}

export const useTableSchema = (tableName: string) => {
  const sqlite = useSqlite()
  const [schema, setSchema] = useState<any[]>([])
  useEffect(() => {
    if (!sqlite) return;
    sqlite.sql`SELECT * FROM sqlite_schema where name='${tableName}'`.then((res: any) => {
      const sql = res[0][4] + ';';
      console.log(sql)
      if (sql) {
        try {
          const compactJsonTablesArray = sqlToJSONSchema2(sql)
          console.log(compactJsonTablesArray)
          setSchema(compactJsonTablesArray)
        } catch (error) {
          console.error('error', error)
        }
      }
    })
  }, [sqlite, tableName])
  return schema
}

export const useTable = (tableName: string) => {
  const sqlite = useSqlite()
  const [data, setData] = useState<any[]>([])
  const [schema, setSchema] = useState<ReturnType<typeof sqlToJSONSchema2>>([])

  useEffect(() => {
    if (sqlite && tableName) {
      sqlite.sql`SELECT * FROM ${tableName}`.then((res: any) => {
        setData(res)
        sqlite.sql`SELECT * FROM sqlite_schema where name='${tableName}'`.then((res: any) => {
          const sql = res[0][4] + ';';
          if (sql) {
            try {
              const compactJsonTablesArray = sqlToJSONSchema2(sql)
              setSchema(compactJsonTablesArray)
            } catch (error) {
              console.error('error', error)
            }
          }
        })
      })
    }
  }, [sqlite, tableName])
  return { data, setData, schema }
}