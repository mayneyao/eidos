export type BaseErrorCode =
  | "invalid-sqlite"
  | "not-base"
  | "unsupported-format"
  | "invalid-schema"
  | "invalid-identifier"
  | "invalid-range"
  | "protected-field"
  | "protected-view"
  | "relation-in-use"
  | "table-not-found"
  | "row-not-found"
  | "field-not-found"
  | "view-not-found"
  | "file-exists"
  | "file-not-found"

export class BaseError extends Error {
  constructor(
    readonly code: BaseErrorCode,
    message: string
  ) {
    super(message)
    this.name = "BaseError"
  }
}
