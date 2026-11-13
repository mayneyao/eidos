import { copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import {
  createEidosFile,
  openEidosFile,
  planEidosSchemaMergeFiles,
  normalizeEidosSchemaMergeFiles,
} from "./node-sqlite"

const directories: string[] = []
afterEach(() => {
  directories
    .splice(0)
    .forEach((directory) => rmSync(directory, { recursive: true, force: true }))
})

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "eidos-schema-phase-"))
  directories.push(directory)
  const paths = Object.fromEntries(
    ["base", "ours", "theirs", "result"].map((side) => [
      side,
      path.join(directory, `${side}.eidos`),
    ])
  ) as Record<"base" | "ours" | "theirs" | "result", string>
  const base = createEidosFile(paths.base)
  const table = base.createTable({
    name: "Projects",
    fields: [
      { name: "Title", type: "text", isRecordLabel: true },
      { name: "Owner", type: "text" },
    ],
  })
  const row = base.insertRow(table.id, { Title: "Shared", Owner: "Alex" })
  const field = base
    .listFields(table.id)
    .find((field) => field.name === "Owner")!
  base.close()
  copyFileSync(paths.base, paths.ours)
  copyFileSync(paths.base, paths.theirs)
  const ours = openEidosFile(paths.ours)
  ours.updateField(table.id, field.id, { name: "Project lead" })
  ours.updateRow(table.id, String(row._id), { "Project lead": "Blair" })
  ours.insertRow(table.id, { Title: "Local only", "Project lead": "Sam" })
  ours.close()
  const theirs = openEidosFile(paths.theirs)
  theirs.updateField(table.id, field.id, { name: "Assignee" })
  theirs.updateRow(table.id, String(row._id), { Assignee: "Avery" })
  theirs.insertRow(table.id, { Title: "Incoming only", Assignee: "Taylor" })
  theirs.close()
  copyFileSync(paths.ours, paths.result)
  const options = {
    basePath: paths.base,
    oursPath: paths.ours,
    theirsPath: paths.theirs,
    resultPath: paths.result,
    oursKey: "ours",
    theirsKey: "theirs",
    operationInstant: new Date().toISOString(),
  }
  return { paths, table, field, options }
}

it("normalizes field identity and metadata while preserving each version's own records", () => {
  const { paths, table, field, options } = fixture()
  const plan = planEidosSchemaMergeFiles(options)
  expect(plan.supported).toBe(true)
  expect(plan.fields).toMatchObject([
    {
      fieldId: field.id,
      baseName: "Owner",
      oursName: "Project lead",
      theirsName: "Assignee",
      conflicted: true,
    },
  ])
  const outcome = normalizeEidosSchemaMergeFiles({
    ...options,
    choices: [{ fieldId: field.id, result: "ours" }],
  })
  expect(outcome.outcome).toBe("merged")
  const values: string[][] = []
  const revisions: string[] = []
  for (const side of ["base", "ours", "theirs"] as const) {
    const runtime = openEidosFile(paths[side])
    try {
      expect(
        runtime.listFields(table.id).find((item) => item.id === field.id)?.name
      ).toBe("Project lead")
      expect(runtime.validate({ level: "full" }).valid).toBe(true)
      revisions.push(String(runtime.info().revision))
      values.push(
        runtime
          .queryRows(table.id, { fields: [field.id] })
          .rows.map((row) => String(row.fields[field.id]))
          .sort()
      )
    } finally {
      runtime.close()
    }
  }
  expect(values).toEqual([["Alex"], ["Blair", "Sam"], ["Avery", "Taylor"]])
  expect(new Set(revisions).size).toBe(1)
})

it("rejects missing, duplicate and foreign choices before schema mutation", () => {
  const { options, field, paths, table } = fixture()
  for (const choices of [
    [],
    [{ fieldId: "unknown", result: "ours" as const }],
    [{ fieldId: field.id, result: "merged" as unknown as "ours" }],
    [
      { fieldId: field.id, result: "ours" as const },
      { fieldId: field.id, result: "theirs" as const },
    ],
  ])
    expect(() =>
      normalizeEidosSchemaMergeFiles({ ...options, choices })
    ).toThrow()
  const runtime = openEidosFile(paths.theirs)
  expect(
    runtime.listFields(table.id).find((item) => item.id === field.id)?.name
  ).toBe("Assignee")
  runtime.close()
})

it("keeps unsupported field deletion behind an explicit migration blocker", () => {
  const { options, paths, table, field } = fixture()
  const runtime = openEidosFile(paths.ours)
  runtime.deleteField(table.id, field.id)
  runtime.close()
  const plan = planEidosSchemaMergeFiles(options)
  expect(plan.supported).toBe(false)
  expect(plan.blockers.join(" ")).toContain("migration")
})

it("returns the canonical compatible name without requiring a host-side winner rule", () => {
  const { paths, table, field, options } = fixture()
  const incoming = openEidosFile(paths.theirs)
  incoming.updateField(table.id, field.id, { name: "Owner" })
  incoming.close()
  const plan = planEidosSchemaMergeFiles(options)
  expect(plan.fields).toMatchObject([
    { fieldId: field.id, conflicted: false, mergedName: "Project lead" },
  ])
  expect(
    normalizeEidosSchemaMergeFiles({ ...options, choices: [] }).outcome
  ).toBe("merged")
})
