import { useCallback } from "react"
import type {
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowMutationResult,
  EidosFileRowsMutationResult,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileRowQuery,
  EidosFileRowRange,
  EidosFileRowUpdate,
  EidosFileRowsDeleteResult,
  EidosFileSnapshot,
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
  EidosFileCsvExportOptions,
  EidosFileCsvExportResult,
  EidosFileFormulaPreview,
  EidosFileFormulaPreviewInput,
  EidosFileFieldPlacement,
  CreateEidosFileFieldInput,
  CreateEidosFileOptions,
  CreateEidosFileTableInput,
  CreateEidosFileViewInput,
  UpdateEidosFileFieldInput,
  UpdateEidosFileTableInput,
  UpdateEidosFileViewInput,
} from "@eidos.space/eidos-file"

function requireEidosFileApi() {
  if (typeof window === "undefined" || !window.eidos?.spaceMgmt) {
    throw new Error("Eidos Files are available in the desktop app")
  }
  return window.eidos.spaceMgmt
}

export function useSpaceEidosFile(spaceId: string | undefined) {
  const requireSpaceId = useCallback(() => {
    if (!spaceId) throw new Error("No active Space")
    return spaceId
  }, [spaceId])

  const create = useCallback(
    (relativePath: string, options: CreateEidosFileOptions = {}) =>
      requireEidosFileApi().createEidosFile(
        requireSpaceId(),
        relativePath,
        options
      ),
    [requireSpaceId]
  )

  const getSnapshot = useCallback(
    (relativePath: string): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().getEidosFileSnapshot(
        requireSpaceId(),
        relativePath
      ),
    [requireSpaceId]
  )

  const selectCsv = useCallback(
    () => requireEidosFileApi().selectEidosFileCsv(requireSpaceId()),
    [requireSpaceId]
  )

  const previewCsvImport = useCallback(
    (
      token: string,
      options: EidosFileCsvImportOptions = {},
      operationId?: string
    ): Promise<EidosFileCsvImportPlan> =>
      requireEidosFileApi().previewEidosFileCsvImport(
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
      options: EidosFileCsvImportOptions = {},
      operationId?: string
    ): Promise<{
      result: EidosFileCsvImportResult
      snapshot: EidosFileSnapshot
    }> =>
      requireEidosFileApi().importEidosFileCsv(
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
      requireEidosFileApi().getEidosFileCsvOperation(
        requireSpaceId(),
        operationId
      ),
    [requireSpaceId]
  )

  const cancelCsvOperation = useCallback(
    (operationId: string) =>
      requireEidosFileApi().cancelEidosFileCsvOperation(
        requireSpaceId(),
        operationId
      ),
    [requireSpaceId]
  )

  const exportCsv = useCallback(
    (
      relativePath: string,
      tableId: string,
      options: EidosFileCsvExportOptions,
      suggestedFileName: string,
      operationId?: string
    ): Promise<
      | { canceled: true; fileName: null; result: null }
      | {
          canceled: false
          fileName: string
          result: EidosFileCsvExportResult
        }
    > =>
      requireEidosFileApi().exportEidosFileCsv(
        requireSpaceId(),
        relativePath,
        tableId,
        options,
        suggestedFileName,
        operationId
      ),
    [requireSpaceId]
  )

  const getTablePage = useCallback(
    (
      relativePath: string,
      tableId: string,
      offset: number,
      limit: number,
      query: EidosFileRowQuery = {},
      totalHint?: number,
      cursor?: string,
      projection?: EidosFileRowPageProjection
    ): Promise<EidosFileRowPage> =>
      requireEidosFileApi().getEidosFileTablePage(
        requireSpaceId(),
        relativePath,
        tableId,
        {
          offset,
          limit,
          query,
          totalHint,
          ...(cursor ? { cursor } : {}),
          ...(projection ? { projection } : {}),
        }
      ),
    [requireSpaceId]
  )

  const getTableRow = useCallback(
    (
      relativePath: string,
      tableId: string,
      rowId: string
    ): Promise<EidosFileRow | null> =>
      requireEidosFileApi().getEidosFileTableRow(
        requireSpaceId(),
        relativePath,
        tableId,
        rowId
      ),
    [requireSpaceId]
  )

  const getTableGroupCounts = useCallback(
    (
      relativePath: string,
      tableId: string,
      columnName: string,
      query: EidosFileRowQuery = {}
    ): Promise<EidosFileRowGroupCount[]> =>
      requireEidosFileApi().getEidosFileTableGroupCounts(
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
      configs: EidosFileColumnStatConfig[],
      query: EidosFileRowQuery = {}
    ): Promise<EidosFileColumnStatResult[]> =>
      requireEidosFileApi().getEidosFileTableColumnStats(
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
      field: CreateEidosFileFieldInput,
      placement?: EidosFileFieldPlacement
    ): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().addEidosFileField(
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
      input: EidosFileFormulaPreviewInput
    ): Promise<EidosFileFormulaPreview> =>
      requireEidosFileApi().previewEidosFileFormula(
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
      changes: UpdateEidosFileFieldInput
    ): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().updateEidosFileField(
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
    ): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().deleteEidosFileField(
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
      table: CreateEidosFileTableInput
    ): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().createEidosFileTable(
        requireSpaceId(),
        relativePath,
        table
      ),
    [requireSpaceId]
  )

  const updateTable = useCallback(
    (
      relativePath: string,
      tableId: string,
      changes: UpdateEidosFileTableInput
    ): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().updateEidosFileTable(
        requireSpaceId(),
        relativePath,
        tableId,
        changes
      ),
    [requireSpaceId]
  )

  const deleteTable = useCallback(
    (relativePath: string, tableId: string): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().deleteEidosFileTable(
        requireSpaceId(),
        relativePath,
        tableId
      ),
    [requireSpaceId]
  )

  const insertRow = useCallback(
    (
      relativePath: string,
      tableId: string,
      row: EidosFileRow
    ): Promise<EidosFileRowMutationResult> =>
      requireEidosFileApi().insertEidosFileRow(
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
      changes: UpdateEidosFileViewInput
    ): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().updateEidosFileView(
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
      input: CreateEidosFileViewInput
    ): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().createEidosFileView(
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
    ): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().duplicateEidosFileView(
        requireSpaceId(),
        relativePath,
        viewId,
        name
      ),
    [requireSpaceId]
  )

  const deleteView = useCallback(
    (relativePath: string, viewId: string): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().deleteEidosFileView(
        requireSpaceId(),
        relativePath,
        viewId
      ),
    [requireSpaceId]
  )

  const reorderViews = useCallback(
    (
      relativePath: string,
      tableId: string,
      viewIds: string[]
    ): Promise<EidosFileSnapshot> =>
      requireEidosFileApi().reorderEidosFileViews(
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
      changes: EidosFileRow
    ): Promise<EidosFileRowMutationResult> =>
      requireEidosFileApi().updateEidosFileRow(
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
      updates: EidosFileRowUpdate[]
    ): Promise<EidosFileRowsMutationResult> =>
      requireEidosFileApi().updateEidosFileRows(
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
    ): Promise<EidosFileRowsDeleteResult> =>
      requireEidosFileApi().deleteEidosFileRows(
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
      ranges: EidosFileRowRange[],
      query: EidosFileRowQuery = {}
    ): Promise<EidosFileRowsDeleteResult> =>
      requireEidosFileApi().deleteEidosFileRowRanges(
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
    exportCsv,
    getSnapshot,
    getTablePage,
    getTableRow,
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
