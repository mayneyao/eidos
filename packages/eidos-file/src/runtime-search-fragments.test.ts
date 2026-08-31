import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { createEidosFile } from "./better-sqlite3"

describe("Eidos File Runtime search fragments", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  function filePath(name: string): string {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-search-fragments-"))
    roots.push(root)
    return path.join(root, name)
  }

  it("searches live Relation labels, unresolved IDs, and contextual Row-ID Lookups", () => {
    const runtime = createEidosFile(filePath("relations.eidos"), {
      defaultTable: {
        name: "Teams",
        fields: [{ name: "Name", type: "text", isRecordLabel: true }],
      },
    })
    try {
      const teams = runtime.schema()[0]!
      const teamName = teams.fields.find((field) => field.name === "Name")!
      const teamRowId = teams.fields.find((field) => field.type === "row-id")!
      const alpha = runtime.insertRow(teams.table.id, { Name: "Alpha Team" })
      const alphaId = String(alpha._id)
      const unresolvedId = "0198c72d-82b5-7000-8000-000000000099"
      const projects = runtime.createTable({
        name: "Projects",
        fields: [
          { name: "Name", type: "text", isRecordLabel: true },
          {
            name: "Teams",
            type: "relation",
            property: {
              targetTableId: teams.table.id,
              direction: "forward",
              cardinality: "many",
              onDelete: "preserve",
            },
          },
        ],
      })
      const relation = runtime
        .listFields(projects.id)
        .find((field) => field.name === "Teams")!
      const lookup = runtime.addField(projects.id, {
        name: "Team IDs",
        type: "lookup",
        property: {
          relationField: relation.id!,
          targetField: teamRowId.id!,
          aggregate: "values",
          displayType: "text",
          distinct: false,
        },
      })
      const inverse = runtime.addField(teams.table.id, {
        name: "Projects",
        type: "relation",
        property: {
          targetTableId: projects.id,
          direction: "inverse",
          sourceFieldId: relation.id!,
        },
      })
      const project = runtime.insertRow(projects.id, {
        Name: "Search project",
        Teams: JSON.stringify([alphaId, unresolvedId]),
      })

      const relationQuery = {
        search: "alpha team",
        searchFields: [relation.id!],
      }
      expect(
        runtime.listRows(projects.id, { query: relationQuery })
      ).toHaveLength(1)
      expect(runtime.countRows(projects.id, relationQuery)).toBe(1)
      expect(
        runtime.getRowIndex(projects.id, String(project._id), relationQuery)
      ).toBe(0)
      expect(
        runtime.countRowsByField(projects.id, relation.id!, relationQuery)
      ).toHaveLength(2)
      expect(
        runtime.calculateColumnStats(
          projects.id,
          [{ fieldId: relation.id!, type: "count-all" }],
          relationQuery
        )
      ).toMatchObject([{ value: 1 }])

      expect(
        runtime.listRows(projects.id, {
          query: { search: "0000000099", searchFields: [relation.id!] },
        })
      ).toHaveLength(1)
      expect(
        runtime.listRows(projects.id, {
          query: { search: "alpha", searchFields: [lookup.id!] },
        })
      ).toHaveLength(1)
      expect(
        runtime.listRows(teams.table.id, {
          query: { search: "search project", searchFields: [inverse.id!] },
        })
      ).toHaveLength(1)

      runtime.updateRow(teams.table.id, alphaId, {
        [teamName.id!]: "Delta Team",
      })
      expect(runtime.listRows(projects.id, { query: relationQuery })).toEqual(
        []
      )
      expect(
        runtime.listRows(projects.id, {
          query: { search: "delta", searchFields: [relation.id!] },
        })
      ).toHaveLength(1)
    } finally {
      runtime.close()
    }
  })

  it("uses canonical Record Label text and requires explicit Row-ID search", () => {
    const runtime = createEidosFile(filePath("record-labels.eidos"))
    try {
      const numbers = runtime.createTable({
        name: "Numbers",
        fields: [
          { name: "Amount", type: "number", isRecordLabel: true },
          { name: "Note", type: "text" },
        ],
      })
      runtime.insertRow(numbers.id, { Amount: 1e30, Note: "large" })
      expect(
        runtime.listRows(numbers.id, { query: { search: "1e+30" } })
      ).toHaveLength(1)

      const flags = runtime.createTable({
        name: "Flags",
        fields: [{ name: "Enabled", type: "checkbox", isRecordLabel: true }],
      })
      runtime.insertRow(flags.id, { Enabled: true })
      runtime.insertRow(flags.id, { Enabled: false })
      expect(
        runtime.listRows(flags.id, { query: { search: "true" } })
      ).toHaveLength(1)
      expect(
        runtime.listRows(flags.id, { query: { search: "false" } })
      ).toHaveLength(1)

      const records = runtime.createTable({
        name: "Records",
        fields: [{ name: "Name", type: "text", isRecordLabel: true }],
      })
      const record = runtime.insertRow(records.id, { Name: "Visible label" })
      const rowId = String(record._id)
      const rowIdField = runtime
        .listFields(records.id)
        .find((field) => field.type === "row-id")!
      expect(
        runtime.listRows(records.id, { query: { search: rowId } })
      ).toEqual([])
      expect(
        runtime.listRows(records.id, {
          query: { search: rowId, searchFields: [rowIdField.id!] },
        })
      ).toHaveLength(1)
    } finally {
      runtime.close()
    }
  })
})
