// @vitest-environment node

import type {
  EidosFileFieldInfo,
  EidosFileTableSnapshot,
} from "@eidos.space/eidos-file"
import {
  encodeEidosFileAttachmentPaths,
  encodeEidosFileMultiSelectValues,
  encodeEidosFileRelationIds,
} from "@eidos.space/eidos-file"

import type { EidosFileEditorDataSource } from "./data-source"
import { exportEidosFileViewCsv } from "./eidos-file-csv-export"

const now = "2026-07-23T00:00:00.000Z"
const ownerId = "018f0000-0000-7000-8000-000000000001"

function field(
  id: string,
  name: string,
  type: EidosFileFieldInfo["type"],
  position: number,
  changes: Partial<EidosFileFieldInfo> = {}
): EidosFileFieldInfo {
  return {
    id,
    tableId: "experiments",
    name,
    type,
    tableName: "Experiments",
    tableColumnName: id,
    physicalName: null,
    systemRole: null,
    nullable: true,
    isRecordLabel: id === "title",
    position,
    settings: {},
    property: null,
    storageCodec: "scalar",
    valueKind: type === "relation" ? "relation" : "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: id,
    dependsOn: null,
    ...changes,
  }
}

describe("exportEidosFileViewCsv", () => {
  it("pages the current view with its query and readable rich values", async () => {
    const title = field("title", "Experiment", "text", 0)
    const owner = field("owner", "Owner", "relation", 1, {
      storageCodec: "relation",
    })
    const tags = field("tags", "Signals", "multi-select", 2, {
      storageCodec: "json_array",
    })
    const assets = field("assets", "Assets", "file", 3, {
      storageCodec: "json_array",
    })
    const secret = field("secret", "Secret", "text", 4)
    const table: EidosFileTableSnapshot = {
      table: {
        id: "experiments",
        name: "Experiments",
        rawTableName: "tb_experiments",
        position: 0,
        icon: null,
        description: null,
        createdAt: now,
        updatedAt: now,
      },
      fields: [title, owner, tags, assets, secret],
      views: [],
      rowCount: 2,
    }
    const view = {
      id: "grid",
      name: "Grid",
      type: "grid",
      tableId: table.table.id,
      query: "",
      properties: null,
      filter: {
        type: "group" as const,
        conjunction: "and" as const,
        children: [
          {
            type: "rule" as const,
            field: "tags",
            operator: "contains" as const,
            value: "Quality",
          },
        ],
      },
      sorts: [{ field: "title", direction: "asc" as const }],
      orderMap: { owner: 0, title: 1, tags: 2, assets: 3 },
      hiddenFields: ["secret"],
      position: 0,
      createdAt: now,
      updatedAt: now,
    }
    const getPage = vi
      .fn()
      .mockResolvedValueOnce({
        tableId: table.table.id,
        offset: 0,
        limit: 1,
        total: 2,
        rows: [
          {
            _id: "row-1",
            title: 'Line "one"\nnext',
            owner: encodeEidosFileRelationIds([ownerId]),
            owner__display: JSON.stringify([
              { id: ownerId, title: "Avery, Chen" },
            ]),
            tags: encodeEidosFileMultiSelectValues(["Quality", "Speed"]),
            assets: encodeEidosFileAttachmentPaths(["assets/report.csv"]),
          },
        ],
        nextCursor: "row-1",
      })
      .mockResolvedValueOnce({
        tableId: table.table.id,
        offset: 1,
        limit: 1,
        total: 2,
        rows: [
          {
            _id: "row-2",
            title: "Second",
            owner: null,
            tags: null,
            assets: null,
          },
        ],
      })
    const result = await exportEidosFileViewCsv({
      source: { getPage } as unknown as EidosFileEditorDataSource,
      table,
      view,
      search: "launch",
      pageSize: 1,
    })

    expect(result.rowCount).toBe(2)
    expect(Array.from(result.bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(result.bytes)).toBe(
      'Owner,Experiment,Signals,Assets\r\n"Avery, Chen","Line ""one""\nnext","Quality, Speed",report.csv\r\n,Second,,\r\n'
    )
    expect(getPage).toHaveBeenNthCalledWith(
      1,
      table.table.id,
      0,
      1,
      {
        search: "launch",
        filter: view.filter,
        sorts: view.sorts,
      },
      undefined,
      undefined,
      {
        columns: ["owner", "title", "tags", "assets"],
        fieldLimit: 4,
        includeRecordLabel: false,
        includeRelationDisplays: true,
      }
    )
    expect(getPage).toHaveBeenNthCalledWith(
      2,
      table.table.id,
      1,
      1,
      expect.any(Object),
      2,
      "row-1",
      expect.any(Object)
    )
  })
})
