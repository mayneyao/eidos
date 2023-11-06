import { opfsManager } from "@/lib/opfs"

import { DataSpace } from "./DataSpace"

type ITable = {
  type: string
  name: string
  tbl_name: string
  rootpage: number
  sql: string
}

type IColumn = {
  cid: number
  name: string
  type: string
  notnull: number
  dflt_value: string | null | number
  pk: number
}

/**
 * auto migrate db schema when db schema changed
 */
export class DbMigrator {
  constructor(
    private db: DataSpace,
    private draftDb: DataSpace,
    private allowDeletions = false
  ) {}

  private compareTables() {
    const tables: ITable[] = this.db.syncExec2(
      `select * from sqlite_schema where type='table' AND name  like 'eidos__%';`
    )
    const draftTables: ITable[] = this.draftDb.syncExec2(
      `select * from sqlite_schema where type='table' AND name  like 'eidos__%';`
    )

    const newTables = draftTables.filter((draftTable) => {
      const table = tables.find((table) => table.name === draftTable.name)
      return !table
    })
    const removedTables = tables.filter((table) => {
      const draftTable = draftTables.find(
        (draftTable) => draftTable.name === table.name
      )
      return !draftTable
    })
    return {
      tables,
      newTables,
      removedTables,
    }
  }

  private compareColumns(tableName: string) {
    const columns: IColumn[] = this.db.syncExec2(
      `PRAGMA table_info(${tableName});`
    )
    const draftColumns: IColumn[] = this.draftDb.syncExec2(
      `PRAGMA table_info(${tableName});`
    )
    // console.log(tableName, columns, draftColumns)
    const newColumns = draftColumns.filter((draftColumn) => {
      const column = columns.find((column) => column.name === draftColumn.name)
      return !column
    })
    const removedColumns = columns.filter((column) => {
      const draftColumn = draftColumns.find(
        (draftColumn) => draftColumn.name === column.name
      )
      return !draftColumn
    })

    return {
      newColumns,
      removedColumns,
    }
  }

  private migrateTables() {
    // compare tables
    const { newTables, removedTables } = this.compareTables()
    // console.log("newTables", newTables)
    // console.log("removedTables", removedTables)
    // for (const table of newTables) {
    //   this.db.syncExec2(table.sql)
    // }
    return { newTables, removedTables }
  }
  private migrateTable(tableName: string) {
    const { newColumns, removedColumns } = this.compareColumns(tableName)
    // console.log("newColumns", newColumns)
    // console.log("removedColumns", removedColumns)
    newColumns.length && console.log(`migrateTable ${tableName} start`)
    for (const newColumn of newColumns) {
      const { name, type, notnull, dflt_value } = newColumn
      let sql = `ALTER TABLE ${tableName} ADD COLUMN ${name} ${type} `
      if (notnull) {
        sql += "NOT NULL "
      }
      if (dflt_value != null) {
        sql += `DEFAULT ${dflt_value} `
      }
      this.db.syncExec2(sql)
      console.log(`migrateTable ${tableName} add column ${name}`)
    }
    newColumns.length && console.log(`migrateTable ${tableName} done`)
  }

  public migrate() {
    if (this.db.hasMigrated) {
      console.log("db has migrated")
      return
    }
    const { removedTables } = this.migrateTables()
    const tables: ITable[] = this.db.syncExec2(
      `select * from sqlite_schema where type='table' AND name  like 'eidos__%';`
    )
    for (const table of tables) {
      const isRemovedTable = removedTables.find(
        (removedTable) => removedTable.name === table.name
      )
      if (!isRemovedTable) {
        this.migrateTable(table.name)
      }
    }

    // delete draft db
    this.draftDb.db.close()
    opfsManager
      .deleteEntry(["spaces", this.draftDb.dbName, `db.sqlite3.draft.db`])
      .then(() => {
        console.log("delete draft db")
      })
  }
}
