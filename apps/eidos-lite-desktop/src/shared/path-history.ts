/** Bounded first-parent history for one exact path; renames are not followed. */
export interface FileHistoryPage {
  path: string
  start: string | null
  commits: Array<{
    id: string
    parents: string[]
    message: string
    timestamp_ms: number
    change: "added" | "modified" | "deleted"
  }>
  has_more: boolean
  next_cursor: string | null
  telemetry: {
    commits_scanned: number
    commit_objects_read: number
    tree_objects_read: number
    object_bytes_read: number
    blob_objects_read: 0
  }
}

export interface RestoreTextVersionRequest {
  path: string
  revision: string
  expectedRevision: string | null
  draft?: string
}

export interface RestoreTextVersionResult {
  backupPaths: string[]
}
