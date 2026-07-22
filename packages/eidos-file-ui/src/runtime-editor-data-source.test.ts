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

describe("EidosRuntimeEditorDataSource", () => {
  it("adapts Relation reads and cleared writes across the Runtime boundary", async () => {
    const queryRows = vi.fn(async (request: QueryRowsRequest) => ({
      fileId: FILE,
      tableId: PROJECTS,
      revision: "1",
      projectionHash: "projection",
      columns: request.projection.fields.map((fieldId) => ({
        fieldId,
        name: fieldId === TITLE ? "Title" : "Team",
        valueType:
          fieldId === TITLE ? ("text" as const) : ("relation" as const),
        source: "stored" as const,
        writable: true,
      })),
      rows: [
        {
          id: PROJECT_ROW,
          values: request.projection.fields.map((fieldId) =>
            fieldId === TITLE ? "Demo" : [TEAM_ROW, MISSING_TEAM_ROW]
          ),
          resolvedRelations: request.projection.resolveRelations.includes(TEAM)
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
    const aggregate = vi.fn(async (_request: AggregateRequest) => ({
      fileId: FILE,
      revision: "1",
      results: [{ key: "count", op: "count-all" as const, value: "1" }],
    }))
    const mutateRows = vi.fn(
      async (request: RowMutation): Promise<MutationResult> => ({
        fileId: FILE,
        revision: "2",
        changed: true,
        created: [],
        affectedRows: [{ tableId: PROJECTS, rowId: PROJECT_ROW }],
        returnedRows: {
          fileId: FILE,
          tableId: PROJECTS,
          revision: "2",
          projectionHash: "projection",
          columns: (request.returning?.fields ?? []).map((fieldId) => ({
            fieldId,
            name: fieldId === TITLE ? "Title" : "Team",
            valueType:
              fieldId === TITLE ? ("text" as const) : ("relation" as const),
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
            fields: "3",
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
  })
})
