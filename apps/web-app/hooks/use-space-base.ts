import { useCallback } from "react"
import type {
  BaseRow,
  BaseSnapshot,
  CreateBaseFieldInput,
  CreateBaseOptions,
  CreateBaseTableInput,
  UpdateBaseViewInput,
} from "@eidos.space/base"

function requireBaseApi() {
  if (typeof window === "undefined" || !window.eidos?.spaceMgmt) {
    throw new Error("Base files are available in the desktop app")
  }
  return window.eidos.spaceMgmt
}

export function useSpaceBase(spaceId: string | undefined) {
  const requireSpaceId = useCallback(() => {
    if (!spaceId) throw new Error("No active Space")
    return spaceId
  }, [spaceId])

  const create = useCallback(
    (relativePath: string, options: CreateBaseOptions = {}) =>
      requireBaseApi().createBase(requireSpaceId(), relativePath, options),
    [requireSpaceId]
  )

  const getSnapshot = useCallback(
    (relativePath: string, maxRowsPerTable = 200): Promise<BaseSnapshot> =>
      requireBaseApi().getBaseSnapshot(requireSpaceId(), relativePath, {
        maxRowsPerTable,
      }),
    [requireSpaceId]
  )

  const addField = useCallback(
    (
      relativePath: string,
      tableId: string,
      field: CreateBaseFieldInput
    ): Promise<BaseSnapshot> =>
      requireBaseApi().addBaseField(
        requireSpaceId(),
        relativePath,
        tableId,
        field
      ),
    [requireSpaceId]
  )

  const createTable = useCallback(
    (
      relativePath: string,
      table: CreateBaseTableInput
    ): Promise<BaseSnapshot> =>
      requireBaseApi().createBaseTable(requireSpaceId(), relativePath, table),
    [requireSpaceId]
  )

  const insertRow = useCallback(
    (
      relativePath: string,
      tableId: string,
      row: BaseRow
    ): Promise<BaseSnapshot> =>
      requireBaseApi().insertBaseRow(
        requireSpaceId(),
        relativePath,
        tableId,
        row
      ),
    [requireSpaceId]
  )

  const updateView = useCallback(
    (
      relativePath: string,
      viewId: string,
      changes: UpdateBaseViewInput
    ): Promise<BaseSnapshot> =>
      requireBaseApi().updateBaseView(
        requireSpaceId(),
        relativePath,
        viewId,
        changes
      ),
    [requireSpaceId]
  )

  const updateRow = useCallback(
    (
      relativePath: string,
      tableId: string,
      rowId: string,
      changes: BaseRow
    ): Promise<BaseSnapshot> =>
      requireBaseApi().updateBaseRow(
        requireSpaceId(),
        relativePath,
        tableId,
        rowId,
        changes
      ),
    [requireSpaceId]
  )

  const deleteRow = useCallback(
    (
      relativePath: string,
      tableId: string,
      rowId: string
    ): Promise<BaseSnapshot> =>
      requireBaseApi().deleteBaseRow(
        requireSpaceId(),
        relativePath,
        tableId,
        rowId
      ),
    [requireSpaceId]
  )

  return {
    create,
    getSnapshot,
    createTable,
    addField,
    updateView,
    insertRow,
    updateRow,
    deleteRow,
  }
}
