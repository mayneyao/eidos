import { describe, expect, it, vi } from "vitest"
import type {
  AggregateRequest,
  MutationResult,
  QueryRowsRequest,
  RowMutation,
  RuntimeClient,
} from "@eidos.space/eidos-file"

import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"

const FILE = "018f0000-0000-7000-8000-000000000001"
const PROJECTS = "018f0000-0000-7000-8000-000000000002"
const TEAMS = "018f0000-0000-7000-8000-000000000003"
const TITLE = "018f0000-0000-7000-8000-000000000004"
const TEAM = "018f0000-0000-7000-8000-000000000005"
const TEAM_NAME = "018f0000-0000-7000-8000-000000000006"
const PROJECT_ROW = "018f0000-0000-7000-8000-000000000007"
const TEAM_ROW = "018f0000-0000-7000-8000-000000000008"
const MISSING_TEAM_ROW = "018f0000-0000-7000-8000-000000000009"
const SIGNALS = "018f0000-0000-7000-8000-000000000010"
const DONE = "018f0000-0000-7000-8000-000000000011"
const ROW_ID = "018f0000-0000-7000-8000-000000000012"

function conversionRuntime(
  classification: "lossless-rewrite" | "explicit-lossy"
) {
  let revision = "1"
  let kind: "multi-select" | "select" = "multi-select"
  let plannedChange: unknown
  const preflightSchema = vi.fn(async (request: { change: unknown }) => {
    plannedChange = request.change
    return {
      fileId: FILE,
      baseRevision: revision,
      classification,
      planToken: "conversion-plan",
      actionsHash: "conversion-actions",
      affectedRows: "1",
      dependencyCount: "0",
      dependencies: [],
      warnings:
        classification === "explicit-lossy"
          ? [
              {
                code: "list-tail-loss" as const,
                severity: "warning" as const,
                fieldId: SIGNALS,
                message: "Converting this field would discard list values",
              },
            ]
          : [],
      warningsTruncated: false,
      valueChanges: [],
      valueChangesTruncated: false,
      expiresInMilliseconds: 60_000,
      expiresAt: "2026-07-26T00:01:00.000Z",
    }
  })
  const mutateSchema = vi.fn(async () => {
    kind = "select"
    revision = "2"
    return {
      fileId: FILE,
      revision,
      changed: true,
      createdObjects: [],
      affectedTableIds: [PROJECTS],
      affectedFieldIds: [SIGNALS],
    }
  })
  const mutateRows = vi.fn(
    async (request: RowMutation): Promise<MutationResult> => ({
      fileId: FILE,
      revision: "2",
      changed: true,
      created: [],
      affectedRows: [
        ...request.changes.flatMap((change) =>
          change.kind === "delete"
            ? [{ tableId: PROJECTS, rowId: change.rowId }]
            : []
        ),
        { tableId: TEAMS, rowId: TEAM_ROW },
      ],
    })
  )
  const runtime = {
    async negotiate() {
      return { version: "1.0" as const, capabilities: {}, limits: {} }
    },
    async getSnapshot() {
      return {
        fileId: FILE,
        format: { major: 1 as const, minor: 0 as const },
        revision,
        title: "Fixture",
        defaultTableId: PROJECTS,
        schemaCounts: {
          tables: "1",
          fields: "3",
          views: "0",
          features: "0",
        },
      }
    },
    async getSchemaPage() {
      return {
        fileId: FILE,
        revision,
        objects: [
          {
            object: "table" as const,
            id: PROJECTS,
            name: "Projects",
            labelFieldId: TITLE,
            position: "0",
            settings: {},
          },
          {
            object: "field" as const,
            id: ROW_ID,
            tableId: PROJECTS,
            name: "Row ID",
            kind: "text" as const,
            valueType: "row-id" as const,
            systemRole: "row-id" as const,
            nullable: false,
            position: "-1",
            settings: {},
            writable: false,
          },
          {
            object: "field" as const,
            id: TITLE,
            tableId: PROJECTS,
            name: "Title",
            kind: "text" as const,
            valueType: "text" as const,
            systemRole: null,
            nullable: false,
            position: "0",
            settings: {},
            writable: true,
          },
          {
            object: "field" as const,
            id: SIGNALS,
            tableId: PROJECTS,
            name: "Signals",
            kind,
            valueType: kind,
            systemRole: null,
            nullable: kind === "select",
            position: "1",
            settings: {},
            writable: true,
          },
        ],
        nextCursor: null,
      }
    },
    async aggregate(request: AggregateRequest) {
      return {
        fileId: FILE,
        revision,
        results: request.items.map((item) =>
          item.op === "distinct-values"
            ? {
                key: item.key,
                values: [["Quality"]],
                truncated: false,
              }
            : {
                key: item.key,
                value: "1",
              }
        ),
      }
    },
    async queryRows() {
      return {
        fileId: FILE,
        tableId: PROJECTS,
        revision,
        projectionHash: "conversion-rows",
        columns: [],
        rows: [
          {
            id: PROJECT_ROW,
            values: [["Quality"]],
          },
        ],
        nextCursor: null,
        previousCursor: null,
      }
    },
    preflightSchema,
    mutateSchema,
    mutateRows,
  } as unknown as RuntimeClient
  return {
    runtime,
    preflightSchema,
    mutateSchema,
    mutateRows,
    plannedChange: () => plannedChange,
  }
}

describe("EidosRuntimeEditorDataSource", () => {
  it("locates a Row ID using the same translated query as the editor view", async () => {
    const fixture = conversionRuntime("lossless-rewrite")
    const source = new EidosRuntimeEditorDataSource(
      fixture.runtime,
      "fixture.eidos"
    )
    await source.initialize()
    const getRowsById = vi.fn(async () => ({
      fileId: FILE,
      tableId: PROJECTS,
      revision: "1",
      projectionHash: "title-only",
      columns: [
        {
          fieldId: TITLE,
          name: "Title",
          valueType: "text" as const,
          source: "stored" as const,
          writable: true,
        },
      ],
      rows: [{ id: PROJECT_ROW, values: ["Roadmap"] }],
      missingRowIds: [],
    }))
    const aggregate = vi
      .fn()
      .mockResolvedValueOnce({
        fileId: FILE,
        tableId: PROJECTS,
        revision: "1",
        results: [{ key: "count", value: "1" }],
      })
      .mockResolvedValueOnce({
        fileId: FILE,
        tableId: PROJECTS,
        revision: "1",
        results: [{ key: "count", value: "7" }],
      })
    Object.assign(fixture.runtime, { getRowsById, aggregate })

    await expect(
      source.getRowIndex(PROJECTS, PROJECT_ROW, {
        search: "roadmap",
        sorts: [{ field: TITLE, direction: "desc", nulls: "first" }],
      })
    ).resolves.toBe(7)
    expect(getRowsById).toHaveBeenCalledWith(
      {
        tableId: PROJECTS,
        rowIds: [PROJECT_ROW],
        projection: { fields: [TITLE], resolveRelations: [] },
      },
      expect.objectContaining({
        requestId: expect.stringMatching(/^locate-row-values-/),
      })
    )
    expect(aggregate).toHaveBeenCalledTimes(2)
    expect(aggregate.mock.calls[1]?.[0]).toMatchObject({
      tableId: PROJECTS,
      query: {
        search: { text: "roadmap", fields: [ROW_ID, TITLE] },
        filter: { op: "or" },
      },
    })
  })

  it("persists a complete Table drag order with stable IDs", async () => {
    let revision = "1"
    let positions = new Map([
      [PROJECTS, "0"],
      [TEAMS, "1"],
    ])
    let plannedChange: unknown
    const preflightSchema = vi.fn(async (request: { change: unknown }) => {
      plannedChange = request.change
      return {
        fileId: FILE,
        revision,
        classification: "metadata-only" as const,
        planToken: "table-order-plan",
        actionsHash: "table-order-actions",
        warnings: [],
      }
    })
    const mutateSchema = vi.fn(async () => {
      const changes = (
        plannedChange as {
          changes: Array<{ tableId: string; position: string }>
        }
      ).changes
      positions = new Map(
        changes.map((change) => [change.tableId, change.position])
      )
      revision = "2"
      return { fileId: FILE, revision, changed: true }
    })
    const runtime = {
      async negotiate() {
        return { version: "1.0" as const, capabilities: {}, limits: {} }
      },
      async getSnapshot() {
        return {
          fileId: FILE,
          format: { major: 1 as const, minor: 0 as const },
          revision,
          title: "Fixture",
          defaultTableId: PROJECTS,
          schemaCounts: {
            tables: "2",
            fields: "2",
            views: "0",
            features: "0",
          },
        }
      },
      async getSchemaPage() {
        return {
          fileId: FILE,
          revision,
          objects: [
            {
              object: "table" as const,
              id: PROJECTS,
              name: "Projects",
              labelFieldId: TITLE,
              position: positions.get(PROJECTS)!,
              settings: {},
            },
            {
              object: "table" as const,
              id: TEAMS,
              name: "Teams",
              labelFieldId: TEAM_NAME,
              position: positions.get(TEAMS)!,
              settings: {},
            },
            {
              object: "field" as const,
              id: TITLE,
              tableId: PROJECTS,
              name: "Title",
              kind: "text" as const,
              valueType: "text" as const,
              systemRole: null,
              nullable: false,
              position: "0",
              settings: {},
              writable: true,
            },
            {
              object: "field" as const,
              id: TEAM_NAME,
              tableId: TEAMS,
              name: "Name",
              kind: "text" as const,
              valueType: "text" as const,
              systemRole: null,
              nullable: false,
              position: "0",
              settings: {},
              writable: true,
            },
          ],
          nextCursor: null,
        }
      },
      async aggregate() {
        return {
          fileId: FILE,
          revision,
          results: [{ key: "count", op: "count-all" as const, value: "0" }],
        }
      },
      preflightSchema,
      mutateSchema,
    } as unknown as RuntimeClient

    const source = new EidosRuntimeEditorDataSource(runtime, "fixture.eidos")
    await source.initialize()
    const snapshot = await source.reorderTables([TEAMS, PROJECTS])

    expect(preflightSchema).toHaveBeenCalledWith(
      {
        change: {
          kind: "batch",
          changes: [
            {
              kind: "set-table-position",
              tableId: TEAMS,
              position: "1",
            },
            {
              kind: "set-table-position",
              tableId: PROJECTS,
              position: "2",
            },
          ],
        },
        expectedRevision: "1",
      },
      expect.any(Object)
    )
    expect(snapshot.tables.map((table) => table.table.id)).toEqual([
      TEAMS,
      PROJECTS,
    ])
  })

  it("adapts Relation and multi-select values across the Runtime boundary", async () => {
    const queryRows = vi.fn(async (request: QueryRowsRequest) => ({
      fileId: FILE,
      tableId: PROJECTS,
      revision: "1",
      projectionHash: "projection",
      columns: request.projection.fields.map((fieldId) => ({
        fieldId,
        name:
          fieldId === TITLE
            ? "Title"
            : fieldId === TEAM
              ? "Team"
              : fieldId === DONE
                ? "Done"
                : "Signals",
        valueType:
          fieldId === TITLE
            ? ("text" as const)
            : fieldId === TEAM
              ? ("relation" as const)
              : fieldId === DONE
                ? ("checkbox" as const)
                : ("multi-select" as const),
        source: "stored" as const,
        writable: true,
      })),
      rows: request.projection.fields.includes(DONE)
        ? [true, false, null].map((done, index) => ({
            id: `${PROJECT_ROW.slice(0, -1)}${index + 7}`,
            values: request.projection.fields.map((fieldId) =>
              fieldId === DONE ? done : null
            ),
          }))
        : [
            {
              id: PROJECT_ROW,
              values: request.projection.fields.map((fieldId) =>
                fieldId === TITLE
                  ? "Demo"
                  : fieldId === TEAM
                    ? [TEAM_ROW, MISSING_TEAM_ROW]
                    : []
              ),
              resolvedRelations: request.projection.resolveRelations.includes(
                TEAM
              )
                ? [
                    {
                      column: request.projection.fields.indexOf(TEAM),
                      items: [
                        {
                          id: TEAM_ROW,
                          state: "resolved" as const,
                          labelFieldId: TEAM_NAME,
                          labelType: "text" as const,
                          label: "Runtime Core",
                        },
                        {
                          id: MISSING_TEAM_ROW,
                          state: "unresolved" as const,
                        },
                      ],
                    },
                  ]
                : undefined,
            },
          ],
      nextCursor: null,
      previousCursor: null,
    }))
    const aggregate = vi.fn(async (request: AggregateRequest) => ({
      fileId: FILE,
      revision: "1",
      results: request.items.map((item) => ({
        key: item.key,
        value: "1",
      })),
    }))
    const mutateRows = vi.fn(
      async (request: RowMutation): Promise<MutationResult> => ({
        fileId: FILE,
        revision: "2",
        changed: true,
        created:
          request.changes[0]?.kind === "create"
            ? [
                {
                  clientKey: request.changes[0].clientKey,
                  rowId: PROJECT_ROW,
                },
              ]
            : [],
        affectedRows: [{ tableId: PROJECTS, rowId: PROJECT_ROW }],
        returnedRows: {
          fileId: FILE,
          tableId: PROJECTS,
          revision: "2",
          projectionHash: "projection",
          columns: (request.returning?.fields ?? []).map((fieldId) => ({
            fieldId,
            name:
              fieldId === TITLE
                ? "Title"
                : fieldId === TEAM
                  ? "Team"
                  : "Signals",
            valueType:
              fieldId === TITLE
                ? ("text" as const)
                : fieldId === TEAM
                  ? ("relation" as const)
                  : ("multi-select" as const),
            source: "stored" as const,
            writable: true,
          })),
          rows: [
            {
              id: PROJECT_ROW,
              values: (request.returning?.fields ?? []).map((fieldId) =>
                fieldId === TITLE ? "Demo" : []
              ),
              resolvedRelations: [],
            },
          ],
          missingRowIds: [],
        },
      })
    )
    const unsupported = async (): Promise<never> => {
      throw new Error("unused")
    }
    const runtime = {
      async negotiate() {
        return { version: "1.0" as const, capabilities: {}, limits: {} }
      },
      async getSnapshot() {
        return {
          fileId: FILE,
          format: { major: 1 as const, minor: 0 as const },
          revision: "1",
          title: "Fixture",
          defaultTableId: PROJECTS,
          schemaCounts: {
            tables: "2",
            fields: "5",
            views: "0",
            features: "0",
          },
        }
      },
      async getSchemaPage() {
        return {
          fileId: FILE,
          revision: "1",
          objects: [
            {
              object: "table" as const,
              id: PROJECTS,
              name: "Projects",
              labelFieldId: TITLE,
              position: "0",
              settings: {},
            },
            {
              object: "table" as const,
              id: TEAMS,
              name: "Teams",
              labelFieldId: TEAM_NAME,
              position: "1",
              settings: {},
            },
            {
              object: "field" as const,
              id: TITLE,
              tableId: PROJECTS,
              name: "Title",
              kind: "text" as const,
              valueType: "text" as const,
              systemRole: null,
              nullable: false,
              position: "0",
              settings: {},
              writable: true,
            },
            {
              object: "field" as const,
              id: TEAM,
              tableId: PROJECTS,
              name: "Team",
              kind: "relation" as const,
              valueType: "relation" as const,
              systemRole: null,
              nullable: false,
              position: "1",
              settings: {},
              writable: true,
              definition: {
                direction: "forward" as const,
                targetTableId: TEAMS,
                cardinality: "one" as const,
                onDelete: "restrict" as const,
              },
            },
            {
              object: "field" as const,
              id: TEAM_NAME,
              tableId: TEAMS,
              name: "Name",
              kind: "text" as const,
              valueType: "text" as const,
              systemRole: null,
              nullable: false,
              position: "0",
              settings: {},
              writable: true,
            },
            {
              object: "field" as const,
              id: SIGNALS,
              tableId: PROJECTS,
              name: "Signals",
              kind: "multi-select" as const,
              valueType: "multi-select" as const,
              systemRole: null,
              nullable: false,
              position: "2",
              settings: {},
              writable: true,
            },
            {
              object: "field" as const,
              id: DONE,
              tableId: PROJECTS,
              name: "Done",
              kind: "checkbox" as const,
              valueType: "checkbox" as const,
              systemRole: null,
              nullable: true,
              position: "3",
              settings: {},
              writable: true,
            },
          ],
          nextCursor: null,
        }
      },
      queryRows,
      aggregate,
      getRowsById: unsupported,
      groupRows: unsupported,
      queryGroupRows: unsupported,
      previewFormula: unsupported,
      mutateRows,
      revertMutation: unsupported,
      mutateView: unsupported,
      preflightSchema: unsupported,
      getSchemaPlanDependencies: unsupported,
      mutateSchema: unsupported,
      validate: unsupported,
      exportCsv: unsupported,
      importCsv: unsupported,
      async cancel() {},
      async close() {},
    } as unknown as RuntimeClient

    const source = new EidosRuntimeEditorDataSource(runtime, "fixture.eidos")
    await source.initialize()
    const page = await source.getPage(PROJECTS, 0, 1, {}, 1, undefined, {
      columns: [TEAM],
      fieldLimit: 1,
      includeRecordLabel: true,
    })

    expect(queryRows).toHaveBeenCalledWith(
      expect.objectContaining({
        projection: {
          fields: [TITLE, TEAM],
          resolveRelations: [TEAM],
        },
      }),
      expect.any(Object)
    )
    expect(page.rows[0]?.[`${TEAM}__display`]).toBe(
      JSON.stringify([{ id: TEAM_ROW, title: "Runtime Core" }])
    )

    queryRows.mockClear()
    await source.getPage(PROJECTS, 915_000, 1, {}, 1_000_000, undefined, {
      columns: [TEAM],
      fieldLimit: 1,
      includeRecordLabel: true,
    })

    expect(queryRows).toHaveBeenCalledTimes(1)
    expect(queryRows).toHaveBeenCalledWith(
      expect.objectContaining({
        offset: 915_000,
      }),
      expect.any(Object)
    )
    expect(queryRows.mock.calls[0]?.[0]).not.toHaveProperty("cursor")

    await expect(
      source.calculateColumnStats(
        PROJECTS,
        [
          { fieldId: TITLE, type: "count-all" },
          { fieldId: TEAM, type: "relation-distinct-target-count" },
          { fieldId: SIGNALS, type: "count-empty" },
        ],
        {}
      )
    ).resolves.toEqual([
      { fieldId: TITLE, type: "count-all", value: 1 },
      {
        fieldId: TEAM,
        type: "relation-distinct-target-count",
        value: 2,
      },
      { fieldId: SIGNALS, type: "count-empty", value: 1 },
    ])
    await expect(
      source.calculateColumnStats(
        PROJECTS,
        [{ fieldId: SIGNALS, type: "count-empty" }],
        {}
      )
    ).resolves.toEqual([{ fieldId: SIGNALS, type: "count-empty", value: 1 }])

    await expect(
      source.calculateColumnStats(
        PROJECTS,
        [
          { fieldId: DONE, type: "percent-checked" },
          { fieldId: DONE, type: "percent-unchecked" },
        ],
        {}
      )
    ).resolves.toEqual([
      { fieldId: DONE, type: "percent-checked", value: 33.33 },
      { fieldId: DONE, type: "percent-unchecked", value: 66.67 },
    ])

    await source.updateRow(PROJECTS, PROJECT_ROW, { [TEAM]: "[]" })

    expect(mutateRows).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          {
            kind: "update",
            rowId: PROJECT_ROW,
            values: { [TEAM]: [] },
          },
        ],
      }),
      expect.any(Object)
    )

    await source.updateRow(PROJECTS, PROJECT_ROW, {
      [SIGNALS]: '["Quality","Speed"]',
    })

    expect(mutateRows).toHaveBeenLastCalledWith(
      expect.objectContaining({
        changes: [
          {
            kind: "update",
            rowId: PROJECT_ROW,
            values: { [SIGNALS]: ["Quality", "Speed"] },
          },
        ],
      }),
      expect.any(Object)
    )

    await expect(
      source.insertRow(PROJECTS, { [TITLE]: "Created" })
    ).resolves.toMatchObject({ row: { _id: PROJECT_ROW } })

    expect(mutateRows).toHaveBeenLastCalledWith(
      expect.objectContaining({
        changes: [
          expect.objectContaining({
            kind: "create",
            values: { [TITLE]: "Created" },
          }),
        ],
      }),
      expect.any(Object)
    )
  })

  it("plans Multi-select to Select with a nullable target and no implicit lossy confirmation", async () => {
    const fixture = conversionRuntime("lossless-rewrite")
    const source = new EidosRuntimeEditorDataSource(
      fixture.runtime,
      "fixture.eidos"
    )
    await source.initialize()

    await source.updateField(PROJECTS, SIGNALS, { type: "select" })

    expect(fixture.plannedChange()).toEqual({
      kind: "batch",
      changes: [
        {
          kind: "convert-field",
          fieldId: SIGNALS,
          to: "select",
          toNullable: true,
          policies: ["first"],
        },
        {
          kind: "set-field-settings",
          fieldId: SIGNALS,
          settings: {
            options: [{ name: "Quality", color: "gray" }],
          },
        },
      ],
    })
    expect(fixture.mutateSchema).toHaveBeenCalledWith(
      expect.not.objectContaining({ confirmLossy: true }),
      expect.any(Object)
    )
  })

  it("maps a Record Label Field update to the canonical schema leaf", async () => {
    const fixture = conversionRuntime("lossless-rewrite")
    const source = new EidosRuntimeEditorDataSource(
      fixture.runtime,
      "fixture.eidos"
    )
    await source.initialize()

    await source.updateField(PROJECTS, SIGNALS, { isRecordLabel: true })

    expect(fixture.plannedChange()).toEqual({
      kind: "set-record-label",
      tableId: PROJECTS,
      fieldId: SIGNALS,
    })
  })

  it("stops an explicit-lossy conversion after preflight instead of silently applying it", async () => {
    const fixture = conversionRuntime("explicit-lossy")
    const source = new EidosRuntimeEditorDataSource(
      fixture.runtime,
      "fixture.eidos"
    )
    await source.initialize()

    await expect(
      source.updateField(PROJECTS, SIGNALS, { type: "select" })
    ).rejects.toThrow(/discard list values/)
    expect(fixture.mutateSchema).not.toHaveBeenCalled()
  })

  it("applies an explicit-lossy conversion only after user confirmation", async () => {
    const fixture = conversionRuntime("explicit-lossy")
    const source = new EidosRuntimeEditorDataSource(
      fixture.runtime,
      "fixture.eidos"
    )
    await source.initialize()

    await source.updateField(PROJECTS, SIGNALS, {
      type: "select",
      confirmLossy: true,
    })

    expect(fixture.mutateSchema).toHaveBeenCalledWith(
      expect.objectContaining({ confirmLossy: true }),
      expect.any(Object)
    )
  })

  it("keeps editor deletes in one Runtime transaction and counts only deleted rows", async () => {
    const fixture = conversionRuntime("lossless-rewrite")
    const source = new EidosRuntimeEditorDataSource(
      fixture.runtime,
      "fixture.eidos"
    )
    await source.initialize()

    await expect(
      source.deleteRows(PROJECTS, [PROJECT_ROW])
    ).resolves.toMatchObject({ deletedCount: 1 })
    expect(fixture.mutateRows).toHaveBeenCalledTimes(1)
    await expect(
      source.deleteRows(
        PROJECTS,
        Array.from({ length: 501 }, (_, index) => `row-${index}`)
      )
    ).rejects.toThrow(/at most 500/i)
    expect(fixture.mutateRows).toHaveBeenCalledTimes(1)
  })

  it("uses the local deletion undo bridge and returns its inverse token", async () => {
    const fixture = conversionRuntime("lossless-rewrite")
    const mutateRowsWithUndo = vi.fn(async () => ({
      fileId: FILE,
      revision: "2",
      changed: true,
      created: [],
      affectedRows: [{ tableId: PROJECTS, rowId: PROJECT_ROW }],
      undoToken: "undo-delete",
    }))
    const revertRowDeletion = vi.fn(async () => ({
      fileId: FILE,
      revision: "3",
      changed: true,
      created: [],
      affectedRows: [{ tableId: PROJECTS, rowId: PROJECT_ROW }],
      rowCount: "1",
      undoToken: "redo-delete",
    }))
    Object.assign(fixture.runtime, {
      mutateRowsWithUndo,
      revertRowDeletion,
    })
    const source = new EidosRuntimeEditorDataSource(
      fixture.runtime,
      "fixture.eidos"
    )
    await source.initialize()

    await expect(
      source.deleteRows(PROJECTS, [PROJECT_ROW])
    ).resolves.toMatchObject({
      deletedCount: 1,
      undoToken: "undo-delete",
    })
    expect(mutateRowsWithUndo).toHaveBeenCalledOnce()
    expect(fixture.mutateRows).not.toHaveBeenCalled()

    await expect(
      source.revertRowMutation(PROJECTS, "undo-delete")
    ).resolves.toMatchObject({ undoToken: "redo-delete" })
    expect(revertRowDeletion).toHaveBeenCalledWith(
      { undoToken: "undo-delete", expectedRevision: "2" },
      expect.any(Object)
    )
  })
})
