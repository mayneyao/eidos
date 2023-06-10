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
    console.log('new worker')
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
        console.log('e', e)
        const { id: returnId, result } = e.data
        if (returnId === switchDdMsgId) {
          setCurrentDatabase(dbName)
        }
      }
      console.log('useSqlite', 'message reg')
    }
  }, [dbName, setCurrentDatabase, isInitialized, currentDatabase])

  useEffect(() => {
    const worker = loadWorker()
    worker.onmessage = async (e) => {
      console.log('all msg', e)
      if (e.data === 'init') {
        console.log('useSqlite', 'message init')
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
    setSQLWorker(SQLWorker);
    (window as any).SQLWorker = SQLWorker
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

  const updateTableListWithSql = async (sql: string) => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
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

  const updateTableData = async (sql: string) => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
    await SQLWorker.sql`${sql}`
    await updateTableList()
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

  const handleSql = async (sql: string) => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
    const cls = sql.trim().split(' ')[0].toUpperCase()

    let handled = false
    switch (cls) {
      case 'SELECT':
      case 'INSERT':
      case 'UPDATE':
      case 'DELETE':
      case 'ALTER':
        // add, delete, or modify columns in an existing table.
        break;
      // action above will update display of table, handle by tableState 
      // action below will update table list, handle by self
      case 'CREATE':
        if (sql.includes('TABLE')) {
          await createTableWithSql(sql)
        }
        break
      case 'DROP':
        if (sql.includes('TABLE')) {
          await updateTableListWithSql(sql)
        }
        break;
      default:
        return handled
    }
    return handled
  }

  const redo = async () => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
    SQLWorker.redo()
  }

  const undo = async () => {
    if (!SQLWorker) throw new Error('SQLWorker not initialized')
    SQLWorker.undo()
  }


  return {
    sqlite: isInitialized ? SQLWorker : null,
    createTable,
    deleteTable,
    renameTable,
    duplicateTable,
    queryAllTables,
    createTableWithSql,
    updateTableData,
    handleSql,
    undo,
    redo,
  }
}


export const useTableSchema = (tableName: string, dbName: string) => {
  const { sqlite } = useSqlite(dbName)
  const [schema, setSchema] = useState<string>()

  useEffect(() => {
    if (!sqlite) return;
    sqlite.sql`SELECT * FROM sqlite_schema where name='${tableName}'`.then((res: any) => {
      const sql = res[0][4] + ';';
      console.log(sql)
      setSchema(sql)
    })
  }, [sqlite, tableName, dbName])
  return schema
}

export const useTable = (tableName: string, databaseName: string, querySql?: string) => {
  const { sqlite } = useSqlite(databaseName)
  const [data, setData] = useState<any[]>([])
  const [schema, setSchema] = useState<ReturnType<typeof sqlToJSONSchema2>>([])
  const [tableSchema, setTableSchema] = useState<string>()

  useEffect(() => {
    worker.onmessage = (e) => {
      console.log(e)
      const { type, data } = e.data
      if (type === 'update') {
        console.log('update', data)
      }
    }
  }, [])

  const updateTableSchema = useCallback(async () => {
    if (!sqlite) return;
    await sqlite.sql`SELECT * FROM sqlite_schema where name='${tableName}'`.then((res: any) => {
      const sql = res[0][4] + ';';
      if (sql) {
        setTableSchema(sql)
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

  const refreshRows = useCallback(async () => {
    if (!sqlite) return;
    await sqlite.sql`SELECT * FROM ${tableName}`.then((res: any) => {
      setData(res)
    })
  }, [sqlite, tableName])

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
      await refreshRows()
    }
  }

  const deleteRows = async (startIndex: number, endIndex: number) => {
    if (sqlite) {
      const rowIds = data.slice(startIndex, endIndex).map(row => `'${row[0]}'`)
      // console.log('deleteRows', data, startIndex, endIndex, rowIds)
      await sqlite.sql`DELETE FROM ${tableName} WHERE _id IN (${rowIds})`
      await updateTableSchema()
      await refreshRows()
    }
  }

  useEffect(() => {
    if (sqlite && tableName) {
      if (querySql) {
        sqlite.sql`${querySql}`.then((res: any) => {
          if (checkSqlIsModifyTableSchema(querySql)) {
            console.log("checkSqlIsModifyTable", querySql)
            updateTableSchema()
          }
          if (checkSqlIsOnlyQuery(querySql)) {
            console.log("checkSqlIsOnlyQuery", querySql)
            setData(res)
          }
          if (checkSqlIsModifyTableData(querySql)) {
            console.log("checkSqlIsModifyTableData", querySql)
            refreshRows()
          }
        })
      } else {
        sqlite.sql`SELECT * FROM ${tableName}`.then((res: any) => {
          setData(res)
          updateTableSchema()
        })
      }
    }
  }, [sqlite, tableName, updateTableSchema, querySql, refreshRows])

  return { data, setData, schema, updateCell, addField, addRow, deleteRows, tableSchema }
}

const checkSqlIsModifyTableSchema = (sql: string) => {
  const modifyTableSqls = ['CREATE TABLE', 'DROP TABLE', 'ALTER TABLE', 'RENAME TABLE']
  return modifyTableSqls.some(modifyTableSql => sql.includes(modifyTableSql))
}

const checkSqlIsOnlyQuery = (sql: string) => {
  const querySqls = ['SELECT', 'PRAGMA']
  return querySqls.some(querySql => sql.includes(querySql))
}

const checkSqlIsModifyTableData = (sql: string) => {
  const modifyTableSqls = ['INSERT', 'UPDATE', 'DELETE']
  return modifyTableSqls.some(modifyTableSql => sql.includes(modifyTableSql))
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