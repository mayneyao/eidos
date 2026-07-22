import { useCallback, useEffect, useRef } from "react"
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
import { EidosRuntimeEditorDataSource } from "@eidos.space/eidos-file-ui"

import { desktopEidosFileHost } from "@/apps/web-app/lib/eidos-file/desktop-host-services"

function requireEidosFileApi() {
  if (typeof window === "undefined" || !window.eidos?.spaceMgmt) {
    throw new Error("Eidos Files are available in the desktop app")
  }
  return window.eidos.spaceMgmt
}

export function useSpaceEidosFile(spaceId: string | undefined) {
  const sessionsRef = useRef(
    new Map<
      string,
      Promise<{
        sessionId: string
        sourceToken: string
        source: EidosRuntimeEditorDataSource
      }>
    >()
  )

  const requireSpaceId = useCallback(() => {
    if (!spaceId) throw new Error("No active Space")
    return spaceId
  }, [spaceId])

  const closeSource = useCallback(async (relativePath: string) => {
    const pending = sessionsRef.current.get(relativePath)
    sessionsRef.current.delete(relativePath)
    if (!pending) return
    try {
      const opened = await pending
      await desktopEidosFileHost.close(
        { sessionId: opened.sessionId },
        runtimeContext("close")
      )
    } catch {
      // Failed opens and already-closed sessions have no remaining resource.
    }
  }, [])

  const openSource = useCallback(
    (relativePath: string) => {
      const existing = sessionsRef.current.get(relativePath)
      if (existing) return existing
      const opening = (async () => {
        const { sourceToken } = await desktopEidosFileHost.registerSource(
          requireSpaceId(),
          relativePath
        )
        let sessionId: string | undefined
        try {
          const opened = await desktopEidosFileHost.openSource(
            { sourceToken, access: "readwrite" },
            runtimeContext("open")
          )
          sessionId = opened.sessionId
          const source = new EidosRuntimeEditorDataSource(
            opened.runtime,
            relativePath
          )
          await source.initialize()
          return { sessionId: opened.sessionId, sourceToken, source }
        } catch (error) {
          if (sessionId) {
            await desktopEidosFileHost
              .close({ sessionId }, runtimeContext("failed-open-close"))
              .catch(() => {})
          }
          await desktopEidosFileHost.revokeSource(sourceToken).catch(() => {})
          throw error
        }
      })()
      sessionsRef.current.set(relativePath, opening)
      void opening.catch(() => {
        if (sessionsRef.current.get(relativePath) === opening) {
          sessionsRef.current.delete(relativePath)
        }
      })
      return opening
    },
    [requireSpaceId]
  )

  const reopenSource = useCallback(
    async (relativePath: string) => {
      await closeSource(relativePath)
      return openSource(relativePath)
    },
    [closeSource, openSource]
  )

  const mutate = useCallback(
    async <T>(
      relativePath: string,
      operation: (source: EidosRuntimeEditorDataSource) => Promise<T>
    ) => {
      const opened = await openSource(relativePath)
      const result = await operation(opened.source)
      await desktopEidosFileHost.save(
        { sessionId: opened.sessionId },
        runtimeContext("save")
      )
      return result
    },
    [openSource]
  )

  useEffect(
    () => () => {
      const pending = [...sessionsRef.current.values()]
      sessionsRef.current.clear()
      for (const opening of pending) {
        void opening.then(({ sessionId }) =>
          desktopEidosFileHost
            .close({ sessionId }, runtimeContext("unmount-close"))
            .catch(() => undefined)
        )
      }
    },
    []
  )

  const create = useCallback(
    async (
      relativePath: string,
      options: CreateEidosFileOptions = {}
    ): Promise<EidosFileSnapshot> => {
      const { destinationToken } =
        await desktopEidosFileHost.registerDestination(
          requireSpaceId(),
          relativePath
        )
      const title =
        options.title?.trim() ||
        relativePath
          .split("/")
          .at(-1)
          ?.replace(/\.eidos$/i, "") ||
        "Untitled"
      let opened: Awaited<ReturnType<typeof desktopEidosFileHost.createSource>>
      try {
        opened = await desktopEidosFileHost.createSource(
          { destinationToken, title },
          runtimeContext("create")
        )
      } catch (error) {
        await desktopEidosFileHost
          .revokeSource(destinationToken)
          .catch(() => {})
        throw error
      }
      try {
        const source = new EidosRuntimeEditorDataSource(
          opened.runtime,
          relativePath
        )
        let snapshot = await source.initialize()
        if (options.defaultTable) {
          snapshot = await source.createTable(options.defaultTable)
          await desktopEidosFileHost.save(
            { sessionId: opened.sessionId },
            runtimeContext("create-save")
          )
        }
        return snapshot
      } finally {
        await desktopEidosFileHost.close(
          { sessionId: opened.sessionId },
          runtimeContext("create-close")
        )
      }
    },
    [requireSpaceId]
  )

  const getSnapshot = useCallback(
    async (relativePath: string): Promise<EidosFileSnapshot> => {
      const opened = await reopenSource(relativePath)
      return opened.source.getSnapshot()
    },
    [reopenSource]
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
    async (
      relativePath: string,
      token: string,
      options: EidosFileCsvImportOptions = {},
      operationId?: string
    ): Promise<{
      result: EidosFileCsvImportResult
      snapshot: EidosFileSnapshot
    }> => {
      await closeSource(relativePath)
      return requireEidosFileApi().importEidosFileCsv(
        requireSpaceId(),
        relativePath,
        token,
        options,
        operationId
      )
    },
    [closeSource, requireSpaceId]
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
      openSource(relativePath).then(({ source }) =>
        source.getPage(
          tableId,
          offset,
          limit,
          query,
          totalHint,
          cursor,
          projection
        )
      ),
    [openSource]
  )

  const getTableRow = useCallback(
    (
      relativePath: string,
      tableId: string,
      rowId: string
    ): Promise<EidosFileRow | null> =>
      openSource(relativePath).then(({ source }) =>
        source.getRow(tableId, rowId)
      ),
    [openSource]
  )

  const getTableGroupCounts = useCallback(
    (
      relativePath: string,
      tableId: string,
      columnName: string,
      query: EidosFileRowQuery = {}
    ): Promise<EidosFileRowGroupCount[]> =>
      openSource(relativePath).then(({ source }) =>
        source.getGroupCounts(tableId, columnName, query)
      ),
    [openSource]
  )

  const getTableColumnStats = useCallback(
    (
      relativePath: string,
      tableId: string,
      configs: EidosFileColumnStatConfig[],
      query: EidosFileRowQuery = {}
    ): Promise<EidosFileColumnStatResult[]> =>
      openSource(relativePath).then(({ source }) =>
        source.calculateColumnStats(tableId, configs, query)
      ),
    [openSource]
  )

  const addField = useCallback(
    (
      relativePath: string,
      tableId: string,
      field: CreateEidosFileFieldInput,
      placement?: EidosFileFieldPlacement
    ): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) =>
        source.addField(tableId, field, placement)
      ),
    [mutate]
  )

  const previewFormula = useCallback(
    (
      relativePath: string,
      tableId: string,
      input: EidosFileFormulaPreviewInput
    ): Promise<EidosFileFormulaPreview> =>
      openSource(relativePath).then(({ source }) =>
        source.previewFormula(tableId, input)
      ),
    [openSource]
  )

  const updateField = useCallback(
    (
      relativePath: string,
      tableId: string,
      columnName: string,
      changes: UpdateEidosFileFieldInput
    ): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) =>
        source.updateField(tableId, columnName, changes)
      ),
    [mutate]
  )

  const deleteField = useCallback(
    (
      relativePath: string,
      tableId: string,
      columnName: string
    ): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) => source.deleteField(tableId, columnName)),
    [mutate]
  )

  const createTable = useCallback(
    (
      relativePath: string,
      table: CreateEidosFileTableInput
    ): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) => source.createTable(table)),
    [mutate]
  )

  const updateTable = useCallback(
    (
      relativePath: string,
      tableId: string,
      changes: UpdateEidosFileTableInput
    ): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) => source.updateTable(tableId, changes)),
    [mutate]
  )

  const deleteTable = useCallback(
    (relativePath: string, tableId: string): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) => source.deleteTable(tableId)),
    [mutate]
  )

  const insertRow = useCallback(
    (
      relativePath: string,
      tableId: string,
      row: EidosFileRow
    ): Promise<EidosFileRowMutationResult> =>
      mutate(relativePath, (source) => source.insertRow(tableId, row)),
    [mutate]
  )

  const updateView = useCallback(
    (
      relativePath: string,
      viewId: string,
      changes: UpdateEidosFileViewInput
    ): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) => source.updateView(viewId, changes)),
    [mutate]
  )

  const createView = useCallback(
    (
      relativePath: string,
      tableId: string,
      input: CreateEidosFileViewInput
    ): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) => source.createView(tableId, input)),
    [mutate]
  )

  const duplicateView = useCallback(
    (
      relativePath: string,
      viewId: string,
      name?: string
    ): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) => source.duplicateView(viewId, name)),
    [mutate]
  )

  const deleteView = useCallback(
    (relativePath: string, viewId: string): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) => source.deleteView(viewId)),
    [mutate]
  )

  const reorderViews = useCallback(
    (
      relativePath: string,
      tableId: string,
      viewIds: string[]
    ): Promise<EidosFileSnapshot> =>
      mutate(relativePath, (source) => source.reorderViews(tableId, viewIds)),
    [mutate]
  )

  const updateRow = useCallback(
    (
      relativePath: string,
      tableId: string,
      rowId: string,
      changes: EidosFileRow
    ): Promise<EidosFileRowMutationResult> =>
      mutate(relativePath, (source) =>
        source.updateRow(tableId, rowId, changes)
      ),
    [mutate]
  )

  const updateRows = useCallback(
    (
      relativePath: string,
      tableId: string,
      updates: EidosFileRowUpdate[]
    ): Promise<EidosFileRowsMutationResult> =>
      mutate(relativePath, async (source) => {
        const rows: EidosFileRow[] = []
        let rowCount = 0
        let revision: EidosFileRowsMutationResult["revision"]
        for (const update of updates) {
          const result = await source.updateRow(
            tableId,
            update.rowId,
            update.changes
          )
          rows.push(result.row)
          rowCount = result.rowCount
          revision = result.revision
        }
        return { tableId, rows, rowCount, revision }
      }),
    [mutate]
  )

  const deleteRows = useCallback(
    (
      relativePath: string,
      tableId: string,
      rowIds: string[]
    ): Promise<EidosFileRowsDeleteResult> =>
      mutate(relativePath, (source) => source.deleteRows(tableId, rowIds)),
    [mutate]
  )

  const deleteRowRanges = useCallback(
    (
      relativePath: string,
      tableId: string,
      ranges: EidosFileRowRange[],
      query: EidosFileRowQuery = {}
    ): Promise<EidosFileRowsDeleteResult> =>
      mutate(relativePath, (source) =>
        source.deleteRowRanges(tableId, ranges, query)
      ),
    [mutate]
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

function runtimeContext(action: string) {
  return {
    requestId: `desktop-${action}-${crypto.randomUUID()}`,
    deadlineMilliseconds: 30_000,
  }
}
