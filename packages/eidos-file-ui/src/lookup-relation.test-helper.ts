import { expect } from "vitest"
import { Runtime } from "../../eidos-file/src/runtime-service"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"
import { eidosFileValueToGridCell } from "./eidos-file-grid-adapter"
import {
  eidosFileRecordFieldText,
  eidosFileLookupListText,
} from "./eidos-file-record-format"

import { ConnectionPortEidosFileConnection } from "../../eidos-file/src/connection-port"
import { EidosFileRuntime } from "../../eidos-file/src/runtime"
import { initializeEidosFileSchema } from "../../eidos-file/src/schema"

import type { ConnectionPort } from "../../eidos-file/src/adapter-contract"
export async function verifyLookupRelation(connection: ConnectionPort) {
  const dbPath = "music.eidos"
  try {
    const legacy = new ConnectionPortEidosFileConnection(connection)
    initializeEidosFileSchema(legacy, {})
    const fixture = new EidosFileRuntime(legacy, false)
    fixture.createTable({
      name: "Composers",
      fields: [{ name: "Name", type: "text", isRecordLabel: true }],
    })
    let composerTableId: string
    let composerIds: string[]
    try {
      composerTableId = fixture.schema()[0]!.table.id
      composerIds = ["Beethoven", "Mozart"].map((Name) =>
        String(fixture.insertRow(composerTableId, { Name })._id)
      )
      const works = fixture.createTable({
        name: "Works",
        fields: [
          { name: "Title", type: "text", isRecordLabel: true },
          {
            name: "Composers",
            type: "relation",
            property: {
              targetTableId: composerTableId,
              direction: "forward",
              cardinality: "many",
              onDelete: "preserve",
            },
          },
        ],
      })
      const composers = fixture
        .listFields(works.id)
        .find((field) => field.name === "Composers")!
      const work = fixture.insertRow(works.id, {
        Title: "Program",
        Composers: JSON.stringify(composerIds),
      })
      const concerts = fixture.createTable({
        name: "Concerts",
        fields: [
          { name: "Title", type: "text", isRecordLabel: true },
          {
            name: "Works",
            type: "relation",
            property: {
              targetTableId: works.id,
              direction: "forward",
              cardinality: "many",
              onDelete: "preserve",
            },
          },
        ],
      })
      const worksRelation = fixture
        .listFields(concerts.id)
        .find((field) => field.name === "Works")!
      fixture.addField(concerts.id, {
        name: "Composers lookup",
        type: "lookup",
        property: {
          relationField: worksRelation.id!,
          targetField: composers.id!,
          aggregate: "values",
          displayType: "text",
          distinct: true,
        },
      })
      fixture.insertRow(concerts.id, {
        Title: "Evening",
        Works: JSON.stringify([work._id]),
      })
      fixture.insertRow(concerts.id, { Title: "Empty", Works: "[]" })
    } finally {
      fixture.close()
    }
    const { service } = await Runtime.open(
      connection,
      {
        clock: {
          nowInstant: () => new Date().toISOString(),
          nowMilliseconds: () => performance.now(),
        },
        entropy: {
          randomBytes: (length) =>
            crypto.getRandomValues(new Uint8Array(length)),
        },
      },
      "readwrite",
      {
        cancellation: {
          cancelled: () => false,
          onCancel: () => () => undefined,
        },
      }
    )
    try {
      const source = new EidosRuntimeEditorDataSource(service, dbPath)
      const snapshot = await source.initialize()
      const concerts = snapshot.tables.find(
        (entry) => entry.table.name === "Concerts"
      )!
      const field = concerts.fields.find(
        (entry) => entry.name === "Composers lookup"
      )!
      expect(field.property).toMatchObject({
        targetTableId: composerTableId,
        valueType: { kind: "list", element: "row-id" },
      })
      const aggregate = await service.aggregate(
        {
          tableId: concerts.table.id,
          items: [
            {
              key: "composers",
              op: "distinct-values",
              fieldId: field.id!,
              limit: 10,
            },
          ],
        },
        { requestId: "lookup-aggregate", deadlineMilliseconds: 5000 }
      )
      expect(aggregate.results).toMatchObject([
        {
          key: "composers",
          values: expect.arrayContaining([composerIds]),
        },
      ])
      const page = await source.getPage(concerts.table.id, 0, 10, {}, 2)
      expect(page.rows).toHaveLength(2)
      const populated = page.rows.find(
        (row) => eidosFileLookupListText(row, field) === "Beethoven, Mozart"
      )
      expect(populated).toBeDefined()
      if (!populated) throw new Error("Lookup labels were not resolved")
      const cell = eidosFileValueToGridCell(
        field,
        populated[field.tableColumnName],
        false,
        populated
      )
      expect(cell).toMatchObject({
        kind: "custom",
        readonly: true,
        data: {
          kind: "eidos-file-relation-cell",
          targetTableId: composerTableId,
          values: composerIds.map((id, index) => ({
            id,
            title: ["Beethoven", "Mozart"][index],
          })),
        },
      })
      expect(eidosFileRecordFieldText(populated, field)).toBe(
        "Beethoven, Mozart"
      )
      const empty = page.rows.find((row) => row !== populated)!
      expect(eidosFileLookupListText(empty, field)).toBe("")
    } finally {
      await service.close({
        requestId: "close",
        deadlineMilliseconds: 5000,
      })
    }
  } finally {
    connection.close()
  }
}
