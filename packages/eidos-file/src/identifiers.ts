import { EidosFileError } from "./errors"

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/
const SAFE_TABLE_ID = /^[A-Za-z0-9_]+$/

export function assertEidosFileTableId(tableId: string): string {
  if (!SAFE_TABLE_ID.test(tableId)) {
    throw new EidosFileError(
      "invalid-identifier",
      `Invalid Eidos File table id: ${tableId}`
    )
  }
  return tableId
}

export function assertEidosFileColumnName(columnName: string): string {
  if (!SAFE_IDENTIFIER.test(columnName) || columnName.startsWith("_")) {
    throw new EidosFileError(
      "invalid-identifier",
      `Invalid Eidos File field column name: ${columnName}`
    )
  }
  return columnName
}

export function rawTableNameForId(tableId: string): string {
  return `tb_${assertEidosFileTableId(tableId)}`
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
}

export function createEidosFileUuid(): string {
  return globalThis.crypto.randomUUID()
}

export function createEidosFileIdentifier(): string {
  return createEidosFileUuid().replace(/-/g, "")
}
