import { logger } from "@/lib/env"
import type {
  GraftConflictResolveTarget,
  GraftConflictResolution,
  GraftResetMode,
} from "../sqlite/interface"

import { timeit } from "../helper"
import { buildSql, isReadOnlySql } from "../sqlite/helper"
import { BaseDataSpace } from "./base"

// Extension class to add database-related methods
export class DataSpaceWithDatabase extends BaseDataSpace {
  // Database status and control methods
  public status() {
    return this.db.status()
  }
  public pull() {
    return this.db.pull()
  }

  public push() {
    return this.db.push()
  }

  public fetch() {
    return this.db.fetch()
  }

  public hydrate() {
    return this.db.hydrate()
  }

  public snapshot() {
    return this.db.snapshot()
  }

  public commit(message?: string) {
    return this.db.commit(message)
  }

  public completeMerge(message?: string) {
    return this.db.completeMerge(message)
  }

  public abortMerge() {
    return this.db.abortMerge()
  }

  public conflicts() {
    return this.db.conflicts()
  }

  public resolveConflict(
    resolution: GraftConflictResolution,
    path?: string,
    target?: GraftConflictResolveTarget
  ) {
    return this.db.resolveConflict(resolution, path, target)
  }

  public tags() {
    return this.db.tags()
  }
  public branches() {
    return this.db.branches()
  }
  public volumes() {
    return this.db.volumes()
  }

  public clone(remoteUri?: string) {
    return this.db.clone(remoteUri)
  }

  public convertToGraft(remote: string) {
    return this.db.convertToGraft(remote)
  }

  public enableLocalVersioning() {
    return this.db.enableLocalVersioning()
  }

  public reconfigureRemote(credentials: any, remote: string) {
    return this.db.reconfigureRemote(credentials, remote)
  }

  public exportToSqlite(outputPath?: string) {
    return this.db.exportToSqlite(outputPath)
  }

  public info() {
    return this.db.info()
  }

  public audit() {
    return this.db.audit()
  }

  public log() {
    return this.db.log()
  }

  public show(rev: string | number) {
    return this.db.show(rev)
  }

  public diff(
    from: string | number,
    to?: string | number,
    mode: "summary" | "rows" = "summary"
  ) {
    return this.db.diff(from, to, mode)
  }

  public checkoutLsn(rev: string | number) {
    return this.db.checkoutLsn(rev)
  }

  public resetTo(rev: string | number, mode: GraftResetMode = "hard") {
    return this.db.resetTo(rev, mode)
  }

  public tableLog(tableName: string) {
    return this.db.tableLog(tableName)
  }

  // close db
  public close() {
    this.db.close()
    this.dataEventChannel.close()
  }

  // SQL execution methods
  @timeit(100)
  public async syncExec2(
    sql: string,
    bind: any[] = [],
    db = this.db
  ): Promise<any> {
    try {
      return await db.exec({
        sql,
        bind,
        returnValue: "resultRows",
        rowMode: "object",
      })
    } catch (error: any) {
      if (error.toString().includes("SqliteError")) {
        this.notify({
          title: "SqliteError",
          description: error.toString(),
        })
      }
      throw error
    }
  }

  // return object array
  public async exec2(sql: string, bind: any[] = []) {
    return this.syncExec2(sql, bind)
  }

  @timeit(100)
  public async execute(sql: string, bind: any[] = []) {
    const res: any[] = await this.db.exec({
      sql,
      bind,
      rowMode: "array",
    })
    return {
      fetchone: () => res[0],
      fetchall: () => res,
    }
  }

  // just execute, no return
  @timeit(100)
  public exec(sql: string, bind: any[] = []) {
    console.debug(sql, bind)
    this.db.exec({
      sql,
      bind,
    })
  }

  @timeit(100)
  protected async execSqlWithBind(
    sql: string,
    bind: any[] = [],
    rowMode: "object" | "array" = "array"
  ) {
    const res: any[] = await this.db.exec({
      sql,
      bind,
      returnValue: "resultRows",
      rowMode,
    })
    return res
  }

  /**
   * it's a template string function, to execute sql. safe from sql injection
   * table name and column name need to be Symbol, like Symbol('table_name') or Symbol('column_name')
   *
   * example:
   * const tableName = "books"
   * const id = 42
   * sql`select ${Symbol("title")} from ${Symbol('table_name')} where id = ${id}`.then(logger.info)
   * @param strings
   * @param values
   * @returns
   */
  public async sql(strings: TemplateStringsArray, ...values: any[]) {
    const { sql, bind } = buildSql(strings, ...values)
    // console.debug(sql, bind)
    const res = this.execSqlWithBind(sql, bind)
    // when sql will update database, call event
    if (!isReadOnlySql(sql)) {
      // delay trigger event
      setTimeout(() => this.undoRedoManager.event(), 0)
    }
    return res
  }

  // just for type check
  public sql2 = this.sql

  public async sqlQuery2(sql: string, bind: any[] = []) {
    return this.sql4mainThread(sql, bind, "object")
  }

  // rename for public rpc
  public sqlQuery = this.sql4mainThread

  /**
   * Symbol can't be transformed between main thread and worker thread.
   * so we need to parse sql in main thread, then call this function. it will equal to call `sql` function in worker thread
   * be careful, it just parse sql before, the next logic need to be same with `sql` function
   * @param sql
   * @param bind
   * @returns
   */
  @timeit(100)
  public async sql4mainThread(
    sql: string,
    bind: any[] = [],
    rowMode: "object" | "array" = "array"
  ) {
    // logger.debug(
    //   "[%cSQLQuery:%cCallViaRawSql]",
    //   "color:indigo",
    //   "color:red",
    //   sql,
    //   bind,
    //   rowMode
    // )
    const res = await this.execSqlWithBind(sql, bind, rowMode)
    // when sql will update database, call event
    if (!isReadOnlySql(sql)) {
      // delay trigger event
      setTimeout(() => this.undoRedoManager.event(), 30)
    }
    return res
  }

  // return object array
  public async sql4mainThread2(sql: string, bind: any[] = []) {
    logger.debug(
      "[%cSQLQuery:%cCallViaRawSql]",
      "color:indigo",
      "color:red",
      sql,
      bind,
      "object"
    )
    return this.execSqlWithBind(sql, bind, "object")
  }
}
