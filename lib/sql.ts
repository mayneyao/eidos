'use client'

import { createTemplateTableSql } from '@/components/grid/helper';
import type { SqlDatabase } from '@/worker/sql';
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { sqlToJSONSchema2 } from './sqlite/sql2jsonschema';
import { useSqliteStore } from './store';

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


  const queryAllTables = async () => {
    const res = await SQLWorker.sql`SELECT name FROM sqlite_schema WHERE type='table'`
    const allTables = res.map((item: any) => item[0])
    return allTables
  }

  const updateTableList = async () => {
    queryAllTables().then(tables => { setAllTables(tables) })
  }

  const createTable = async (tableName: string) => {
    const sql = createTemplateTableSql(tableName)
    await SQLWorker.sql`${sql}`
    await updateTableList()
  }

  const deleteTable = async (tableName: string) => {
    await SQLWorker.sql`DROP TABLE ${tableName}`
    await updateTableList()
  }

  const renameTable = async (oldTableName: string, newTableName: string) => {
    await SQLWorker.sql`ALTER TABLE ${oldTableName} RENAME TO ${newTableName}`
    await updateTableList()
  }

  const duplicateTable = async (oldTableName: string, newTableName: string) => {
    await SQLWorker.sql`CREATE TABLE ${newTableName} AS SELECT * FROM ${oldTableName}`
    await updateTableList()
  }

  useEffect(() => {
    worker.onmessage = async (e) => {
      if (e.data === 'init') {
        setInitialized(true)
      }
    }
  }, [setAllTables, setInitialized, setSqlite])

  return {
    sqlite: isInitialized ? SQLWorker : null,
    createTable,
    deleteTable,
    renameTable,
    duplicateTable,
    queryAllTables,
  }
}


export const useTableSchema = (tableName: string) => {
  const { sqlite } = useSqlite()
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
  const { sqlite } = useSqlite()
  const [data, setData] = useState<any[]>([])
  const [schema, setSchema] = useState<ReturnType<typeof sqlToJSONSchema2>>([])


  const updateCell = async (col: number, row: number, value: any) => {
    const filedName = schema[0]?.columns?.[col].name;
    const rowId = data[row][0];
    if (sqlite) {
      await sqlite.sql`UPDATE ${tableName} SET ${filedName} = '${value}' WHERE id = ${rowId}`;
      // get new data
      const result2 = await sqlite.sql`SELECT ${filedName} FROM ${tableName} where id = ${rowId}`;
      data[row][col] = result2[0]
      setData([...data])
    }
  }
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
  return { data, setData, schema, updateCell }
}