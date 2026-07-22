export type EidosFileErrorCode =
  | "invalid-sqlite"
  | "not-eidos-file"
  | "unsupported-version"
  | "unsupported-feature"
  | "invalid-schema"
  | "invalid-formula"
  | "invalid-value"
  | "constraint-conflict"
  | "dependency-cycle"
  | "stale-revision"
  | "file-conflict"
  | "permission-denied"
  | "query-limit"
  | "resource-limit"
  /** @deprecated Use unsupported-version. */
  | "unsupported-format"
  | "invalid-identifier"
  | "invalid-query"
  | "invalid-range"
  | "invalid-csv"
  | "protected-field"
  | "protected-view"
  | "relation-in-use"
  | "formula-in-use"
  | "lookup-in-use"
  | "table-not-found"
  | "row-not-found"
  | "field-not-found"
  | "view-not-found"
  | "file-exists"
  | "file-not-found"

export class EidosFileError extends Error {
  constructor(
    readonly code: EidosFileErrorCode,
    message: string
  ) {
    super(message)
    this.name = "EidosFileError"
  }
}
