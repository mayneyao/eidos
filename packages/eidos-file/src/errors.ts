export type EidosFileErrorCode =
  | "invalid-sqlite"
  | "not-eidos-file"
  | "unsupported-format"
  | "invalid-schema"
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
