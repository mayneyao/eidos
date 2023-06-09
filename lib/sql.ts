'use client'

import { createTemplateTableSql } from '@/components/grid/helper';
import type { SqlDatabase } from '@/worker/sql';
import { useCallback, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { sqlToJSONSchema2 } from './sqlite/sql2jsonschema';
import { useSqliteStore } from './store';
import { getSQLiteFilesInRootDirectory } from './fs';


let worker: Worker;


const loadWorker = () => {
  if (!worker) {
    worker = new Worker(new URL('@/worker/sql.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export const useSqlite = (dbName?: string) => {
  const { isInitialized, setInitialized, setAllTables, setCurrentDatabase, currentDatabase } = useSqliteStore();

  const [SQLWorker, setSQLWorker] = useState<SqlDatabase>()

  useEffect(() => {
    if (dbName && isInitialized) {
      if (currentDatabase === dbName) return;
      const switchDdMsgId = uuidv4()
      const worker = loadWorker()
      worker.postMessage({ method: 'switchDatabase', params: [dbName], id: switchDdMsgId })
      worker.onmessage = (e) => {
        const { id: returnId, result } = e.data
        if (returnId === switchDdMsgId) {
          setCurrentDatabase(dbName)
        }
      }
    }
  }, [dbName, setCurrentDatabase, isInitialized, currentDatabase])

  useEffect(() => {
    const worker = loadWorker()
    worker.onmessage = async (e) => {
      if (e.data === 'init') {
        setInitialized(true)
      }
    }
    const SQLWorker = new Proxy<SqlDatabase>({} as any, {
      get(target, method) {
        return function (params: any) {
          const thisCallId = uuidv4();
          const [_params, ...rest] = arguments
          worker.postMessage({ method, params: [_params, ...rest], id: thisCallId, dbName })
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
    setSQLWorker(SQLWorker)
  }, [dbName, setInitialized])

  const queryAllTables = useCallback(async () => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
    const res = await SQLWorker.sql`SELECT name FROM sqlite_schema WHERE type='table'`
    const allTables = res.map((item: any) => item[0])
    return allTables
  }, [SQLWorker])

  const updateTableList = async () => {
    await queryAllTables().then(tables => { setAllTables(tables) })
  }

  const createTable = async (tableName: string) => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
    const sql = createTemplateTableSql(tableName)
    await SQLWorker.sql`${sql}`
    await updateTableList()
  }

  const createTableWithSql = async (createTableSql: string, insertSql?: string) => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
    await SQLWorker.sql`${createTableSql}`
    await updateTableList()
    if (insertSql) {
      await SQLWorker.sql`${insertSql}`
    }
  }

  const deleteTable = async (tableName: string) => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
    await SQLWorker.sql`DROP TABLE ${tableName}`
    await updateTableList()
  }

  const renameTable = async (oldTableName: string, newTableName: string) => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
    await SQLWorker.sql`ALTER TABLE ${oldTableName} RENAME TO ${newTableName}`
    await updateTableList()
  }

  const duplicateTable = async (oldTableName: string, newTableName: string) => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
    await SQLWorker.sql`CREATE TABLE ${newTableName} AS SELECT * FROM ${oldTableName}`
    await updateTableList()
  }



  return {
    sqlite: isInitialized ? SQLWorker : null,
    createTable,
    deleteTable,
    renameTable,
    duplicateTable,
    queryAllTables,
    createTableWithSql,
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

export const useTable = (tableName: string, databaseName: string) => {
  const { sqlite } = useSqlite(databaseName)
  const [data, setData] = useState<any[]>([])
  const [schema, setSchema] = useState<ReturnType<typeof sqlToJSONSchema2>>([])


  const updateTableSchema = useCallback(async () => {
    if (!sqlite) return;
    await sqlite.sql`SELECT * FROM sqlite_schema where name='${tableName}'`.then((res: any) => {
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
  }, [sqlite, tableName])

  const updateCell = async (col: number, row: number, value: any) => {
    const filedName = schema[0]?.columns?.[col].name;
    const rowId = data[row][0];
    if (sqlite) {
      if (filedName !== '_id') {
        sqlite.sql`UPDATE ${tableName} SET ${filedName} = '${value}' WHERE _id = '${rowId}'`;
      }
      // get the updated value, but it will block ui update. expect to success if not throw error
      // const result2 = await sqlite.sql`SELECT ${filedName} FROM ${tableName} where _id = '${rowId}'`;
      // data[row][col] = result2[0]
      data[row][col] = value
      setData([...data])
    }
  }

  const fetchAllRows = async () => {
    if (!sqlite) return;
    await sqlite.sql`SELECT * FROM ${tableName}`.then((res: any) => {
      setData(res)
    })
  }
  const addField = async (fieldName: string, fieldType: string) => {
    const typeMap: any = {
      text: 'VARCHAR(128)',
    }
    if (sqlite) {
      await sqlite.sql`ALTER TABLE ${tableName} ADD COLUMN ${fieldName} ${typeMap[fieldType] ?? 'VARCHAR(128)'};`
      await updateTableSchema()
    }
  }

  const addRow = async (params?: any[]) => {
    if (sqlite) {
      const uuid = uuidv4()
      await sqlite.sql`INSERT INTO ${tableName}(_id) VALUES ('${uuid}')`
      await updateTableSchema()
      await fetchAllRows()
    }
  }

  const deleteRows = async (startIndex: number, endIndex: number) => {
    if (sqlite) {
      const rowIds = data.slice(startIndex, endIndex).map(row => `'${row[0]}'`)
      // console.log('deleteRows', data, startIndex, endIndex, rowIds)
      await sqlite.sql`DELETE FROM ${tableName} WHERE _id IN (${rowIds})`
      await updateTableSchema()
      await fetchAllRows()
    }
  }

  useEffect(() => {
    if (sqlite && tableName) {
      sqlite.sql`SELECT * FROM ${tableName}`.then((res: any) => {
        setData(res)
        updateTableSchema()
      })
    }
  }, [sqlite, tableName, updateTableSchema])

  return { data, setData, schema, updateCell, addField, addRow, deleteRows }
}


export const useAllDatabases = () => {
  const { setDatabaseList, databaseList } = useSqliteStore()

  useEffect(() => {
    getSQLiteFilesInRootDirectory().then(files => {
      setDatabaseList(files.map(file => file.name.split('.')[0]))
    })
  }, [setDatabaseList])

  return databaseList;
}