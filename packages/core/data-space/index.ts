import { DataSpaceWithTable } from "./table"

export class DataSpace extends DataSpaceWithTable {
  /**
   * Graft (version control sync) API namespace
   */
  get graft() {
    return {
      pull: () => this.db.pull(),
      push: () => this.db.push(),
      fetch: () => this.db.fetch(),
      clone: (remoteLogId?: string) => this.db.clone(remoteLogId),
      status: () => this.db.status(),
      tags: () => this.db.tags(),
      volumes: () => this.db.volumes(),
      info: () => this.db.info(),
      audit: () => this.db.audit(),
      hydrate: () => this.db.hydrate(),
    }
  }
}

// Re-export types and other exports from base
export * from "./base"
