import { useCallback } from "react"
import type {
  BaseColumnStatConfig,
  BaseColumnStatResult,
  BaseRow,
  BaseRowGroupCount,
  BaseRowMutationResult,
  BaseRowsMutationResult,
  BaseRowPage,
  BaseRowQuery,
  BaseRowRange,
  BaseRowUpdate,
  BaseRowsDeleteResult,
  BaseSnapshot,
  BaseCsvImportOptions,
  BaseCsvImportPlan,
  BaseCsvImportResult,
  BaseFormulaPreview,
  BaseFormulaPreviewInput,
  BaseFieldPlacement,
  CreateBaseFieldInput,
  CreateBaseOptions,
  CreateBaseTableInput,
  CreateBaseViewInput,
  UpdateBaseFieldInput,
  UpdateBaseTableInput,
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
    (relativePath: string): Promise<BaseSnapshot> =>
      requireBaseApi().getBaseSnapshot(requireSpaceId(), relativePath),
    [requireSpaceId]
  )

  const selectCsv = useCallback(
    () => requireBaseApi().selectBaseCsv(requireSpaceId()),
    [requireSpaceId]
  )

  const previewCsvImport = useCallback(
    (
      token: string,
      options: BaseCsvImportOptions = {},
      operationId?: string
    ): Promise<BaseCsvImportPlan> =>
      requireBaseApi().previewBaseCsvImport(
        requireSpaceId(),
        token,
        options,
        operationId
      ),
    [requireSpaceId]
  )

  const importCsv = useCallback(
    (
      relativePath: string,
      token: string,
      options: BaseCsvImportOptions = {},
      operationId?: string
    ): Promise<{ result: BaseCsvImportResult; snapshot: BaseSnapshot }> =>
      requireBaseApi().importBaseCsv(
        requireSpaceId(),
        relativePath,
        token,
        options,
        operationId
      ),
    [requireSpaceId]
  )

  const getCsvOperation = useCallback(
    (operationId: string) =>
      requireBaseApi().getBaseCsvOperation(requireSpaceId(), operationId),
    [requireSpaceId]
  )

  const cancelCsvOperation = useCallback(
    (operationId: string) =>
      requireBaseApi().cancelBaseCsvOperation(requireSpaceId(), operationId),
    [requireSpaceId]
  )

  const getTablePage = useCallback(
    (
      relativePath: string,
      tableId: string,
      offset: number,
      limit: number,
      query: BaseRowQuery = {},
      totalHint?: number,
      cursor?: string
    ): Promise<BaseRowPage> =>
      requireBaseApi().getBaseTablePage(
        requireSpaceId(),
        relativePath,
        tableId,
        {
          offset,
          limit,
          query,
          totalHint,
          ...(cursor ? { cursor } : {}),
        }
      ),
    [requireSpaceId]
  )

  const getTableGroupCounts = useCallback(
    (
      relativePath: string,
      tableId: string,
      columnName: string,
      query: BaseRowQuery = {}
    ): Promise<BaseRowGroupCount[]> =>
      requireBaseApi().getBaseTableGroupCounts(
        requireSpaceId(),
        relativePath,
        tableId,
        columnName,
        query
      ),
    [requireSpaceId]
  )

  const getTableColumnStats = useCallback(
    (
      relativePath: string,
      tableId: string,
      configs: BaseColumnStatConfig[],
      query: BaseRowQuery = {}
    ): Promise<BaseColumnStatResult[]> =>
      requireBaseApi().getBaseTableColumnStats(
        requireSpaceId(),
        relativePath,
        tableId,
        configs,
        query
      ),
    [requireSpaceId]
  )

  const addField = useCallback(
    (
      relativePath: string,
      tableId: string,
      field: CreateBaseFieldInput,
      placement?: BaseFieldPlacement
    ): Promise<BaseSnapshot> =>
      requireBaseApi().addBaseField(
        requireSpaceId(),
        relativePath,
        tableId,
        field,
        placement
      ),
    [requireSpaceId]
  )

  const previewFormula = useCallback(
    (
      relativePath: string,
      tableId: string,
      input: BaseFormulaPreviewInput
    ): Promise<BaseFormulaPreview> =>
      requireBaseApi().previewBaseFormula(
        requireSpaceId(),
        relativePath,
        tableId,
        input
      ),
    [requireSpaceId]
  )

  const updateField = useCallback(
    (
      relativePath: string,
      tableId: string,
      columnName: string,
      changes: UpdateBaseFieldInput
    ): Promise<BaseSnapshot> =>
      requireBaseApi().updateBaseField(
        requireSpaceId(),
        relativePath,
        tableId,
        columnName,
        changes
      ),
    [requireSpaceId]
  )

  const deleteField = useCallback(
    (
      relativePath: string,
      tableId: string,
      columnName: string
    ): Promise<BaseSnapshot> =>
      requireBaseApi().deleteBaseField(
        requireSpaceId(),
        relativePath,
        tableId,
        columnName
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

  const updateTable = useCallback(
    (
      relativePath: string,
      tableId: string,
      changes: UpdateBaseTableInput
    ): Promise<BaseSnapshot> =>
      requireBaseApi().updateBaseTable(
        requireSpaceId(),
        relativePath,
        tableId,
        changes
      ),
    [requireSpaceId]
  )

  const deleteTable = useCallback(
    (relativePath: string, tableId: string): Promise<BaseSnapshot> =>
      requireBaseApi().deleteBaseTable(requireSpaceId(), relativePath, tableId),
    [requireSpaceId]
  )

  const insertRow = useCallback(
    (
      relativePath: string,
      tableId: string,
      row: BaseRow
    ): Promise<BaseRowMutationResult> =>
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

  const createView = useCallback(
    (
      relativePath: string,
      tableId: string,
      input: CreateBaseViewInput
    ): Promise<BaseSnapshot> =>
      requireBaseApi().createBaseView(
        requireSpaceId(),
        relativePath,
        tableId,
        input
      ),
    [requireSpaceId]
  )

  const duplicateView = useCallback(
    (
      relativePath: string,
      viewId: string,
      name?: string
    ): Promise<BaseSnapshot> =>
      requireBaseApi().duplicateBaseView(
        requireSpaceId(),
        relativePath,
        viewId,
        name
      ),
    [requireSpaceId]
  )

  const deleteView = useCallback(
    (relativePath: string, viewId: string): Promise<BaseSnapshot> =>
      requireBaseApi().deleteBaseView(requireSpaceId(), relativePath, viewId),
    [requireSpaceId]
  )

  const reorderViews = useCallback(
    (
      relativePath: string,
      tableId: string,
      viewIds: string[]
    ): Promise<BaseSnapshot> =>
      requireBaseApi().reorderBaseViews(
        requireSpaceId(),
        relativePath,
        tableId,
        viewIds
      ),
    [requireSpaceId]
  )

  const updateRow = useCallback(
    (
      relativePath: string,
      tableId: string,
      rowId: string,
      changes: BaseRow
    ): Promise<BaseRowMutationResult> =>
      requireBaseApi().updateBaseRow(
        requireSpaceId(),
        relativePath,
        tableId,
        rowId,
        changes
      ),
    [requireSpaceId]
  )

  const updateRows = useCallback(
    (
      relativePath: string,
      tableId: string,
      updates: BaseRowUpdate[]
    ): Promise<BaseRowsMutationResult> =>
      requireBaseApi().updateBaseRows(
        requireSpaceId(),
        relativePath,
        tableId,
        updates
      ),
    [requireSpaceId]
  )

  const deleteRows = useCallback(
    (
      relativePath: string,
      tableId: string,
      rowIds: string[]
    ): Promise<BaseRowsDeleteResult> =>
      requireBaseApi().deleteBaseRows(
        requireSpaceId(),
        relativePath,
        tableId,
        rowIds
      ),
    [requireSpaceId]
  )

  const deleteRowRanges = useCallback(
    (
      relativePath: string,
      tableId: string,
      ranges: BaseRowRange[],
      query: BaseRowQuery = {}
    ): Promise<BaseRowsDeleteResult> =>
      requireBaseApi().deleteBaseRowRanges(
        requireSpaceId(),
        relativePath,
        tableId,
        ranges,
        query
      ),
    [requireSpaceId]
  )

  return {
    create,
    selectCsv,
    previewCsvImport,
    importCsv,
    getCsvOperation,
    cancelCsvOperation,
    getSnapshot,
    getTablePage,
    getTableGroupCounts,
    getTableColumnStats,
    createTable,
    updateTable,
    deleteTable,
    addField,
    previewFormula,
    updateField,
    deleteField,
    createView,
    updateView,
    duplicateView,
    deleteView,
    reorderViews,
    insertRow,
    updateRow,
    updateRows,
    deleteRows,
    deleteRowRanges,
  }
}
