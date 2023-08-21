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
  private getRowJSONObj(collist: string[], type: "new" | "old") {
    let json_object = "json_object("
    for (const col of collist) {
      const name = col[1]
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

  async createTrigger(db: DataSpace, tableName: string) {
    // console.log("create trigger for table", db.dbName, tableName)
    const collist = await db.sql`pragma table_info(${Symbol(tableName)})`
    const new_json_object = this.getRowJSONObj(collist, "new")
    const old_json_object = this.getRowJSONObj(collist, "old")

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
      !this.isTriggerChanged(db.dbName, tableName, {
        update: updateSql,
        insert: insertSql,
        delete: deleteSql,
      })
    ) {
      return
    }

    // drop trigger if exists
    db.exec(`DROP TRIGGER IF EXISTS data_update_trigger_${tableName}`)
    db.exec(`DROP TRIGGER IF EXISTS data_insert_trigger_${tableName}`)
    db.exec(`DROP TRIGGER IF EXISTS data_delete_trigger_${tableName}`)
    db.exec(updateSql)
    db.exec(insertSql)
    db.exec(deleteSql)

    this.registerTrigger(db.dbName, tableName, {
      update: updateSql,
      insert: insertSql,
      delete: deleteSql,
    })
  }
}
