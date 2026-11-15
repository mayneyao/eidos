import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import type {
  EidosSyncMergeConflict,
  EidosSyncMergeStatus,
} from "../src/shared/contracts.ts"
import {
  openEidosFile,
  mergeEidosSystemMetadataFiles,
  planEidosSchemaMergeFiles,
  normalizeEidosSchemaMergeFiles,
} from "../../../packages/eidos-file/src/node-sqlite.ts"
import { EIDOS_SYSTEM_METADATA_TABLES } from "../../../packages/eidos-file/src/system-metadata-merge.ts"

// This source-only verifier uses the same explicit development override as the Demo.
process.env.NODE_ENV = "development"
const { GraftClient } = await import("../src/main/graft/graft-client.ts")
const { GraftInProcessTransport } =
  await import("../src/main/graft/graft-in-process-transport.ts")
const { loadEidosGraftSdk } =
  await import("../src/main/graft/graft-sdk-module.ts")

const runRoot = path.resolve(process.argv[2] ?? "")
if (!process.argv[2])
  throw new Error(
    "Pass a merge Demo run folder containing fixture.json and initial-state"
  )
await fs.access(path.join(runRoot, "fixture.json"))
await fs.access(path.join(runRoot, "initial-state", ".graft"))
const verification = await fs.mkdtemp(path.join(runRoot, "verification-"))
const checks: string[] = []
const paths = {
  views: "05-compatible-views.eidos",
  schema: "04-field-rename.eidos",
  rows: "03-row-conflict.eidos",
  deleted: "02-deleted-folder/README.md",
  text: "01-text-conflict.md",
}
function active(status: EidosSyncMergeStatus) {
  if (status.state !== "merging") throw new Error("Expected active merge")
  return status
}
function identity(
  conflict: EidosSyncMergeConflict
): number | Record<string, unknown> {
  const value =
    conflict.key ?? conflict.rowid ?? conflict.oursKey ?? conflict.oursRowid
  assert.notEqual(value, undefined)
  return value!
}
function inspect<T>(
  file: string,
  read: (runtime: ReturnType<typeof openEidosFile>) => T
): T {
  const runtime = openEidosFile(file, { readonly: true })
  try {
    assert.equal(runtime.validate({ level: "full" }).valid, true)
    return read(runtime)
  } finally {
    runtime.close()
  }
}
function rowsByName(runtime: ReturnType<typeof openEidosFile>, name: string) {
  const table = runtime.listTables().find((item) => item.name === name)
  assert(table)
  const fields = runtime.listFields(table.id)
  return runtime
    .queryRows(table.id)
    .rows.map((row) =>
      Object.fromEntries(
        fields.map((field) => [field.name, row.fields[field.id]])
      )
    )
}

async function scenario(name: "complete" | "abort") {
  const root = path.join(verification, name)
  await fs.cp(path.join(runRoot, "initial-state"), root, { recursive: true })
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  await graft.open(root)
  let merge = active(await graft.getMergeStatus(root))
  const semantic = async (file: string) => {
    const workspace = await graft.prepareSemanticMerge(
      root,
      file,
      "eidos.system-merge-1.0",
      EIDOS_SYSTEM_METADATA_TABLES,
      merge.stateToken
    )
    const input = (version: "base" | "ours" | "theirs") => {
      const result = workspace.inputs.find(
        (item) => item.version === version
      )?.file_path
      assert(result)
      return result
    }
    const result = mergeEidosSystemMetadataFiles({
      basePath: input("base"),
      oursPath: input("ours"),
      theirsPath: input("theirs"),
      resultPath: workspace.result_path,
      oursKey: workspace.orig_head,
      theirsKey: workspace.merge_head,
      operationInstant: new Date(workspace.prepared_at_unix_ms).toISOString(),
    })
    assert.equal(result.outcome, "merged")
    if (result.outcome !== "merged") throw new Error(JSON.stringify(result))
    merge = active(
      await graft.acceptSemanticMergeResult(
        root,
        workspace.provider_token,
        result.validation,
        result.automaticResolutions,
        merge.stateToken
      )
    )
  }
  const normalize = async (side: "ours" | "theirs") => {
    const privateRoot = await fs.mkdtemp(path.join(verification, "inputs-"))
    const inputs = {
      base: path.join(privateRoot, "base.eidos"),
      ours: path.join(privateRoot, "ours.eidos"),
      theirs: path.join(privateRoot, "theirs.eidos"),
    }
    for (const version of ["base", "ours", "theirs"] as const) {
      await graft.exportMergeSqliteVersion(
        root,
        paths.schema,
        version,
        inputs[version],
        merge.stateToken
      )
      await fs.chmod(inputs[version], 0o600)
    }
    const resultPath = path.join(privateRoot, "result.eidos")
    await fs.copyFile(inputs.ours, resultPath)
    const options = {
      basePath: inputs.base,
      oursPath: inputs.ours,
      theirsPath: inputs.theirs,
      resultPath,
      oursKey: merge.localHead,
      theirsKey: merge.hostedHead,
      operationInstant: new Date().toISOString(),
    }
    const plan = planEidosSchemaMergeFiles(options)
    assert.equal(plan.supported, true)
    const choices = plan.fields
      .filter((field) => field.conflicted)
      .map((field) => ({ fieldId: field.fieldId, result: side }))
    assert.equal(choices.length, 1)
    assert.equal(
      normalizeEidosSchemaMergeFiles({ ...options, choices }).outcome,
      "merged"
    )
    merge = active(
      await graft.normalizeMergeSqliteInputs(
        root,
        paths.schema,
        inputs,
        merge.stateToken
      )
    )
    const page = await graft.listMergeConflicts(
      root,
      paths.schema,
      merge.stateToken
    )
    assert(
      page.items.some(
        (item) =>
          item.reason === "schema_normalized" && item.status === "resolved"
      )
    )
    const row = page.items.find(
      (item) =>
        item.kind === "row" &&
        item.table === "Projects" &&
        item.status === "unresolved"
    )
    assert(row, "structure choice must retain the record conflict")
    return row
  }
  const projects = (column: string) =>
    inspect(path.join(root, paths.schema), (runtime) =>
      rowsByName(runtime, "Projects")
        .map((row) => [String(row.Project), String(row[column])])
        .sort()
    )
  try {
    await semantic(paths.views)
    merge = active(
      await graft.unresolveMergePath(root, paths.views, merge.stateToken)
    )
    await graft.close()
    await graft.open(root)
    merge = active(await graft.getMergeStatus(root))
    await semantic(paths.views)
    assert.equal(
      inspect(
        path.join(root, paths.views),
        (runtime) =>
          runtime
            .listViews(runtime.listTables()[0]!.id)
            .filter((view) => view.name === "Incoming overview").length
      ),
      1
    )
    checks.push(`${name}: automatic View merge, reopen, Undo and retry`)
    const firstSchemaRow = await normalize("ours")
    await graft.close()
    await graft.open(root)
    merge = active(await graft.getMergeStatus(root))
    assert.equal(projects("Project lead").length, 3)
    if (name === "abort") {
      await graft.abortMerge(root, merge.stateToken)
      assert.deepEqual(await graft.getMergeStatus(root), { state: "none" })
      assert.deepEqual(projects("Project lead"), [
        ["Local only", "Sam"],
        ["Sync interface", "Blair"],
      ])
      await assert.rejects(fs.stat(path.join(root, "02-deleted-folder")), {
        code: "ENOENT",
      })
      assert.match(
        await fs.readFile(path.join(root, paths.text), "utf8"),
        /Wednesday/
      )
      assert.equal(
        inspect(path.join(root, paths.views), (runtime) =>
          runtime
            .listViews(runtime.listTables()[0]!.id)
            .some((view) => view.name === "Incoming overview")
        ),
        false
      )
      checks.push(
        "abort: restored original Local schema, records, files and Views"
      )
      return
    }
    merge = active(
      await graft.resolveMergeRow(
        root,
        paths.schema,
        "Projects",
        identity(firstSchemaRow),
        "theirs",
        merge.stateToken
      )
    )
    assert.deepEqual(projects("Project lead"), [
      ["Incoming only", "Taylor"],
      ["Local only", "Sam"],
      ["Sync interface", "Avery"],
    ])
    merge = active(
      await graft.unresolveMergePath(root, paths.schema, merge.stateToken)
    )
    assert.deepEqual(projects("Project lead"), [
      ["Local only", "Sam"],
      ["Sync interface", "Blair"],
    ])
    const secondSchemaRow = await normalize("theirs")
    merge = active(
      await graft.resolveMergeRow(
        root,
        paths.schema,
        "Projects",
        identity(secondSchemaRow),
        "ours",
        merge.stateToken
      )
    )
    assert.deepEqual(projects("Assignee"), [
      ["Incoming only", "Taylor"],
      ["Local only", "Sam"],
      ["Sync interface", "Blair"],
    ])
    checks.push(
      "complete: schema then records, reopen, Undo, opposite schema and record choices; both inserted records retained"
    )

    const oldToken = merge.stateToken
    merge = active(
      await graft.setMergePathResult(
        root,
        paths.deleted,
        "ours",
        merge.stateToken
      )
    )
    await assert.rejects(fs.stat(path.join(root, "02-deleted-folder")), {
      code: "ENOENT",
    })
    await assert.rejects(
      graft.writeAndStageTextResult(
        root,
        paths.text,
        "must not be written",
        oldToken
      ),
      { code: "GRAFT_SDK_REPOSITORY_STALE" }
    )
    merge = active(
      await graft.unresolveMergePath(root, paths.deleted, merge.stateToken)
    )
    merge = active(
      await graft.setMergePathResult(
        root,
        paths.deleted,
        "theirs",
        merge.stateToken
      )
    )
    assert.match(
      await fs.readFile(path.join(root, paths.deleted), "utf8"),
      /incoming device/
    )
    checks.push(
      "complete: deleted-parent Local and Incoming choices; stale save rejected without writing"
    )

    const row = (
      await graft.listMergeConflicts(root, paths.rows, merge.stateToken)
    ).items.find((item) => item.table === "Tasks" && item.kind === "row")
    assert(row)
    merge = active(
      await graft.resolveMergeCell(
        root,
        paths.rows,
        "Tasks",
        identity(row),
        "Status",
        "ours",
        merge.stateToken
      )
    )
    merge = active(
      await graft.resolveMergeCell(
        root,
        paths.rows,
        "Tasks",
        identity(row),
        "Notes",
        "theirs",
        merge.stateToken
      )
    )
    const tasks = inspect(path.join(root, paths.rows), (runtime) =>
      rowsByName(runtime, "Tasks")
    )
    const task = tasks.find((item) => item.Title === "Review the merge UI")
    assert.equal(task?.Status, "In progress")
    assert.equal(task?.Notes, "Incoming approval")
    assert.equal(tasks.length, 2)
    const pending = (
      await graft.listMergePaths(root, merge.stateToken, { filter: "unmerged" })
    ).items
    if (pending.some((item) => item.path === paths.rows))
      await semantic(paths.rows)
    checks.push(
      "complete: independently selected cells and unchanged record retained"
    )

    const text =
      "# Verified manual merge\n\nBoth devices reviewed this result.\n"
    merge = active(
      await graft.writeAndStageTextResult(
        root,
        paths.text,
        text,
        merge.stateToken
      )
    )
    assert.equal(await fs.readFile(path.join(root, paths.text), "utf8"), text)
    assert.equal(merge.unmergedCount, 0)
    assert.deepEqual(
      await graft.continueMerge(
        root,
        "Verify complete conflict workflow",
        merge.stateToken
      ),
      { state: "none" }
    )
    await graft.close()
    await graft.open(root)
    assert.deepEqual(await graft.getMergeStatus(root), { state: "none" })
    for (const file of [paths.views, paths.schema, paths.rows])
      inspect(path.join(root, file), () => true)
    checks.push(
      "complete: manual text, Complete Merge, reopen and full canonical validation"
    )
  } finally {
    await graft.close()
  }
}
try {
  await scenario("complete")
  await scenario("abort")
  const report = {
    result: "passed",
    verification,
    sdkVersion: loadEidosGraftSdk().sdkVersion(),
    sdkOverride: process.env.EIDOS_LITE_GRAFT_SDK_PATH ?? null,
    checks,
  }
  await fs.writeFile(
    path.join(verification, "report.json"),
    JSON.stringify(report, null, 2) + "\n"
  )
  console.log(JSON.stringify(report, null, 2))
} catch (error) {
  await fs.writeFile(
    path.join(verification, "report.json"),
    JSON.stringify(
      { result: "failed", verification, checks, error: String(error) },
      null,
      2
    ) + "\n"
  )
  throw error
}
