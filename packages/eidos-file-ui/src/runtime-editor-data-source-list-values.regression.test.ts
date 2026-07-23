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
const PEOPLE = "018f0000-0000-7000-8000-000000000003"
const TITLE = "018f0000-0000-7000-8000-000000000004"
const SIGNALS = "018f0000-0000-7000-8000-000000000005"
const OWNER = "018f0000-0000-7000-8000-000000000006"
const ASSETS = "018f0000-0000-7000-8000-000000000007"
const PERSON_NAME = "018f0000-0000-7000-8000-000000000008"
const PROJECT_ROW = "018f0000-0000-7000-8000-000000000009"
const PERSON_ROW = "018f0000-0000-7000-8000-000000000010"

function schemaObjects() {
  return [
    {
      object: "table",
      id: PROJECTS,
      name: "Projects",
      labelFieldId: TITLE,
      position: "0",
      settings: {},
    },
    {
      object: "table",
      id: PEOPLE,
      name: "People",
      labelFieldId: PERSON_NAME,
      position: "1",
      settings: {},
    },
    {
      object: "field",
      id: TITLE,
      tableId: PROJECTS,
      name: "Title",
      kind: "text",
      valueType: "text",
      systemRole: null,
      nullable: false,
      position: "0",
      settings: {},
      writable: true,
    },
    {
      object: "field",
      id: SIGNALS,
      tableId: PROJECTS,
      name: "Signals",
      kind: "multi-select",
      valueType: "multi-select",
      systemRole: null,
      nullable: false,
      position: "1",
      settings: {},
      writable: true,
    },
    {
      object: "field",
      id: OWNER,
      tableId: PROJECTS,
      name: "Owner",
      kind: "relation",
      valueType: "relation",
      systemRole: null,
      nullable: false,
      position: "2",
      settings: {},
      writable: true,
      definition: {
        direction: "forward",
        targetTableId: PEOPLE,
        cardinality: "one",
        onDelete: "restrict",
      },
    },
    {
      object: "field",
      id: ASSETS,
      tableId: PROJECTS,
      name: "Assets",
      kind: "file",
      valueType: "file",
      systemRole: null,
      nullable: false,
      position: "3",
      settings: {},
      writable: true,
    },
    {
      object: "field",
      id: PERSON_NAME,
      tableId: PEOPLE,
      name: "Name",
      kind: "text",
      valueType: "text",
      systemRole: null,
      nullable: false,
      position: "0",
      settings: {},
      writable: true,
    },
  ]
}

function runtimeClient() {
  let revision = "1"
  const queryRows = vi.fn(async (request: QueryRowsRequest) => ({
    fileId: FILE,
    tableId: request.tableId,
    revision,
    projectionHash: "projection",
    columns: request.projection.fields.map((fieldId) => ({
      fieldId,
      name:
        fieldId === TITLE
          ? "Title"
          : fieldId === SIGNALS
            ? "Signals"
            : fieldId === OWNER
              ? "Owner"
              : "Assets",
      valueType:
        fieldId === TITLE
          ? ("text" as const)
          : fieldId === SIGNALS
            ? ("multi-select" as const)
            : fieldId === OWNER
              ? ("relation" as const)
              : ("file" as const),
      source: "stored" as const,
      writable: true,
    })),
    rows: [],
    nextCursor: null,
    previousCursor: null,
  }))
  const mutateRows = vi.fn(
    async (request: RowMutation): Promise<MutationResult> => {
      revision = "2"
      return {
        fileId: FILE,
        revision,
        changed: true,
        created: [],
        affectedRows: [{ tableId: PROJECTS, rowId: PROJECT_ROW }],
        returnedRows: {
          fileId: FILE,
          tableId: PROJECTS,
          revision,
          projectionHash: "projection",
          columns: (request.returning?.fields ?? []).map((fieldId) => ({
            fieldId,
            name:
              fieldId === TITLE
                ? "Title"
                : fieldId === SIGNALS
                  ? "Signals"
                  : fieldId === OWNER
                    ? "Owner"
                    : "Assets",
            valueType:
              fieldId === TITLE
                ? ("text" as const)
                : fieldId === SIGNALS
                  ? ("multi-select" as const)
                  : fieldId === OWNER
                    ? ("relation" as const)
                    : ("file" as const),
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
      }
    }
  )
  const aggregate = vi.fn(async (_request: AggregateRequest) => ({
    fileId: FILE,
    revision,
    results: [{ key: "count", op: "count-all" as const, value: "0" }],
  }))
  const unsupported = async (): Promise<never> => {
    throw new Error("unused")
  }
  const client = {
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
          fields: "5",
          views: "0",
          features: "0",
        },
      }
    },
    async getSchemaPage() {
      return {
        fileId: FILE,
        revision,
        objects: schemaObjects(),
        nextCursor: null,
      }
    },
    queryRows,
    aggregate,
    mutateRows,
    getRowsById: unsupported,
    groupRows: unsupported,
    queryGroupRows: unsupported,
    previewFormula: unsupported,
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
  return { client, mutateRows, queryRows }
}

describe("Runtime editor list-value regression", () => {
  it("submits empty Runtime lists when legacy editors clear list fields", async () => {
    const { client, mutateRows } = runtimeClient()
    const source = new EidosRuntimeEditorDataSource(client, "fixture.eidos")
    await source.initialize()

    const result = await source.updateRow(PROJECTS, PROJECT_ROW, {
      [SIGNALS]: null,
      [OWNER]: null,
      [ASSETS]: null,
    })

    expect(mutateRows).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          {
            kind: "update",
            rowId: PROJECT_ROW,
            values: {
              [SIGNALS]: [],
              [OWNER]: [],
              [ASSETS]: [],
            },
          },
        ],
      }),
      expect.any(Object)
    )
    expect(result.row[SIGNALS]).toBe("[]")
    expect(result.row[OWNER]).toBe("[]")
    expect(result.row[ASSETS]).toBe("[]")
  })

  it("submits list filter elements without nesting whole-cell arrays", async () => {
    const { client, queryRows } = runtimeClient()
    const source = new EidosRuntimeEditorDataSource(client, "fixture.eidos")
    await source.initialize()

    await source.getPage(PROJECTS, 0, 25, {
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: SIGNALS,
            operator: "is-any-of",
            value: ["Quality"],
          },
          {
            type: "rule",
            field: OWNER,
            operator: "is-any-of",
            value: [PERSON_ROW],
          },
        ],
      },
    })

    expect(queryRows).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: {
          filter: {
            op: "and",
            args: [
              { op: "has-any", fieldId: SIGNALS, values: ["Quality"] },
              { op: "has-any", fieldId: OWNER, values: [PERSON_ROW] },
            ],
          },
        },
      }),
      expect.any(Object)
    )
  })
})
