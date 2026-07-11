export type BaseErrorCode =
  | "invalid-sqlite"
  | "not-base"
  | "unsupported-format"
  | "invalid-schema"
  | "invalid-identifier"
  | "table-not-found"
  | "row-not-found"
  | "field-not-found"
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
