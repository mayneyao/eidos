import { DataSpace } from "../DataSpace"

type IRegisterTrigger = {
  update: string
  insert: string
  delete: string
}

export class DataChangeTrigger {
  // space::table =>
  triggerMap: Map<string, IRegisterTrigger>
  constructor() {
    this.triggerMap = new Map()
  }

  private getRowJSONObj(collist: any[], type: "new" | "old") {
    let json_object = "json_object("
    for (const col of collist) {
      const name = col.name
      json_object += `'${name}', ${type}.${name}, `
    }
    json_object += `'rowid', ${type}.rowid)`
    return json_object
  }

  async registerTrigger(
    space: string,
    tableName: string,
    trigger: IRegisterTrigger
  ) {
    const key = `${space}::${tableName}`
    this.triggerMap.set(key, trigger)
  }

  async unRegisterTrigger(space: string, tableName: string) {
    const key = `${space}::${tableName}`
    this.triggerMap.delete(key)
  }

  isTriggerChanged(
    space: string,
    tableName: string,
    trigger: IRegisterTrigger
  ) {
    const key = `${space}::${tableName}`
    const oldTrigger = this.triggerMap.get(key)
    if (!oldTrigger) {
      return true
    }
    return (
      oldTrigger.update !== trigger.update ||
      oldTrigger.insert !== trigger.insert ||
      oldTrigger.delete !== trigger.delete
    )
  }

  async setTrigger(
    dataspace: DataSpace,
    tableName: string,
    collist: any[],
    toDeleteColumns?: string[]
  ) {
    console.log("setTrigger", tableName)
    const _collist = collist.filter((col) => {
      if (toDeleteColumns) {
        return !toDeleteColumns.includes(col.name)
      }
      return true
    })
    // console.log("create trigger for table", db.dbName, tableName)
    const new_json_object = this.getRowJSONObj(_collist, "new")
    const old_json_object = this.getRowJSONObj(_collist, "old")

    // UPDATE ${tableName} SET _last_edited_time = CURRENT_TIMESTAMP WHERE _id = NEW._id;
    const updateSql = `CREATE TEMP TRIGGER data_update_trigger_${tableName}
    AFTER UPDATE ON ${tableName}
    FOR EACH ROW
    BEGIN
        SELECT eidos_data_event_update('${tableName}', ${new_json_object}, ${old_json_object});
    END;`

    const insertSql = `CREATE TEMP TRIGGER data_insert_trigger_${tableName}
    AFTER INSERT ON ${tableName}
    FOR EACH ROW
    BEGIN
        SELECT eidos_data_event_insert('${tableName}', ${new_json_object});
    END;`

    const deleteSql = `CREATE TEMP TRIGGER data_delete_trigger_${tableName}
    AFTER DELETE ON ${tableName}
    FOR EACH ROW
    BEGIN
        SELECT eidos_data_event_delete('${tableName}', ${old_json_object});
    END;`

    // if trigger not changed, do nothing
    if (
      !this.isTriggerChanged(dataspace.dbName, tableName, {
        update: updateSql,
        insert: insertSql,
        delete: deleteSql,
      })
    ) {
      return
    }

    // drop trigger if exists
    dataspace.db.transaction((db) => {
      db.exec(`DROP TRIGGER IF EXISTS data_update_trigger_${tableName}`)
      db.exec(`DROP TRIGGER IF EXISTS data_insert_trigger_${tableName}`)
      db.exec(`DROP TRIGGER IF EXISTS data_delete_trigger_${tableName}`)
      db.exec(updateSql)
      db.exec(insertSql)
      db.exec(deleteSql)
    })

    this.registerTrigger(dataspace.dbName, tableName, {
      update: updateSql,
      insert: insertSql,
      delete: deleteSql,
    })
  }
}
