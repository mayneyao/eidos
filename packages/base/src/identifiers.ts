import { BaseError } from "./errors"

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/
const SAFE_TABLE_ID = /^[A-Za-z0-9_]+$/

export function assertBaseTableId(tableId: string): string {
  if (!SAFE_TABLE_ID.test(tableId)) {
    throw new BaseError(
      "invalid-identifier",
      `Invalid Base table id: ${tableId}`
    )
  }
  return tableId
}

export function assertBaseColumnName(columnName: string): string {
  if (!SAFE_IDENTIFIER.test(columnName) || columnName.startsWith("_")) {
    throw new BaseError(
      "invalid-identifier",
      `Invalid Base field column name: ${columnName}`
    )
  }
  return columnName
}

export function rawTableNameForId(tableId: string): string {
  return `tb_${assertBaseTableId(tableId)}`
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

export function createBaseUuid(): string {
  return globalThis.crypto.randomUUID()
}

export function createBaseIdentifier(): string {
  return createBaseUuid().replace(/-/g, "")
}
