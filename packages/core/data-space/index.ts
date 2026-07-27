import { DataSpaceWithTable } from "./table"
import type {
  GraftConflictResolveTarget,
  GraftConflictResolution,
  GraftResetMode,
} from "../sqlite/interface"

export class DataSpace extends DataSpaceWithTable {
  /**
   * Graft (version control sync) API namespace
   */
  get graft() {
    return {
      pull: (remoteToken?: string) => this.db.pull(remoteToken),
      push: (remoteToken?: string) => this.db.push(remoteToken),
      fetch: (remoteToken?: string) => this.db.fetch(remoteToken),
      commit: (message?: string) => this.db.commit(message),
      completeMerge: (message?: string) => this.db.completeMerge(message),
      abortMerge: () => this.db.abortMerge(),
      conflicts: () => this.db.conflicts(),
      resolveConflict: (
        resolution: GraftConflictResolution,
        path?: string,
        target?: GraftConflictResolveTarget
      ) => this.db.resolveConflict(resolution, path, target),
      snapshot: () => this.db.snapshot(),
      clone: (remoteUri?: string, remoteToken?: string) =>
        this.db.clone(remoteUri, remoteToken),
      enableLocalVersioning: () => this.db.enableLocalVersioning(),
      status: () => this.db.status(),
      branches: () => this.db.branches(),
      tags: () => this.db.tags(),
      volumes: () => this.db.volumes(),
      info: () => this.db.info(),
      audit: () => this.db.audit(),
      hydrate: () => this.db.hydrate(),
      log: () => this.db.log(),
      show: (rev: string | number) => this.db.show(rev),
      diff: (
        from: string | number,
        to?: string | number,
        mode: "summary" | "rows" = "summary"
      ) => this.db.diff(from, to, mode),
      checkoutLsn: (rev: string | number) => this.db.checkoutLsn(rev),
      resetTo: (rev: string | number, mode: GraftResetMode = "hard") =>
        this.db.resetTo(rev, mode),
      tableLog: (tableName: string) => this.db.tableLog(tableName),
    }
  }
}

// Re-export types and other exports from base
export * from "./base"
