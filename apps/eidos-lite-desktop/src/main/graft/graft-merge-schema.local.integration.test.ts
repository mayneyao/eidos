import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import {
  createEidosFile,
  openEidosFile,
} from "@eidos.space/eidos-file/node-sqlite"
import { createEidosFileUuid } from "@eidos.space/eidos-file"

import type { EidosSyncMergeStatus } from "../../shared/contracts"
import { SpaceOperationGate } from "../space/operation-gate"
import { SpaceOperationJournal } from "../space/operation-journal"
import { GraftClient } from "./graft-client"
import { GraftInProcessTransport } from "./graft-in-process-transport"

const localSdkPath = process.env.EIDOS_LITE_GRAFT_SDK_PATH
const runMergeIntegration =
  Boolean(localSdkPath) || process.env.EIDOS_LITE_RUN_GRAFT_MERGE === "1"
const integrationDescribe = runMergeIntegration ? describe : describe.skip

type MaterializingOperation =
  | "applyMerge"
  | "setMergePathResult"
  | "resolveMergeRow"
  | "resolveMergeTable"
  | "unresolveMergePath"
  | "continueMerge"
  | "abortMerge"

interface MergeHarness {
  root: string
  source: string
  clone: string
  sourceClient: GraftClient
  cloneClient: GraftClient
  gate: SpaceOperationGate
  localHead: string
  planToken: string
  conflictedPaths: string[]
}

interface HarnessOptions {
  prefix: string
  createBase(source: string): Promise<void>
  changeHosted(source: string): Promise<void>
  changeLocal(clone: string): Promise<void>
  validateClone?(clone: string): Promise<void>
}

function client(): GraftClient {
  return new GraftClient({ sdkTransport: new GraftInProcessTransport() })
}

function mergeToken(
  status: EidosSyncMergeStatus
): Extract<EidosSyncMergeStatus, { state: "merging" }> {
  if (status.state !== "merging") throw new Error("Expected an active merge")
  return status
}

function coded(error: unknown): string | undefined {
  return error instanceof Error && "code" in error
    ? String(error.code)
    : undefined
}

async function replaceSqlite(filePath: string, sql: string): Promise<void> {
  await Promise.all(
    [filePath, `${filePath}-wal`, `${filePath}-shm`].map((candidate) =>
      fs.rm(candidate, { force: true })
    )
  )
  const database = new DatabaseSync(filePath)
  try {
    database.exec("PRAGMA journal_mode = DELETE;")
    database.exec(sql)
  } finally {
    database.close()
  }
}

async function replaceUtf16Sqlite(
  filePath: string,
  sql: string
): Promise<void> {
  await Promise.all(
    [filePath, `${filePath}-wal`, `${filePath}-shm`].map((candidate) =>
      fs.rm(candidate, { force: true })
    )
  )
  const database = new DatabaseSync(filePath)
  try {
    database.exec("PRAGMA encoding = 'UTF-16le';")
    database.exec("PRAGMA journal_mode = DELETE;")
    database.exec(sql)
  } finally {
    database.close()
  }
}

async function mutateSqlite(filePath: string, sql: string): Promise<void> {
  const database = new DatabaseSync(filePath)
  try {
    database.exec(sql)
  } finally {
    database.close()
  }
}

function sqliteSchema(filePath: string): Map<string, string> {
  const database = new DatabaseSync(filePath, { readOnly: true })
  try {
    const entries = database
      .prepare(
        `SELECT name, coalesce(sql, '') AS sql
           FROM sqlite_schema
          WHERE name NOT LIKE 'sqlite_%'
          ORDER BY name`
      )
      .all() as Array<{ name: string; sql: string }>
    return new Map(entries.map((entry) => [entry.name, entry.sql]))
  } finally {
    database.close()
  }
}

function sqliteColumns(filePath: string, table: string): string[] {
  const database = new DatabaseSync(filePath, { readOnly: true })
  try {
    return (
      (
        database
          .prepare(`PRAGMA table_xinfo(${JSON.stringify(table)})`)
          .all() as Array<{ name: string }> | undefined
      )?.map((entry) => entry.name) ?? []
    )
  } finally {
    database.close()
  }
}

async function createHarness(options: HarnessOptions): Promise<MergeHarness> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), options.prefix))
  const source = path.join(root, "source")
  const remote = path.join(root, "remote")
  const clone = path.join(root, "clone")
  const gateState = path.join(root, "gate-state")
  await Promise.all([
    fs.mkdir(source),
    fs.mkdir(remote),
    fs.mkdir(clone),
    fs.mkdir(gateState),
  ])
  const sourceClient = client()
  const cloneClient = client()
  const gate = new SpaceOperationGate(new SpaceOperationJournal(gateState), {
    closeRuntimes: async () => undefined,
    validateWorktree: async () => options.validateClone?.(clone),
    reopenRuntimes: async () => undefined,
  })

  try {
    await options.createBase(source)
    await sourceClient.open(source)
    await sourceClient.initialize(source)
    await sourceClient.stageAll(source)
    await sourceClient.commit(source, "Schema matrix base")
    const remoteUrl = `fs://${remote}`
    await sourceClient.addRemote(source, "origin", remoteUrl)
    await sourceClient.setMainUpstream(source)
    await sourceClient.push(source)
    await cloneClient.clone(clone, remoteUrl)
    await cloneClient.open(clone)

    await options.changeHosted(source)
    await sourceClient.stageAll(source)
    await sourceClient.commit(source, "Hosted schema changes")
    await sourceClient.push(source)

    await options.changeLocal(clone)
    await cloneClient.stageAll(clone)
    const local = await cloneClient.commit(clone, "Local schema changes")
    await cloneClient.fetch(clone)
    const plan = await cloneClient.planMerge(clone, "origin/main", local.id)
    expect(plan.kind).toBe("three_way")
    return {
      root,
      source,
      clone,
      sourceClient,
      cloneClient,
      gate,
      localHead: local.id,
      planToken: plan.planToken,
      conflictedPaths: plan.conflictedPaths,
    }
  } catch (error) {
    await Promise.allSettled([
      gate.close(),
      cloneClient.close(),
      sourceClient.close(),
    ])
    await fs.rm(root, { recursive: true, force: true })
    throw error
  }
}

async function closeHarness(harness: MergeHarness): Promise<void> {
  await Promise.allSettled([
    harness.gate.close(),
    harness.cloneClient.close(),
    harness.sourceClient.close(),
  ])
  await fs.rm(harness.root, { recursive: true, force: true })
}

async function materialize(
  harness: MergeHarness,
  operation: MaterializingOperation,
  run: (signal: AbortSignal) => Promise<EidosSyncMergeStatus>
): Promise<EidosSyncMergeStatus> {
  return harness.gate.withMaterialization({
    kind: `schema-matrix-${operation}`,
    beforeClose: async (signal) => {
      await expect(
        harness.cloneClient.operationMaterializesWorktree(operation, {
          signal,
        })
      ).resolves.toBe(true)
    },
    materialize: run,
  })
}

const AUTO_BASE = `
  CREATE TABLE union_columns(id TEXT PRIMARY KEY);
  CREATE TABLE same_add(id TEXT PRIMARY KEY);
  CREATE TABLE same_rename(id TEXT PRIMARY KEY, before_name TEXT);
  CREATE TABLE same_drop(id TEXT PRIMARY KEY, removed TEXT);
  CREATE TABLE same_modify(id TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE drop_entry(id TEXT PRIMARY KEY);
  CREATE TABLE support(id TEXT PRIMARY KEY, flag INTEGER, note TEXT);
`

const AUTO_LOCAL = `
  CREATE TABLE union_columns(id TEXT PRIMARY KEY, local_value TEXT);
  CREATE TABLE same_add(id TEXT PRIMARY KEY, shared INTEGER);
  CREATE TABLE same_rename(id TEXT PRIMARY KEY, after_name TEXT);
  CREATE TABLE same_drop(id TEXT PRIMARY KEY);
  CREATE TABLE same_modify(id TEXT PRIMARY KEY, value INTEGER);
  CREATE TABLE support(id TEXT PRIMARY KEY, flag INTEGER, note TEXT);
  CREATE TABLE local_table(id TEXT PRIMARY KEY);
  CREATE TABLE common_new(id TEXT PRIMARY KEY, value TEXT);
  CREATE INDEX idx_local ON support(flag);
  CREATE VIEW view_local AS SELECT id FROM support WHERE flag = 1;
  CREATE TRIGGER trigger_local AFTER INSERT ON support
  BEGIN UPDATE support SET note = 'local' WHERE id = NEW.id; END;
`

const AUTO_HOSTED = `
  CREATE TABLE union_columns(id TEXT PRIMARY KEY, hosted_value INTEGER);
  CREATE TABLE same_add(id TEXT PRIMARY KEY, shared INTEGER);
  CREATE TABLE same_rename(id TEXT PRIMARY KEY, after_name TEXT);
  CREATE TABLE same_drop(id TEXT PRIMARY KEY);
  CREATE TABLE same_modify(id TEXT PRIMARY KEY, value INTEGER);
  CREATE TABLE support(id TEXT PRIMARY KEY, flag INTEGER, note TEXT);
  CREATE TABLE hosted_table(id TEXT PRIMARY KEY);
  CREATE TABLE common_new(id TEXT PRIMARY KEY, value TEXT);
  CREATE INDEX idx_hosted ON support(note);
  CREATE VIEW view_hosted AS SELECT id FROM support WHERE flag = 2;
  CREATE TRIGGER trigger_hosted AFTER UPDATE ON support
  BEGIN UPDATE support SET note = 'hosted' WHERE id = NEW.id; END;
`

const CONFLICT_BASE = `
  CREATE TABLE rename_field(id TEXT PRIMARY KEY, Status TEXT);
  CREATE TABLE local_rename_only(id TEXT PRIMARY KEY, old_name TEXT);
  CREATE TABLE hosted_rename_only(id TEXT PRIMARY KEY, old_name TEXT);
  CREATE TABLE add_different(id TEXT PRIMARY KEY);
  CREATE TABLE drop_modify(id TEXT PRIMARY KEY, legacy TEXT, keep TEXT);
  CREATE TABLE local_drop_only(id TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE hosted_drop_only(id TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE options_table(id TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE indexed(id TEXT PRIMARY KEY, score INTEGER);
  CREATE INDEX idx_indexed_score ON indexed(score);
  CREATE TABLE viewed(id TEXT PRIMARY KEY, flag INTEGER);
  CREATE VIEW active_view AS SELECT id FROM viewed WHERE flag = 1;
  CREATE TABLE triggered(id TEXT PRIMARY KEY, note TEXT);
  CREATE TRIGGER active_trigger AFTER INSERT ON triggered
  BEGIN UPDATE triggered SET note = 'base' WHERE id = NEW.id; END;
`

const CONFLICT_LOCAL = `
  CREATE TABLE rename_field(id TEXT PRIMARY KEY, Resolution TEXT);
  CREATE TABLE local_rename_only(id TEXT PRIMARY KEY, local_name TEXT);
  CREATE TABLE hosted_rename_only(id TEXT PRIMARY KEY, old_name TEXT);
  CREATE TABLE add_different(id TEXT PRIMARY KEY, branch INTEGER);
  CREATE TABLE drop_modify(id TEXT PRIMARY KEY, keep TEXT);
  CREATE TABLE hosted_drop_only(id TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE options_table(id TEXT PRIMARY KEY, value TEXT) STRICT;
  CREATE TABLE indexed(id TEXT PRIMARY KEY, score INTEGER);
  CREATE INDEX idx_indexed_score ON indexed(score DESC);
  CREATE TABLE viewed(id TEXT PRIMARY KEY, flag INTEGER);
  CREATE VIEW active_view AS SELECT id FROM viewed WHERE flag = 2;
  CREATE TABLE triggered(id TEXT PRIMARY KEY, note TEXT);
  CREATE TRIGGER active_trigger AFTER INSERT ON triggered
  BEGIN UPDATE triggered SET note = 'local' WHERE id = NEW.id; END;
  CREATE TABLE new_collision(id TEXT PRIMARY KEY, value TEXT);
`

const CONFLICT_HOSTED = `
  CREATE TABLE rename_field(id TEXT PRIMARY KEY, State TEXT);
  CREATE TABLE local_rename_only(id TEXT PRIMARY KEY, old_name TEXT);
  CREATE TABLE hosted_rename_only(id TEXT PRIMARY KEY, hosted_name TEXT);
  CREATE TABLE add_different(id TEXT PRIMARY KEY, branch TEXT);
  CREATE TABLE drop_modify(id TEXT PRIMARY KEY, legacy INTEGER, keep TEXT);
  CREATE TABLE local_drop_only(id TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE options_table(id TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;
  CREATE TABLE indexed(id TEXT PRIMARY KEY, score INTEGER);
  CREATE UNIQUE INDEX idx_indexed_score ON indexed(score);
  CREATE TABLE viewed(id TEXT PRIMARY KEY, flag INTEGER);
  CREATE VIEW active_view AS SELECT id FROM viewed WHERE flag = 3;
  CREATE TABLE triggered(id TEXT PRIMARY KEY, note TEXT);
  CREATE TRIGGER active_trigger AFTER INSERT ON triggered
  BEGIN UPDATE triggered SET note = 'hosted' WHERE id = NEW.id; END;
  CREATE TABLE new_collision(id TEXT PRIMARY KEY, value INTEGER);
`

interface PhysicalConflictScenario {
  id: string
  entryName: string
  entryType: "table" | "index" | "view" | "trigger"
  base: string
  local: string
  hosted: string
  choice?: "ours" | "theirs"
  resultContains?: string
  resultAbsent?: boolean
}

interface IdenticalSchemaScenario {
  id: string
  entryName: string
  base: string
  result: string
  resultContains?: string
  resultAbsent?: boolean
}

interface SupportedSchemaScenario {
  id: string
  base: string
  local: string
  hosted: string
  desiredEntries: Array<{ name: string; contains: string }>
  localEntries: Array<{ name: string; contains: string }>
}

const SUPPORTED_SCHEMA_SCENARIOS: SupportedSchemaScenario[] = [
  {
    id: "SC-COL-001 Local appends one column while Hosted adds another table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, local_value TEXT);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
    desiredEntries: [
      { name: "records", contains: "local_value TEXT" },
      { name: "hosted_anchor", contains: "PRIMARY KEY" },
    ],
    localEntries: [{ name: "records", contains: "local_value TEXT" }],
  },
  {
    id: "SC-COL-001 Hosted appends one column while Local adds another table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY); CREATE TABLE local_anchor(id TEXT PRIMARY KEY);",
    hosted: "CREATE TABLE records(id TEXT PRIMARY KEY, hosted_value INTEGER);",
    desiredEntries: [
      { name: "records", contains: "hosted_value INTEGER" },
      { name: "local_anchor", contains: "PRIMARY KEY" },
    ],
    localEntries: [{ name: "local_anchor", contains: "PRIMARY KEY" }],
  },
  {
    id: "SC-COL-003 both sides append distinct columns",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, local_value TEXT);",
    hosted: "CREATE TABLE records(id TEXT PRIMARY KEY, hosted_value INTEGER);",
    desiredEntries: [
      { name: "records", contains: "local_value TEXT" },
      { name: "records", contains: "hosted_value INTEGER" },
    ],
    localEntries: [{ name: "records", contains: "local_value TEXT" }],
  },
  {
    id: "SC-ENTRY-007 both sides add different tables",
    base: "CREATE TABLE anchor(id TEXT PRIMARY KEY);",
    local:
      "CREATE TABLE anchor(id TEXT PRIMARY KEY); CREATE TABLE local_table(id TEXT PRIMARY KEY);",
    hosted:
      "CREATE TABLE anchor(id TEXT PRIMARY KEY); CREATE TABLE hosted_table(id TEXT PRIMARY KEY);",
    desiredEntries: [
      { name: "local_table", contains: "PRIMARY KEY" },
      { name: "hosted_table", contains: "PRIMARY KEY" },
    ],
    localEntries: [{ name: "local_table", contains: "PRIMARY KEY" }],
  },
  {
    id: "SC-INDEX-002 both sides add different indexes",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, local_value TEXT, hosted_value INTEGER);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, local_value TEXT, hosted_value INTEGER); CREATE INDEX idx_local ON records(local_value);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, local_value TEXT, hosted_value INTEGER); CREATE INDEX idx_hosted ON records(hosted_value);",
    desiredEntries: [
      { name: "idx_local", contains: "local_value" },
      { name: "idx_hosted", contains: "hosted_value" },
    ],
    localEntries: [{ name: "idx_local", contains: "local_value" }],
  },
  {
    id: "SC-COL-002 one side appends several columns",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, alpha TEXT, beta INTEGER);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
    desiredEntries: [
      { name: "records", contains: "alpha TEXT" },
      { name: "records", contains: "beta INTEGER" },
      { name: "hosted_anchor", contains: "PRIMARY KEY" },
    ],
    localEntries: [
      { name: "records", contains: "alpha TEXT" },
      { name: "records", contains: "beta INTEGER" },
    ],
  },
  {
    id: "SC-COL-007 overlapping compatible append sets",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, alpha TEXT);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, alpha TEXT, beta INTEGER);",
    desiredEntries: [
      { name: "records", contains: "alpha TEXT" },
      { name: "records", contains: "beta INTEGER" },
    ],
    localEntries: [{ name: "records", contains: "alpha TEXT" }],
  },
  {
    id: "SC-VIEW-001 both sides add distinct views",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW local_records AS SELECT id FROM records WHERE flag = 1;",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW hosted_records AS SELECT id FROM records WHERE flag = 2;",
    desiredEntries: [
      { name: "local_records", contains: "flag = 1" },
      { name: "hosted_records", contains: "flag = 2" },
    ],
    localEntries: [{ name: "local_records", contains: "flag = 1" }],
  },
  {
    id: "SC-TRIGGER-001 both sides add distinct triggers",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER local_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'local' WHERE id = NEW.id; END;`,
    hosted: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER hosted_update AFTER UPDATE ON records
      BEGIN UPDATE records SET value = 'hosted' WHERE id = NEW.id; END;`,
    desiredEntries: [
      { name: "local_insert", contains: "'local'" },
      { name: "hosted_update", contains: "'hosted'" },
    ],
    localEntries: [{ name: "local_insert", contains: "'local'" }],
  },
  {
    id: "SC-CROSS-001 compatible additions in different tables",
    base: "CREATE TABLE local_records(id TEXT PRIMARY KEY); CREATE TABLE hosted_records(id TEXT PRIMARY KEY);",
    local:
      "CREATE TABLE local_records(id TEXT PRIMARY KEY, local_value TEXT); CREATE TABLE hosted_records(id TEXT PRIMARY KEY);",
    hosted:
      "CREATE TABLE local_records(id TEXT PRIMARY KEY); CREATE TABLE hosted_records(id TEXT PRIMARY KEY, hosted_value INTEGER);",
    desiredEntries: [
      { name: "local_records", contains: "local_value TEXT" },
      { name: "hosted_records", contains: "hosted_value INTEGER" },
    ],
    localEntries: [{ name: "local_records", contains: "local_value TEXT" }],
  },
  {
    id: "SC-INDEX-011 index rename represented as drop and add",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_old ON records(value);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_local ON records(value);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_hosted ON records(value);",
    desiredEntries: [
      { name: "idx_local", contains: "records(value)" },
      { name: "idx_hosted", contains: "records(value)" },
    ],
    localEntries: [{ name: "idx_local", contains: "records(value)" }],
  },
]

const IDENTICAL_SCHEMA_SCENARIOS: IdenticalSchemaScenario[] = [
  {
    id: "SC-ENTRY-004 identical table creation",
    entryName: "created",
    base: "CREATE TABLE anchor(id TEXT PRIMARY KEY);",
    result:
      "CREATE TABLE anchor(id TEXT PRIMARY KEY); CREATE TABLE created(id TEXT PRIMARY KEY, value TEXT);",
    resultContains: "value TEXT",
  },
  {
    id: "SC-COL-022 identical column rename",
    entryName: "records",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, before_name TEXT);",
    result: "CREATE TABLE records(id TEXT PRIMARY KEY, after_name TEXT);",
    resultContains: "after_name TEXT",
  },
  {
    id: "SC-COL-031 identical column drop",
    entryName: "records",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, removed TEXT);",
    result: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    resultContains: "id TEXT PRIMARY KEY",
  },
  {
    id: "SC-COL-040 identical column modification",
    entryName: "records",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    result: "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER);",
    resultContains: "value INTEGER",
  },
  {
    id: "SC-TABLE-007 identical table deletion",
    entryName: "removed",
    base: "CREATE TABLE anchor(id TEXT PRIMARY KEY); CREATE TABLE removed(id TEXT PRIMARY KEY);",
    result: "CREATE TABLE anchor(id TEXT PRIMARY KEY);",
    resultAbsent: true,
  },
  {
    id: "SC-TABLE-012 identical unsupported table modification",
    entryName: "records",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    result:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT 'shared');",
    resultContains: "NOT NULL DEFAULT 'shared'",
  },
  {
    id: "SC-INDEX-003 identical index creation",
    entryName: "idx_records_value",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    result:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_records_value ON records(value);",
    resultContains: "ON records(value)",
  },
  {
    id: "SC-INDEX-006 identical index deletion",
    entryName: "idx_records_value",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_records_value ON records(value);",
    result: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    resultAbsent: true,
  },
  {
    id: "SC-INDEX-008 identical index modification",
    entryName: "idx_records_value",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_records_value ON records(value);",
    result:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE UNIQUE INDEX idx_records_value ON records(value);",
    resultContains: "UNIQUE INDEX",
  },
  {
    id: "SC-VIEW-002 identical view creation",
    entryName: "active_records",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER);",
    result:
      "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW active_records AS SELECT id FROM records WHERE flag = 1;",
    resultContains: "flag = 1",
  },
  {
    id: "SC-VIEW-005 identical view modification",
    entryName: "active_records",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW active_records AS SELECT id FROM records WHERE flag = 1;",
    result:
      "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW active_records AS SELECT id FROM records WHERE flag = 2;",
    resultContains: "flag = 2",
  },
  {
    id: "SC-VIEW-007 identical view deletion",
    entryName: "active_records",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY); CREATE VIEW active_records AS SELECT id FROM records;",
    result: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    resultAbsent: true,
  },
  {
    id: "SC-TRIGGER-002 identical trigger creation",
    entryName: "records_insert",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    result: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'shared' WHERE id = NEW.id; END;`,
    resultContains: "'shared'",
  },
  {
    id: "SC-TRIGGER-005 identical trigger modification",
    entryName: "records_insert",
    base: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'base' WHERE id = NEW.id; END;`,
    result: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'shared' WHERE id = NEW.id; END;`,
    resultContains: "'shared'",
  },
  {
    id: "SC-TRIGGER-007 identical trigger deletion",
    entryName: "records_insert",
    base: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'base' WHERE id = NEW.id; END;`,
    result: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    resultAbsent: true,
  },
  {
    id: "SC-COL-004 identical compatible column append",
    entryName: "records",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    result: "CREATE TABLE records(id TEXT PRIMARY KEY, shared TEXT);",
    resultContains: "shared TEXT",
  },
  {
    id: "SC-TABLE-021 identical table rename",
    entryName: "renamed_records",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    result: "CREATE TABLE renamed_records(id TEXT PRIMARY KEY, value TEXT);",
    resultContains: "CREATE TABLE renamed_records",
  },
]

const PHYSICAL_CONFLICT_SCENARIOS: PhysicalConflictScenario[] = [
  {
    id: "SC-COL-023 divergent column rename",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, Status TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, Resolution TEXT);",
    hosted: "CREATE TABLE records(id TEXT PRIMARY KEY, State TEXT);",
    choice: "ours",
    resultContains: "Resolution TEXT",
  },
  {
    id: "SC-COL-020 one-sided column rename",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, old_name TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, local_name TEXT);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, old_name TEXT); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
    choice: "theirs",
    resultContains: "old_name TEXT",
  },
  {
    id: "SC-COL-030 one-sided column drop",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, removed TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, removed TEXT); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
    choice: "ours",
    resultContains: "id TEXT PRIMARY KEY",
  },
  {
    id: "SC-COL-033 column drop versus modify",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, legacy TEXT, keep TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, keep TEXT);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, legacy INTEGER, keep TEXT);",
    choice: "theirs",
    resultContains: "legacy INTEGER",
  },
  {
    id: "SC-TABLE-006 one-sided table drop",
    entryName: "removed_table",
    entryType: "table",
    base: "CREATE TABLE removed_table(id TEXT PRIMARY KEY);",
    local: "CREATE TABLE local_anchor(id TEXT PRIMARY KEY);",
    hosted:
      "CREATE TABLE removed_table(id TEXT PRIMARY KEY); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
    choice: "ours",
    resultAbsent: true,
  },
  {
    id: "SC-TABLE-004 same-name new table with different definitions",
    entryName: "collision",
    entryType: "table",
    base: "CREATE TABLE anchor(id TEXT PRIMARY KEY);",
    local:
      "CREATE TABLE anchor(id TEXT PRIMARY KEY); CREATE TABLE collision(id TEXT PRIMARY KEY, value TEXT);",
    hosted:
      "CREATE TABLE anchor(id TEXT PRIMARY KEY); CREATE TABLE collision(id TEXT PRIMARY KEY, value INTEGER);",
    choice: "theirs",
    resultContains: "value INTEGER",
  },
  {
    id: "SC-TABLE-009 divergent table options",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT) STRICT;",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;",
    choice: "ours",
    resultContains: "STRICT",
  },
  {
    id: "SC-INDEX-004 divergent index definition",
    entryName: "idx_records_value",
    entryType: "index",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER); CREATE INDEX idx_records_value ON records(value);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER); CREATE INDEX idx_records_value ON records(value DESC);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER); CREATE UNIQUE INDEX idx_records_value ON records(value);",
    choice: "theirs",
    resultContains: "UNIQUE INDEX",
  },
  {
    id: "SC-VIEW-003 divergent view query",
    entryName: "active_records",
    entryType: "view",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW active_records AS SELECT id FROM records WHERE flag = 1;",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW active_records AS SELECT id FROM records WHERE flag = 2;",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW active_records AS SELECT id FROM records WHERE flag = 3;",
    choice: "ours",
    resultContains: "flag = 2",
  },
  {
    id: "SC-TRIGGER-003 divergent trigger body",
    entryName: "records_insert",
    entryType: "trigger",
    base: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'base' WHERE id = NEW.id; END;`,
    local: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'local' WHERE id = NEW.id; END;`,
    hosted: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'hosted' WHERE id = NEW.id; END;`,
    choice: "theirs",
    resultContains: "'hosted'",
  },
  {
    id: "SC-COL-006 divergent column constraints",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT COLLATE NOCASE);",
  },
  {
    id: "SC-COL-009 column reorder",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, alpha TEXT, beta TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, beta TEXT, alpha TEXT);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, alpha TEXT, beta TEXT); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-COL-010 add column plus existing-column modification",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER, local_note TEXT);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT, hosted_note TEXT);",
  },
  {
    id: "SC-COL-024 rename versus drop",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, renamed TEXT);",
    hosted: "CREATE TABLE records(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-COL-025 rename versus type modification",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, renamed TEXT);",
    hosted: "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER);",
  },
  {
    id: "SC-COL-027 each side renames a different column",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, alpha TEXT, beta TEXT);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, local_alpha TEXT, beta TEXT);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, alpha TEXT, hosted_beta TEXT);",
  },
  {
    id: "SC-COL-032 each side drops a different column",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, alpha TEXT, beta TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, beta TEXT);",
    hosted: "CREATE TABLE records(id TEXT PRIMARY KEY, alpha TEXT);",
  },
  {
    id: "SC-COL-034 one-sided affinity change",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-COL-035 one-sided nullability change",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT NOT NULL);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-COL-036 one-sided default change",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT DEFAULT 'base');",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT DEFAULT 'local');",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT DEFAULT 'base'); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-COL-037 one-sided collation change",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT COLLATE NOCASE);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-COL-038 one-sided CHECK change",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER CHECK(value >= 0));",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-COL-041 semantically equal but textually different SQL",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    hosted: "CREATE TABLE records(id text primary key, value text);",
  },
  {
    id: "SC-TABLE-008 table drop versus modify",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local: "CREATE TABLE local_anchor(id TEXT PRIMARY KEY);",
    hosted: "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER);",
  },
  {
    id: "SC-TABLE-010 divergent table constraints",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, score INTEGER);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, score INTEGER, CHECK(score >= 0));",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, score INTEGER, CHECK(score <= 100));",
  },
  {
    id: "SC-TABLE-011 composite-key part reorder",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(alpha TEXT, beta TEXT, PRIMARY KEY(alpha, beta));",
    local:
      "CREATE TABLE records(alpha TEXT, beta TEXT, PRIMARY KEY(beta, alpha));",
    hosted:
      "CREATE TABLE records(beta TEXT, alpha TEXT, PRIMARY KEY(alpha, beta));",
  },
  {
    id: "SC-INDEX-005 one-sided index deletion",
    entryName: "idx_records_value",
    entryType: "index",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_records_value ON records(value);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_records_value ON records(value); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-INDEX-007 one-sided index modification",
    entryName: "idx_records_value",
    entryType: "index",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_records_value ON records(value);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE UNIQUE INDEX idx_records_value ON records(value);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_records_value ON records(value); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-VIEW-004 one-sided view modification",
    entryName: "active_records",
    entryType: "view",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW active_records AS SELECT id FROM records WHERE flag = 1;",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW active_records AS SELECT id FROM records WHERE flag = 2;",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, flag INTEGER); CREATE VIEW active_records AS SELECT id FROM records WHERE flag = 1; CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-VIEW-006 one-sided view deletion",
    entryName: "active_records",
    entryType: "view",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY); CREATE VIEW active_records AS SELECT id FROM records;",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY); CREATE VIEW active_records AS SELECT id FROM records; CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-TRIGGER-004 one-sided trigger modification",
    entryName: "records_insert",
    entryType: "trigger",
    base: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'base' WHERE id = NEW.id; END;`,
    local: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'local' WHERE id = NEW.id; END;`,
    hosted: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'base' WHERE id = NEW.id; END;
      CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);`,
  },
  {
    id: "SC-TRIGGER-006 one-sided trigger deletion",
    entryName: "records_insert",
    entryType: "trigger",
    base: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'base' WHERE id = NEW.id; END;`,
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    hosted: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'base' WHERE id = NEW.id; END;
      CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);`,
  },
  {
    id: "SC-COL-005 same appended name with different affinity",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY, shared TEXT);",
    hosted: "CREATE TABLE records(id TEXT PRIMARY KEY, shared INTEGER);",
  },
  {
    id: "SC-COL-021 Hosted-only column rename",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, old_name TEXT);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, old_name TEXT); CREATE TABLE local_anchor(id TEXT PRIMARY KEY);",
    hosted: "CREATE TABLE records(id TEXT PRIMARY KEY, hosted_name TEXT);",
  },
  {
    id: "SC-COL-026 rename plus add-column",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, renamed TEXT, local_note TEXT);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT, hosted_note TEXT);",
  },
  {
    id: "SC-COL-039 divergent generated-column expression/storage",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER, computed INTEGER GENERATED ALWAYS AS (value * 2) VIRTUAL);",
    local:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER, computed INTEGER GENERATED ALWAYS AS (value * 3) VIRTUAL);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER, computed INTEGER GENERATED ALWAYS AS (value * 2) STORED);",
  },
  {
    id: "SC-TABLE-020 one-sided table rename",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local: "CREATE TABLE renamed_records(id TEXT PRIMARY KEY, value TEXT);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE TABLE hosted_anchor(id TEXT PRIMARY KEY);",
  },
  {
    id: "SC-TABLE-024 table rename versus modification",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);",
    local: "CREATE TABLE renamed_records(id TEXT PRIMARY KEY, value TEXT);",
    hosted: "CREATE TABLE records(id TEXT PRIMARY KEY, value INTEGER);",
  },
  {
    id: "SC-INDEX-010 index dependency meets column drop",
    entryName: "records",
    entryType: "table",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE INDEX idx_records_value ON records(value);",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE UNIQUE INDEX idx_records_value ON records(value);",
  },
  {
    id: "SC-VIEW-008 view dependency meets table modification",
    entryName: "active_records",
    entryType: "view",
    base: "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE VIEW active_records AS SELECT value FROM records;",
    local: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    hosted:
      "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE VIEW active_records AS SELECT value FROM records WHERE value IS NOT NULL;",
  },
  {
    id: "SC-TRIGGER-008 trigger dependency meets table modification",
    entryName: "records_insert",
    entryType: "trigger",
    base: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'base' WHERE id = NEW.id; END;`,
    local: "CREATE TABLE records(id TEXT PRIMARY KEY);",
    hosted: `CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);
      CREATE TRIGGER records_insert AFTER INSERT ON records
      BEGIN UPDATE records SET value = 'hosted' WHERE id = NEW.id; END;`,
  },
]

const PHYSICAL_CONFLICT_RESOLUTIONS = PHYSICAL_CONFLICT_SCENARIOS.flatMap(
  (scenario) =>
    (["ours", "theirs"] as const).map((choice) => ({
      id: scenario.id,
      scenario,
      choice,
    }))
)

function createDomainFixture(filePath: string): void {
  const runtime = createEidosFile(filePath, { title: "Schema domain matrix" })
  try {
    runtime.importTable(
      {
        name: "Incidents",
        fields: [
          { name: "Title", type: "text", isRecordLabel: true },
          { name: "Status", type: "text" },
        ],
      },
      []
    )
  } finally {
    runtime.close()
  }
}

function mutateDomain(
  filePath: string,
  options: {
    fieldName?: string
    tableName?: string
    addedFieldId?: string
  }
): void {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    const table = runtime
      .listTables()
      .find((candidate) => candidate.name === "Incidents")
    if (!table) throw new Error("Missing Incidents table")
    if (options.fieldName) {
      const field = runtime
        .listFields(table.id)
        .find((candidate) => candidate.name === "Status")
      if (!field) throw new Error("Missing Status field")
      runtime.updateField(table.id, field.id, { name: options.fieldName })
    }
    if (options.addedFieldId) {
      runtime.addField(table.id, {
        id: options.addedFieldId,
        name: "Owner",
        type: "text",
      })
    }
    if (options.tableName) {
      runtime.updateTable(table.id, { name: options.tableName })
    }
  } finally {
    runtime.close()
  }
}

function addDomainTable(filePath: string, tableId: string): void {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    runtime.importTable(
      {
        id: tableId,
        name: "Projects",
        fields: [{ name: "Name", type: "text", isRecordLabel: true }],
      },
      []
    )
  } finally {
    runtime.close()
  }
}

function addNamedDomainTable(
  filePath: string,
  tableId: string,
  name: string
): void {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    runtime.importTable(
      {
        id: tableId,
        name,
        fields: [{ name: "Name", type: "text", isRecordLabel: true }],
      },
      []
    )
  } finally {
    runtime.close()
  }
}

function addNamedDomainField(
  filePath: string,
  fieldId: string,
  name: string
): void {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    const table = runtime
      .listTables()
      .find((candidate) => candidate.name === "Incidents")!
    runtime.addField(table.id, { id: fieldId, name, type: "text" })
  } finally {
    runtime.close()
  }
}

function describeIncidents(filePath: string, description: string): void {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    const table = runtime
      .listTables()
      .find((candidate) => candidate.name === "Incidents")!
    runtime.updateTable(table.id, { description })
  } finally {
    runtime.close()
  }
}

function setDomainFieldIndex(filePath: string, enabled: boolean): string {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    const table = runtime
      .listTables()
      .find((candidate) => candidate.name === "Incidents")!
    const field = runtime
      .listFields(table.id)
      .find((candidate) => candidate.name === "Status")!
    const indexName = `eidos__index__${field.id.replaceAll("-", "")}`
    runtime.connection.exec(
      enabled
        ? `CREATE INDEX "${indexName}" ON "${table.physicalName}"("${field.physicalName}" COLLATE NOCASE)`
        : `DROP INDEX "${indexName}"`
    )
    return indexName
  } finally {
    runtime.close()
  }
}

function corruptDomainPhysicalMapping(filePath: string): void {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    const table = runtime
      .listTables()
      .find((candidate) => candidate.name === "Incidents")!
    const field = runtime
      .listFields(table.id)
      .find((candidate) => candidate.name === "Status")!
    runtime.connection.exec(
      `ALTER TABLE "${table.physicalName}" RENAME COLUMN "${field.physicalName}" TO "missing_status_column"`
    )
  } finally {
    runtime.close()
  }
}

type DomainMetadataScenarioId =
  | "SC-EIDOS-016"
  | "SC-EIDOS-020"
  | "SC-EIDOS-021"
  | "SC-EIDOS-022"
  | "SC-EIDOS-023"
  | "SC-EIDOS-024"
  | "SC-EIDOS-025"
  | "SC-EIDOS-026"

interface DomainMetadataScenario {
  id: DomainMetadataScenarioId
  label: string
  conflictTable: "eidos__fields" | "eidos__tables" | "eidos__views"
}

interface DomainStructuralScenario {
  id:
    | "SC-EIDOS-004"
    | "SC-EIDOS-006"
    | "SC-EIDOS-014"
    | "SC-EIDOS-015"
    | "SC-TABLE-025"
  label: string
  conflictTable?: "eidos__fields" | "eidos__tables"
}

const DOMAIN_STRUCTURAL_SCENARIOS: DomainStructuralScenario[] = [
  {
    id: "SC-EIDOS-004",
    label: "Table deletion",
    conflictTable: "eidos__tables",
  },
  {
    id: "SC-EIDOS-006",
    label: "Table rename versus deletion",
    conflictTable: "eidos__tables",
  },
  {
    id: "SC-EIDOS-014",
    label: "stored Field deletion",
  },
  {
    id: "SC-EIDOS-015",
    label: "stored Field deletion versus edit",
    conflictTable: "eidos__fields",
  },
  {
    id: "SC-TABLE-025",
    label: "ASCII case-only Table rename",
    conflictTable: "eidos__tables",
  },
]

interface DomainCompatibleScenario {
  id: "SC-EIDOS-001" | "SC-EIDOS-002" | "SC-EIDOS-010" | "SC-EIDOS-011"
  label: string
  changeLocal(filePath: string): void
  changeHosted(filePath: string): void
  expectedTables: string[]
  expectedFields: string[]
}

const DOMAIN_COMPATIBLE_SCENARIOS: DomainCompatibleScenario[] = [
  {
    id: "SC-EIDOS-001",
    label: "one-sided Table creation",
    changeLocal: (filePath) =>
      addNamedDomainTable(
        filePath,
        createEidosFileUuid(1_753_200_002_001),
        "Projects"
      ),
    changeHosted: (filePath) =>
      describeIncidents(filePath, "Hosted description"),
    expectedTables: ["Incidents", "Projects"],
    expectedFields: ["Title", "Status"],
  },
  {
    id: "SC-EIDOS-002",
    label: "independent Table creation",
    changeLocal: (filePath) =>
      addNamedDomainTable(
        filePath,
        createEidosFileUuid(1_753_200_002_002),
        "Projects"
      ),
    changeHosted: (filePath) =>
      addNamedDomainTable(
        filePath,
        createEidosFileUuid(1_753_200_002_003),
        "Releases"
      ),
    expectedTables: ["Incidents", "Projects", "Releases"],
    expectedFields: ["Title", "Status"],
  },
  {
    id: "SC-EIDOS-010",
    label: "one-sided stored Field creation",
    changeLocal: (filePath) =>
      addNamedDomainField(
        filePath,
        createEidosFileUuid(1_753_200_002_004),
        "Owner"
      ),
    changeHosted: (filePath) =>
      describeIncidents(filePath, "Hosted description"),
    expectedTables: ["Incidents"],
    expectedFields: ["Title", "Status", "Owner"],
  },
  {
    id: "SC-EIDOS-011",
    label: "independent stored Field creation",
    changeLocal: (filePath) =>
      addNamedDomainField(
        filePath,
        createEidosFileUuid(1_753_200_002_005),
        "Owner"
      ),
    changeHosted: (filePath) =>
      addNamedDomainField(
        filePath,
        createEidosFileUuid(1_753_200_002_006),
        "Severity"
      ),
    expectedTables: ["Incidents"],
    expectedFields: ["Title", "Status", "Owner", "Severity"],
  },
]

const DOMAIN_IDS = {
  teams: createEidosFileUuid(1_753_200_001_001),
  teamName: createEidosFileUuid(1_753_200_001_002),
  accounts: createEidosFileUuid(1_753_200_001_003),
  accountName: createEidosFileUuid(1_753_200_001_004),
  incidents: createEidosFileUuid(1_753_200_001_005),
  title: createEidosFileUuid(1_753_200_001_006),
  status: createEidosFileUuid(1_753_200_001_007),
  owner: createEidosFileUuid(1_753_200_001_008),
  formula: createEidosFileUuid(1_753_200_001_009),
  relation: createEidosFileUuid(1_753_200_001_010),
  lookup: createEidosFileUuid(1_753_200_001_011),
  board: createEidosFileUuid(1_753_200_001_012),
  timeline: createEidosFileUuid(1_753_200_001_013),
} as const

const DOMAIN_METADATA_SCENARIOS: DomainMetadataScenario[] = [
  {
    id: "SC-EIDOS-016",
    label: "stored Field type conversion",
    conflictTable: "eidos__fields",
  },
  {
    id: "SC-EIDOS-020",
    label: "Formula definition",
    conflictTable: "eidos__fields",
  },
  {
    id: "SC-EIDOS-021",
    label: "Lookup aggregate",
    conflictTable: "eidos__fields",
  },
  {
    id: "SC-EIDOS-022",
    label: "Relation target and delete policy",
    conflictTable: "eidos__fields",
  },
  {
    id: "SC-EIDOS-023",
    label: "Record Label Field",
    conflictTable: "eidos__tables",
  },
  {
    id: "SC-EIDOS-024",
    label: "Select options",
    conflictTable: "eidos__fields",
  },
  {
    id: "SC-EIDOS-025",
    label: "product View layout",
    conflictTable: "eidos__views",
  },
  {
    id: "SC-EIDOS-026",
    label: "product View ordering",
    conflictTable: "eidos__views",
  },
]

function createDomainMetadataFixture(filePath: string): void {
  const runtime = createEidosFile(filePath, { title: "Domain metadata matrix" })
  try {
    runtime.importTable(
      {
        id: DOMAIN_IDS.teams,
        name: "Teams",
        fields: [
          {
            id: DOMAIN_IDS.teamName,
            name: "Name",
            type: "text",
            isRecordLabel: true,
          },
        ],
      },
      []
    )
    runtime.importTable(
      {
        id: DOMAIN_IDS.accounts,
        name: "Accounts",
        fields: [
          {
            id: DOMAIN_IDS.accountName,
            name: "Name",
            type: "text",
            isRecordLabel: true,
          },
        ],
      },
      []
    )
    runtime.importTable(
      {
        id: DOMAIN_IDS.incidents,
        name: "Incidents",
        fields: [
          {
            id: DOMAIN_IDS.title,
            name: "Title",
            type: "text",
            isRecordLabel: true,
          },
          {
            id: DOMAIN_IDS.status,
            name: "Status",
            type: "select",
            property: {
              options: [
                { name: "Open", color: "red" },
                { name: "Closed", color: "green" },
              ],
            },
          },
          { id: DOMAIN_IDS.owner, name: "Owner", type: "text" },
          {
            id: DOMAIN_IDS.formula,
            name: "Display",
            type: "formula",
            property: { formula: '"Title"', displayType: "text" },
          },
          {
            id: DOMAIN_IDS.relation,
            name: "Team",
            type: "relation",
            property: {
              targetTableId: DOMAIN_IDS.teams,
              direction: "forward",
              cardinality: "one",
              onDelete: "restrict",
            },
          },
          {
            id: DOMAIN_IDS.lookup,
            name: "Team name",
            type: "lookup",
            property: {
              relationField: DOMAIN_IDS.relation,
              targetField: DOMAIN_IDS.teamName,
              aggregate: "first",
              displayType: "text",
            },
          },
        ],
      },
      []
    )
    runtime.createView(DOMAIN_IDS.incidents, {
      id: DOMAIN_IDS.board,
      name: "Board",
      type: "grid",
    })
    runtime.createView(DOMAIN_IDS.incidents, {
      id: DOMAIN_IDS.timeline,
      name: "Timeline",
      type: "grid",
    })
  } finally {
    runtime.close()
  }
}

function mutateDomainMetadata(
  filePath: string,
  scenario: DomainMetadataScenarioId,
  side: "local" | "hosted"
): void {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    if (scenario === "SC-EIDOS-016") {
      const field = runtime
        .listFields(DOMAIN_IDS.incidents)
        .find((candidate) => candidate.id === DOMAIN_IDS.status)!
      runtime.convertStoredFieldMetadataOnly(
        DOMAIN_IDS.status,
        side === "local" ? "text" : "url",
        field.nullable ?? false
      )
    } else if (scenario === "SC-EIDOS-020") {
      runtime.updateField(DOMAIN_IDS.incidents, DOMAIN_IDS.formula, {
        property: {
          formula:
            side === "local"
              ? "CONCAT(\"Title\", ' / Local')"
              : "CONCAT(\"Title\", ' / Hosted')",
          displayType: "text",
        },
      })
    } else if (scenario === "SC-EIDOS-021") {
      runtime.updateField(DOMAIN_IDS.incidents, DOMAIN_IDS.lookup, {
        property: {
          relationField: DOMAIN_IDS.relation,
          targetField: DOMAIN_IDS.teamName,
          aggregate: side === "local" ? "values" : "count",
          displayType: side === "local" ? "text" : "integer",
        },
      })
    } else if (scenario === "SC-EIDOS-022") {
      runtime.updateField(DOMAIN_IDS.incidents, DOMAIN_IDS.relation, {
        property: {
          targetTableId: DOMAIN_IDS.teams,
          direction: "forward",
          cardinality: side === "local" ? "many" : "one",
          onDelete: side === "local" ? "detach" : "preserve",
        },
      })
    } else if (scenario === "SC-EIDOS-023") {
      runtime.updateField(
        DOMAIN_IDS.incidents,
        side === "local" ? DOMAIN_IDS.status : DOMAIN_IDS.owner,
        { isRecordLabel: true }
      )
    } else if (scenario === "SC-EIDOS-024") {
      runtime.updateField(DOMAIN_IDS.incidents, DOMAIN_IDS.status, {
        property: {
          options:
            side === "local"
              ? [{ name: "Investigating", color: "orange" }]
              : [{ name: "Monitoring", color: "purple" }],
        },
      })
    } else if (scenario === "SC-EIDOS-025") {
      runtime.updateView(DOMAIN_IDS.board, {
        hiddenFields:
          side === "local" ? [DOMAIN_IDS.owner] : [DOMAIN_IDS.status],
      })
    } else {
      const views = runtime
        .listViews(DOMAIN_IDS.incidents)
        .map((view) => view.id)
      const defaultView = views.find(
        (id) => id !== DOMAIN_IDS.board && id !== DOMAIN_IDS.timeline
      )!
      runtime.reorderViews(
        DOMAIN_IDS.incidents,
        side === "local"
          ? [DOMAIN_IDS.timeline, DOMAIN_IDS.board, defaultView]
          : [DOMAIN_IDS.board, defaultView, DOMAIN_IDS.timeline]
      )
    }
  } finally {
    runtime.close()
  }
}

function mutateDomainStructural(
  filePath: string,
  scenario: DomainStructuralScenario["id"],
  side: "local" | "hosted"
): void {
  const runtime = openEidosFile(filePath, { readonly: false })
  try {
    const table = runtime
      .listTables()
      .find((candidate) => candidate.name === "Incidents")!
    const status = runtime
      .listFields(table.id)
      .find((candidate) => candidate.name === "Status")!
    if (scenario === "SC-TABLE-025") {
      if (side === "local") runtime.updateTable(table.id, { name: "incidents" })
      else runtime.updateTable(table.id, { description: "Hosted retained" })
    } else if (scenario === "SC-EIDOS-004") {
      if (side === "local") runtime.deleteTable(table.id)
      else runtime.updateTable(table.id, { description: "Hosted retained" })
    } else if (scenario === "SC-EIDOS-006") {
      if (side === "local")
        runtime.updateTable(table.id, { name: "Local Incidents" })
      else runtime.deleteTable(table.id)
    } else if (scenario === "SC-EIDOS-014") {
      if (side === "local") runtime.deleteField(table.id, status.id)
      else runtime.updateTable(table.id, { description: "Hosted retained" })
    } else if (side === "local") {
      runtime.deleteField(table.id, status.id)
    } else {
      runtime.updateField(table.id, status.id, { name: "Hosted Status" })
    }
  } finally {
    runtime.close()
  }
}

function domainSnapshot(filePath: string): unknown {
  const runtime = openEidosFile(filePath, { readonly: true })
  try {
    return runtime.schema().map((entry) => ({
      table: entry.table,
      fields: entry.fields,
      views: runtime.listViews(entry.table.id),
    }))
  } finally {
    runtime.close()
  }
}

function validateEidosFiles(root: string, relativePaths: string[]): void {
  for (const relativePath of relativePaths) {
    const runtime = openEidosFile(path.join(root, relativePath), {
      readonly: true,
    })
    try {
      expect(runtime.validate({ level: "full" })).toMatchObject({ valid: true })
    } finally {
      runtime.close()
    }
  }
}

function eidosNames(filePath: string): { tables: string[]; fields: string[] } {
  const runtime = openEidosFile(filePath, { readonly: true })
  try {
    const tables = runtime.listTables()
    return {
      tables: tables.map((table) => table.name),
      fields: tables.flatMap((table) =>
        runtime.listFields(table.id).map((field) => field.name)
      ),
    }
  } finally {
    runtime.close()
  }
}

function eidosFieldIds(filePath: string, fieldName: string): string[] {
  const runtime = openEidosFile(filePath, { readonly: true })
  try {
    return runtime
      .listTables()
      .flatMap((table) => runtime.listFields(table.id))
      .filter((field) => field.name === fieldName)
      .map((field) => field.id)
  } finally {
    runtime.close()
  }
}

function eidosTableIds(filePath: string, tableName: string): string[] {
  const runtime = openEidosFile(filePath, { readonly: true })
  try {
    return runtime
      .listTables()
      .filter((table) => table.name === tableName)
      .map((table) => table.id)
  } finally {
    runtime.close()
  }
}

integrationDescribe("Eidos Lite Graft schema merge matrix", () => {
  it("continues after resolving a minimal same-column definition conflict", async () => {
    const relativePath = "minimal.sqlite"
    const harness = await createHarness({
      prefix: "eidos-lite-schema-minimal-",
      createBase: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE TABLE records(id TEXT PRIMARY KEY);"
        ),
      changeHosted: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE TABLE records(id TEXT PRIMARY KEY, branch TEXT);"
        ),
      changeLocal: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE TABLE records(id TEXT PRIMARY KEY, branch INTEGER);"
        ),
    })
    try {
      let merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      expect(
        (
          await harness.cloneClient.listMergeConflicts(
            harness.clone,
            relativePath,
            merge.stateToken,
            { limit: 100 }
          )
        ).items
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "schema",
            name: "records",
            reason: "schema_modify_conflict",
          }),
        ])
      )
      merge = mergeToken(
        await materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            relativePath,
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      )
      expect(merge.unmergedCount).toBe(0)
      await expect(
        materialize(harness, "continueMerge", (signal) =>
          harness.cloneClient.continueMerge(
            harness.clone,
            "Resolve minimal schema conflict",
            merge.stateToken,
            { signal }
          )
        )
      ).resolves.toEqual({ state: "none" })
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it.each(SUPPORTED_SCHEMA_SCENARIOS)(
    "$id automatically materializes a compatible schema union",
    async (scenario) => {
      const relativePath = "supported.eidos"
      const harness = await createHarness({
        prefix: "eidos-lite-schema-supported-",
        createBase: (root) =>
          replaceSqlite(path.join(root, relativePath), scenario.base),
        changeHosted: (root) =>
          replaceSqlite(path.join(root, relativePath), scenario.hosted),
        changeLocal: (root) =>
          replaceSqlite(path.join(root, relativePath), scenario.local),
      })
      try {
        const merge = mergeToken(
          await materialize(harness, "applyMerge", (signal) =>
            harness.cloneClient.applyMerge(
              harness.clone,
              "origin/main",
              harness.localHead,
              harness.planToken,
              { signal }
            )
          )
        )
        expect(merge.unmergedCount).toBe(0)
        const [oursDiff, theirsDiff] = await Promise.all([
          harness.cloneClient.diffMergeSqlite(
            harness.clone,
            relativePath,
            "base",
            "ours",
            merge.stateToken,
            { mode: "summary" }
          ),
          harness.cloneClient.diffMergeSqlite(
            harness.clone,
            relativePath,
            "base",
            "theirs",
            merge.stateToken,
            { mode: "summary" }
          ),
        ])
        expect(oursDiff.diff.files[0]?.schemaChanges?.length).toBeGreaterThan(0)
        expect(theirsDiff.diff.files[0]?.schemaChanges?.length).toBeGreaterThan(
          0
        )
        await materialize(harness, "continueMerge", (signal) =>
          harness.cloneClient.continueMerge(
            harness.clone,
            `Combine ${scenario.id}`,
            merge.stateToken,
            { signal }
          )
        )
        const result = sqliteSchema(path.join(harness.clone, relativePath))
        for (const expected of scenario.desiredEntries) {
          expect(result.get(expected.name)).toContain(expected.contains)
        }
      } finally {
        await closeHarness(harness)
      }
    },
    120_000
  )

  it("SC-COL-008 automatically combines compatible columns in Local order", async () => {
    const relativePath = "ordered-columns.eidos"
    const localSql =
      "CREATE TABLE records(id TEXT PRIMARY KEY, alpha TEXT, beta INTEGER);"
    const harness = await createHarness({
      prefix: "eidos-lite-schema-ordered-columns-",
      createBase: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE TABLE records(id TEXT PRIMARY KEY);"
        ),
      changeLocal: (root) =>
        replaceSqlite(path.join(root, relativePath), localSql),
      changeHosted: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE TABLE records(id TEXT PRIMARY KEY, beta INTEGER, alpha TEXT);"
        ),
    })
    try {
      const merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      expect(merge.unmergedCount).toBe(0)
      await expect(
        materialize(harness, "continueMerge", (signal) =>
          harness.cloneClient.continueMerge(
            harness.clone,
            "Combine compatible columns in Local order",
            merge.stateToken,
            { signal }
          )
        )
      ).resolves.toEqual({ state: "none" })
      expect(
        sqliteSchema(path.join(harness.clone, relativePath)).get("records")
      ).toBe(localSql.replace(/;$/, ""))
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it.each(IDENTICAL_SCHEMA_SCENARIOS)(
    "$id automatically resolves identical Local and Hosted schema results",
    async (scenario) => {
      const relativePath = "identical.sqlite"
      const harness = await createHarness({
        prefix: "eidos-lite-schema-identical-",
        createBase: (root) =>
          replaceSqlite(path.join(root, relativePath), scenario.base),
        changeHosted: (root) =>
          replaceSqlite(path.join(root, relativePath), scenario.result),
        changeLocal: (root) =>
          replaceSqlite(path.join(root, relativePath), scenario.result),
      })
      try {
        expect(harness.conflictedPaths).toEqual([relativePath])
        const merge = mergeToken(
          await materialize(harness, "applyMerge", (signal) =>
            harness.cloneClient.applyMerge(
              harness.clone,
              "origin/main",
              harness.localHead,
              harness.planToken,
              { signal }
            )
          )
        )
        expect(merge.unmergedCount).toBe(0)
        await materialize(harness, "continueMerge", (signal) =>
          harness.cloneClient.continueMerge(
            harness.clone,
            `Combine ${scenario.id}`,
            merge.stateToken,
            { signal }
          )
        )
        const result = sqliteSchema(path.join(harness.clone, relativePath))
        if (scenario.resultAbsent) {
          expect(result.has(scenario.entryName)).toBe(false)
        } else {
          expect(result.get(scenario.entryName)).toContain(
            scenario.resultContains
          )
        }
      } finally {
        await closeHarness(harness)
      }
    },
    120_000
  )

  it.each(PHYSICAL_CONFLICT_RESOLUTIONS)(
    "$id classifies and preserves the complete-file $choice result",
    async ({ scenario, choice }) => {
      const relativePath = "scenario.sqlite"
      const harness = await createHarness({
        prefix: "eidos-lite-schema-scenario-",
        createBase: (root) =>
          replaceSqlite(path.join(root, relativePath), scenario.base),
        changeHosted: (root) =>
          replaceSqlite(path.join(root, relativePath), scenario.hosted),
        changeLocal: (root) =>
          replaceSqlite(path.join(root, relativePath), scenario.local),
      })
      try {
        const expectedSchema = sqliteSchema(
          path.join(
            choice === "ours" ? harness.clone : harness.source,
            relativePath
          )
        )
        expect(harness.conflictedPaths).toContain(relativePath)
        let merge = mergeToken(
          await materialize(harness, "applyMerge", (signal) =>
            harness.cloneClient.applyMerge(
              harness.clone,
              "origin/main",
              harness.localHead,
              harness.planToken,
              { signal }
            )
          )
        )
        const conflicts = await harness.cloneClient.listMergeConflicts(
          harness.clone,
          relativePath,
          merge.stateToken,
          { limit: 100 }
        )
        expect(conflicts.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "schema",
              name: scenario.entryName,
              entryType: scenario.entryType,
              status: "unresolved",
            }),
          ])
        )
        merge = mergeToken(
          await materialize(harness, "setMergePathResult", (signal) =>
            harness.cloneClient.setMergePathResult(
              harness.clone,
              relativePath,
              choice,
              merge.stateToken,
              { signal }
            )
          )
        )
        expect(merge.unmergedCount).toBe(0)
        await expect(
          materialize(harness, "continueMerge", (signal) =>
            harness.cloneClient.continueMerge(
              harness.clone,
              `Resolve ${scenario.id}`,
              merge.stateToken,
              { signal }
            )
          )
        ).resolves.toEqual({ state: "none" })

        expect(sqliteSchema(path.join(harness.clone, relativePath))).toEqual(
          expectedSchema
        )
      } finally {
        await closeHarness(harness)
      }
    },
    120_000
  )

  it.each(["ours", "theirs"] as const)(
    "preserves a complete-file %s choice for a table-to-view same-name conflict",
    async (choice) => {
      const relativePath = "type-collision.sqlite"
      const harness = await createHarness({
        prefix: "eidos-lite-schema-type-collision-",
        createBase: (root) =>
          replaceSqlite(
            path.join(root, relativePath),
            "CREATE TABLE anchor(id TEXT PRIMARY KEY);"
          ),
        changeLocal: (root) =>
          replaceSqlite(
            path.join(root, relativePath),
            "CREATE TABLE anchor(id TEXT PRIMARY KEY); CREATE TABLE collision(id TEXT PRIMARY KEY);"
          ),
        changeHosted: (root) =>
          replaceSqlite(
            path.join(root, relativePath),
            "CREATE TABLE anchor(id TEXT PRIMARY KEY); CREATE VIEW collision AS SELECT id FROM anchor;"
          ),
      })
      try {
        let merge = mergeToken(
          await materialize(harness, "applyMerge", (signal) =>
            harness.cloneClient.applyMerge(
              harness.clone,
              "origin/main",
              harness.localHead,
              harness.planToken,
              { signal }
            )
          )
        )
        expect(
          (
            await harness.cloneClient.listMergeConflicts(
              harness.clone,
              relativePath,
              merge.stateToken,
              { limit: 100 }
            )
          ).items
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "schema",
              name: "collision",
              reason: "schema_same_name_conflict",
            }),
          ])
        )
        merge = mergeToken(
          await materialize(harness, "setMergePathResult", (signal) =>
            harness.cloneClient.setMergePathResult(
              harness.clone,
              relativePath,
              choice,
              merge.stateToken,
              { signal }
            )
          )
        )
        expect(merge.unmergedCount).toBe(0)
        await expect(
          materialize(harness, "continueMerge", (signal) =>
            harness.cloneClient.continueMerge(
              harness.clone,
              "Resolve table-view collision",
              merge.stateToken,
              { signal }
            )
          )
        ).resolves.toEqual({ state: "none" })
        expect(
          sqliteSchema(path.join(harness.clone, relativePath)).get("collision")
        ).toContain(choice === "ours" ? "CREATE TABLE" : "CREATE VIEW")
      } finally {
        await closeHarness(harness)
      }
    },
    120_000
  )

  it("classifies virtual-table state as opaque and resolves only at complete-file scope", async () => {
    const relativePath = "opaque.eidos"
    const harness = await createHarness({
      prefix: "eidos-lite-schema-opaque-",
      createBase: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE VIRTUAL TABLE search USING fts5(content); INSERT INTO search VALUES ('base');"
        ),
      changeLocal: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE VIRTUAL TABLE search USING fts5(content); INSERT INTO search VALUES ('base'), ('local');"
        ),
      changeHosted: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE VIRTUAL TABLE search USING fts5(content); INSERT INTO search VALUES ('base'), ('hosted');"
        ),
    })
    try {
      let merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      const conflicts = await harness.cloneClient.listMergeConflicts(
        harness.clone,
        relativePath,
        merge.stateToken,
        { limit: 100 }
      )
      expect(conflicts.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "opaque",
            reason: "fts_shadow_table",
            owner: "search",
          }),
        ])
      )
      await expect(
        materialize(harness, "resolveMergeTable", (signal) =>
          harness.cloneClient.resolveMergeTable(
            harness.clone,
            relativePath,
            "search",
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      ).rejects.toThrow(/opaque conflicts/i)
      merge = mergeToken(
        await materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            relativePath,
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      )
      await expect(
        materialize(harness, "continueMerge", (signal) =>
          harness.cloneClient.continueMerge(
            harness.clone,
            "Resolve opaque schema path",
            merge.stateToken,
            { signal }
          )
        )
      ).resolves.toEqual({ state: "none" })

      const database = new DatabaseSync(
        path.join(harness.clone, relativePath),
        {
          readOnly: true,
        }
      )
      try {
        expect(
          database.prepare("SELECT content FROM search ORDER BY rowid").all()
        ).toEqual([{ content: "base" }, { content: "local" }])
      } finally {
        database.close()
      }
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it.each(["ours", "theirs"] as const)(
    "SC-OPAQUE-008 keeps UTF-16 SQLite recovery available with %s",
    async (choice) => {
      const relativePath = "utf16.sqlite"
      const harness = await createHarness({
        prefix: "eidos-lite-schema-utf16-",
        createBase: (root) =>
          replaceUtf16Sqlite(
            path.join(root, relativePath),
            "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT);"
          ),
        changeLocal: (root) =>
          replaceUtf16Sqlite(
            path.join(root, relativePath),
            "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT, local_note TEXT);"
          ),
        changeHosted: (root) =>
          replaceUtf16Sqlite(
            path.join(root, relativePath),
            "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT, hosted_note INTEGER);"
          ),
      })
      try {
        const expected = sqliteSchema(
          path.join(
            choice === "ours" ? harness.clone : harness.source,
            relativePath
          )
        )
        let merge = mergeToken(
          await materialize(harness, "applyMerge", (signal) =>
            harness.cloneClient.applyMerge(
              harness.clone,
              "origin/main",
              harness.localHead,
              harness.planToken,
              { signal }
            )
          )
        )
        expect(merge.unmergedCount).toBe(1)
        merge = mergeToken(
          await materialize(harness, "setMergePathResult", (signal) =>
            harness.cloneClient.setMergePathResult(
              harness.clone,
              relativePath,
              choice,
              merge.stateToken,
              { signal }
            )
          )
        )
        await materialize(harness, "continueMerge", (signal) =>
          harness.cloneClient.continueMerge(
            harness.clone,
            "Resolve UTF-16 SQLite path",
            merge.stateToken,
            { signal }
          )
        )
        expect(sqliteSchema(path.join(harness.clone, relativePath))).toEqual(
          expected
        )
      } finally {
        await closeHarness(harness)
      }
    },
    120_000
  )

  it("SC-OPAQUE-001/002/003 reports the reviewed candidate and preserves Local recovery", async () => {
    const relativePath = "sqlite-internals.sqlite"
    const harness = await createHarness({
      prefix: "eidos-lite-schema-internals-",
      createBase: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          `CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT);
           CREATE INDEX idx_records_value ON records(value);
           INSERT INTO records(id, value) VALUES (1, 'base');
           ANALYZE;`
        ),
      changeLocal: (root) =>
        mutateSqlite(
          path.join(root, relativePath),
          "INSERT INTO records(id, value) VALUES (2, 'local'); ANALYZE;"
        ),
      changeHosted: (root) =>
        mutateSqlite(
          path.join(root, relativePath),
          "INSERT INTO records(id, value) VALUES (3, 'hosted'); ANALYZE;"
        ),
    })
    try {
      let merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      expect(merge.unmergedCount).toBe(1)
      expect(
        (
          await harness.cloneClient.listMergeConflicts(
            harness.clone,
            relativePath,
            merge.stateToken,
            { limit: 100 }
          )
        ).items
      ).toEqual([
        expect.objectContaining({
          kind: "file",
          reason: "automatic_merge_available",
          recommendedAction: "apply_merge",
          recommendedResult: "merged",
        }),
      ])
      merge = mergeToken(
        await materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            relativePath,
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      )
      expect(merge.unmergedCount).toBe(0)
      await expect(
        materialize(harness, "continueMerge", (signal) =>
          harness.cloneClient.continueMerge(
            harness.clone,
            "Keep Local SQLite internal structures",
            merge.stateToken,
            { signal }
          )
        )
      ).resolves.toEqual({ state: "none" })
      const database = new DatabaseSync(
        path.join(harness.clone, relativePath),
        { readOnly: true }
      )
      try {
        expect(
          database.prepare("SELECT id, value FROM records ORDER BY id").all()
        ).toEqual([
          { id: 1, value: "base" },
          { id: 2, value: "local" },
        ])
        expect(
          database
            .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'records'")
            .get()
        ).toEqual({ seq: 2 })
        expect(
          database
            .prepare(
              "SELECT name FROM sqlite_schema WHERE type = 'index' AND name = 'idx_records_value'"
            )
            .get()
        ).toEqual({ name: "idx_records_value" })
        expect(database.prepare("PRAGMA integrity_check").get()).toEqual({
          integrity_check: "ok",
        })
        expect(
          database.prepare("SELECT count(*) AS count FROM sqlite_stat1").get()
        ).toMatchObject({ count: expect.any(Number) })
      } finally {
        database.close()
      }
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it("SC-COL-011 materializes a compatible column union through a validated rebuild", async () => {
    const relativePath = "illegal-add-column.sqlite"
    const harness = await createHarness({
      prefix: "eidos-lite-schema-illegal-add-column-",
      createBase: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE TABLE records(id TEXT PRIMARY KEY);"
        ),
      changeLocal: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE TABLE records(id TEXT PRIMARY KEY, local_value TEXT UNIQUE);"
        ),
      changeHosted: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE TABLE records(id TEXT PRIMARY KEY, hosted_value TEXT);"
        ),
    })
    try {
      const merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      expect(merge.unmergedCount).toBe(0)
      await materialize(harness, "continueMerge", (signal) =>
        harness.cloneClient.continueMerge(
          harness.clone,
          "Apply rebuilt add-column candidate",
          merge.stateToken,
          { signal }
        )
      )
      expect(
        sqliteSchema(path.join(harness.clone, relativePath)).get("records")
      ).toContain("local_value TEXT UNIQUE")
      expect(
        sqliteSchema(path.join(harness.clone, relativePath)).get("records")
      ).toContain("hosted_value TEXT")
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it("SC-COL-012/SC-INDEX-009/SC-CROSS-004 never auto-completes an invalid combined UNIQUE result", async () => {
    const relativePath = "combined-unique.sqlite"
    const harness = await createHarness({
      prefix: "eidos-lite-schema-combined-unique-",
      createBase: (root) =>
        replaceSqlite(
          path.join(root, relativePath),
          "CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); INSERT INTO records VALUES ('base', 'duplicate');"
        ),
      changeLocal: (root) =>
        mutateSqlite(
          path.join(root, relativePath),
          "CREATE UNIQUE INDEX idx_records_value ON records(value);"
        ),
      changeHosted: (root) =>
        mutateSqlite(
          path.join(root, relativePath),
          "INSERT INTO records VALUES ('hosted', 'duplicate');"
        ),
    })
    try {
      let merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      expect(merge.unmergedCount).toBe(1)
      merge = mergeToken(
        await materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            relativePath,
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      )
      await materialize(harness, "continueMerge", (signal) =>
        harness.cloneClient.continueMerge(
          harness.clone,
          "Keep valid UNIQUE result",
          merge.stateToken,
          { signal }
        )
      )
      const database = new DatabaseSync(
        path.join(harness.clone, relativePath),
        { readOnly: true }
      )
      try {
        expect(
          database.prepare("SELECT count(*) AS count FROM records").get()
        ).toEqual({ count: 1 })
        expect(
          database
            .prepare(
              "SELECT name FROM sqlite_schema WHERE type = 'index' AND name = 'idx_records_value'"
            )
            .get()
        ).toEqual({ name: "idx_records_value" })
      } finally {
        database.close()
      }
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it("SC-OPAQUE-009 refuses to stage malformed SQLite bytes without replacing the last valid commit", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-schema-malformed-")
    )
    const relativePath = "malformed.sqlite"
    const filePath = path.join(root, relativePath)
    const malformed = Buffer.from("not-sqlite-local\u0000\u0001")
    const repository = client()
    try {
      await replaceSqlite(
        filePath,
        "CREATE TABLE records(id TEXT PRIMARY KEY);"
      )
      await repository.open(root)
      await repository.initialize(root)
      await repository.stageAll(root)
      const base = await repository.commit(root, "Valid SQLite base")

      await fs.writeFile(filePath, malformed)
      await expect(repository.stageAll(root)).rejects.toMatchObject({
        code: "GRAFT_SDK_REPOSITORY_COMMAND",
        message: expect.stringContaining("graft:add:sqlite-analysis-failed"),
      })
      expect(await repository.status(root)).toMatchObject({
        currentHead: base.id,
        dirty: true,
        pathDiagnostics: [
          expect.objectContaining({
            path: relativePath,
            status: "corrupt",
            protectedByIndex: false,
          }),
        ],
      })
      expect(await fs.readFile(filePath)).toEqual(malformed)
    } finally {
      await repository.close()
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 120_000)

  it("reports the reviewed multi-entry candidate and retains complete-file recovery", async () => {
    const relativePath = "auto.eidos"
    const harness = await createHarness({
      prefix: "eidos-lite-schema-auto-",
      createBase: (root) =>
        replaceSqlite(path.join(root, relativePath), AUTO_BASE),
      changeHosted: (root) =>
        replaceSqlite(path.join(root, relativePath), AUTO_HOSTED),
      changeLocal: (root) =>
        replaceSqlite(path.join(root, relativePath), AUTO_LOCAL),
    })
    try {
      expect(harness.conflictedPaths).toEqual([relativePath])
      let merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      expect(merge.unmergedCount).toBe(1)
      expect(
        (
          await harness.cloneClient.listMergeConflicts(
            harness.clone,
            relativePath,
            merge.stateToken,
            { limit: 100 }
          )
        ).items
      ).toEqual([
        expect.objectContaining({
          kind: "file",
          reason: "automatic_merge_available",
          recommendedAction: "apply_merge",
          recommendedResult: "merged",
        }),
      ])
      const [oursDiff, theirsDiff] = await Promise.all([
        harness.cloneClient.diffMergeSqlite(
          harness.clone,
          relativePath,
          "base",
          "ours",
          merge.stateToken,
          { mode: "summary" }
        ),
        harness.cloneClient.diffMergeSqlite(
          harness.clone,
          relativePath,
          "base",
          "theirs",
          merge.stateToken,
          { mode: "summary" }
        ),
      ])
      expect(oursDiff.diff.files[0]?.schemaChanges?.length).toBeGreaterThan(0)
      expect(theirsDiff.diff.files[0]?.schemaChanges?.length).toBeGreaterThan(0)

      merge = mergeToken(
        await materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            relativePath,
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      )
      expect(merge.unmergedCount).toBe(0)
      await expect(
        materialize(harness, "continueMerge", (signal) =>
          harness.cloneClient.continueMerge(
            harness.clone,
            "Choose Local after reviewing schema candidate",
            merge.stateToken,
            { signal }
          )
        )
      ).resolves.toEqual({ state: "none" })

      const filePath = path.join(harness.clone, relativePath)
      expect(sqliteColumns(filePath, "union_columns")).toEqual([
        "id",
        "local_value",
      ])
      expect(sqliteColumns(filePath, "same_add")).toEqual(["id", "shared"])
      expect(sqliteColumns(filePath, "same_rename")).toEqual([
        "id",
        "after_name",
      ])
      expect(sqliteColumns(filePath, "same_drop")).toEqual(["id"])
      const schema = sqliteSchema(filePath)
      for (const name of [
        "local_table",
        "common_new",
        "idx_local",
        "view_local",
        "trigger_local",
      ]) {
        expect(schema.has(name), name).toBe(true)
      }
      for (const name of [
        "hosted_table",
        "idx_hosted",
        "view_hosted",
        "trigger_hosted",
      ]) {
        expect(schema.has(name), name).toBe(false)
      }
      expect(schema.has("drop_entry")).toBe(false)
      expect(schema.get("same_modify")).toContain("value INTEGER")
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it("reports every unsupported schema-conflict family and resolves complete files safely", async () => {
    const localPath = "choose-local.sqlite"
    const hostedPath = "choose-hosted.sqlite"
    const harness = await createHarness({
      prefix: "eidos-lite-schema-conflicts-",
      createBase: async (root) => {
        await Promise.all(
          [localPath, hostedPath].map((relativePath) =>
            replaceSqlite(path.join(root, relativePath), CONFLICT_BASE)
          )
        )
      },
      changeHosted: async (root) => {
        await Promise.all(
          [localPath, hostedPath].map((relativePath) =>
            replaceSqlite(path.join(root, relativePath), CONFLICT_HOSTED)
          )
        )
      },
      changeLocal: async (root) => {
        await Promise.all(
          [localPath, hostedPath].map((relativePath) =>
            replaceSqlite(path.join(root, relativePath), CONFLICT_LOCAL)
          )
        )
      },
    })
    try {
      expect(new Set(harness.conflictedPaths)).toEqual(
        new Set([localPath, hostedPath])
      )
      let merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )

      const conflicts = await harness.cloneClient.listMergeConflicts(
        harness.clone,
        localPath,
        merge.stateToken,
        { limit: 100 }
      )
      const schema = conflicts.items.filter((item) => item.kind === "schema")
      expect(new Set(schema.map((item) => item.name))).toEqual(
        new Set([
          "rename_field",
          "local_rename_only",
          "hosted_rename_only",
          "add_different",
          "drop_modify",
          "local_drop_only",
          "hosted_drop_only",
          "options_table",
          "idx_indexed_score",
          "active_view",
          "active_trigger",
          "new_collision",
        ])
      )
      expect(
        schema.find((item) => item.name === "rename_field")?.columnChanges
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            side: "ours",
            operation: "rename_column",
            from: "Status",
            to: "Resolution",
          }),
          expect.objectContaining({
            side: "theirs",
            operation: "rename_column",
            from: "Status",
            to: "State",
          }),
        ])
      )
      expect(
        schema.find((item) => item.name === "local_drop_only")
      ).toMatchObject({
        reason: "schema_delete_conflict",
        oursOperation: "deleted",
      })
      expect(
        schema.find((item) => item.name === "new_collision")
      ).toMatchObject({ reason: "schema_same_name_conflict" })

      await expect(
        materialize(harness, "resolveMergeTable", (signal) =>
          harness.cloneClient.resolveMergeTable(
            harness.clone,
            localPath,
            "rename_field",
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      ).rejects.toThrow(/schema conflicts/i)
      expect(
        mergeToken(await harness.cloneClient.getMergeStatus(harness.clone))
          .stateToken
      ).toBe(merge.stateToken)

      merge = mergeToken(
        await materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            localPath,
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      )
      const resolvedToken = merge.stateToken
      await harness.cloneClient.close()
      await harness.cloneClient.open(harness.clone)
      merge = mergeToken(
        await harness.cloneClient.getMergeStatus(harness.clone)
      )
      expect(merge.stateToken).toBe(resolvedToken)
      expect(
        (
          await harness.cloneClient.listMergeConflicts(
            harness.clone,
            localPath,
            merge.stateToken,
            { limit: 100 }
          )
        ).items
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "schema",
            status: "resolved",
            resolution: "ours",
          }),
        ])
      )

      merge = mergeToken(
        await materialize(harness, "unresolveMergePath", (signal) =>
          harness.cloneClient.unresolveMergePath(
            harness.clone,
            localPath,
            merge.stateToken,
            { signal }
          )
        )
      )
      expect(
        (
          await harness.cloneClient.listMergeConflicts(
            harness.clone,
            localPath,
            merge.stateToken,
            { limit: 100 }
          )
        ).items
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "schema", status: "unresolved" }),
        ])
      )
      merge = mergeToken(
        await materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            localPath,
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      )
      merge = mergeToken(
        await materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            hostedPath,
            "theirs",
            merge.stateToken,
            { signal }
          )
        )
      )
      expect(merge.unmergedCount).toBe(0)
      await expect(
        materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            hostedPath,
            "ours",
            resolvedToken,
            { signal }
          )
        )
      ).rejects.toSatisfy(
        (error: unknown) => coded(error) === "GRAFT_SDK_REPOSITORY_STALE"
      )
      await materialize(harness, "continueMerge", (signal) =>
        harness.cloneClient.continueMerge(
          harness.clone,
          "Resolve schema matrix",
          merge.stateToken,
          { signal }
        )
      )

      expect(
        sqliteColumns(path.join(harness.clone, localPath), "rename_field")
      ).toContain("Resolution")
      expect(
        sqliteColumns(path.join(harness.clone, hostedPath), "rename_field")
      ).toContain("State")
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it("surfaces Eidos stable-identity schema conflicts and validates both file-level choices", async () => {
    const localPath = "domain-local.eidos"
    const hostedPath = "domain-hosted.eidos"
    const localFieldId = createEidosFileUuid(1_753_100_000_001)
    const hostedFieldId = createEidosFileUuid(1_753_100_000_002)
    const harness = await createHarness({
      prefix: "eidos-lite-schema-domain-",
      createBase: async (root) => {
        createDomainFixture(path.join(root, localPath))
        createDomainFixture(path.join(root, hostedPath))
      },
      changeHosted: async (root) => {
        mutateDomain(path.join(root, localPath), {
          fieldName: "State",
          tableName: "Hosted Incidents",
          addedFieldId: hostedFieldId,
        })
        mutateDomain(path.join(root, hostedPath), {
          fieldName: "State",
          tableName: "Hosted Incidents",
          addedFieldId: hostedFieldId,
        })
      },
      changeLocal: async (root) => {
        mutateDomain(path.join(root, localPath), {
          fieldName: "Resolution",
          tableName: "Local Incidents",
          addedFieldId: localFieldId,
        })
        mutateDomain(path.join(root, hostedPath), {
          fieldName: "Resolution",
          tableName: "Local Incidents",
          addedFieldId: localFieldId,
        })
      },
      validateClone: async (root) =>
        validateEidosFiles(root, [localPath, hostedPath]),
    })
    try {
      expect(new Set(harness.conflictedPaths)).toEqual(
        new Set([localPath, hostedPath])
      )
      let merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      const conflicts = await harness.cloneClient.listMergeConflicts(
        harness.clone,
        localPath,
        merge.stateToken,
        { limit: 100 }
      )
      expect(conflicts.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "row", table: "eidos__tables" }),
          expect.objectContaining({ kind: "row", table: "eidos__fields" }),
          expect.objectContaining({
            kind: "schema",
            entryType: "trigger",
            reason: "schema_modify_conflict",
          }),
        ])
      )

      merge = mergeToken(
        await materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            localPath,
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      )
      merge = mergeToken(
        await materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            hostedPath,
            "theirs",
            merge.stateToken,
            { signal }
          )
        )
      )
      expect(merge.unmergedCount).toBe(0)
      await materialize(harness, "continueMerge", (signal) =>
        harness.cloneClient.continueMerge(
          harness.clone,
          "Resolve Eidos schema identities",
          merge.stateToken,
          { signal }
        )
      )

      validateEidosFiles(harness.clone, [localPath, hostedPath])
      expect(eidosNames(path.join(harness.clone, localPath))).toMatchObject({
        tables: expect.arrayContaining(["Local Incidents"]),
        fields: expect.arrayContaining(["Resolution", "Owner"]),
      })
      expect(eidosNames(path.join(harness.clone, hostedPath))).toMatchObject({
        tables: expect.arrayContaining(["Hosted Incidents"]),
        fields: expect.arrayContaining(["State", "Owner"]),
      })
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it.each(
    DOMAIN_METADATA_SCENARIOS.flatMap((scenario) =>
      (["ours", "theirs"] as const).map((choice) => ({
        ...scenario,
        choice,
      }))
    )
  )(
    "$id $label preserves the complete-file $choice domain result",
    async ({ id, label, conflictTable, choice }) => {
      const relativePath = "domain-metadata.eidos"
      const harness = await createHarness({
        prefix: "eidos-lite-domain-metadata-",
        createBase: async (root) =>
          createDomainMetadataFixture(path.join(root, relativePath)),
        changeLocal: async (root) =>
          mutateDomainMetadata(path.join(root, relativePath), id, "local"),
        changeHosted: async (root) =>
          mutateDomainMetadata(path.join(root, relativePath), id, "hosted"),
        validateClone: async (root) => validateEidosFiles(root, [relativePath]),
      })
      try {
        const expected = domainSnapshot(
          path.join(
            choice === "ours" ? harness.clone : harness.source,
            relativePath
          )
        )
        let merge = mergeToken(
          await materialize(harness, "applyMerge", (signal) =>
            harness.cloneClient.applyMerge(
              harness.clone,
              "origin/main",
              harness.localHead,
              harness.planToken,
              { signal }
            )
          )
        )
        const conflicts = await harness.cloneClient.listMergeConflicts(
          harness.clone,
          relativePath,
          merge.stateToken,
          { limit: 500 }
        )
        expect(conflicts.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "row",
              table: conflictTable,
              status: "unresolved",
            }),
          ])
        )

        merge = mergeToken(
          await materialize(harness, "setMergePathResult", (signal) =>
            harness.cloneClient.setMergePathResult(
              harness.clone,
              relativePath,
              choice,
              merge.stateToken,
              { signal }
            )
          )
        )
        expect(merge.unmergedCount).toBe(0)
        await expect(
          materialize(harness, "continueMerge", (signal) =>
            harness.cloneClient.continueMerge(
              harness.clone,
              `Resolve ${label}`,
              merge.stateToken,
              { signal }
            )
          )
        ).resolves.toEqual({ state: "none" })
        validateEidosFiles(harness.clone, [relativePath])
        expect(domainSnapshot(path.join(harness.clone, relativePath))).toEqual(
          expected
        )
      } finally {
        await closeHarness(harness)
      }
    },
    120_000
  )

  it.each(
    DOMAIN_STRUCTURAL_SCENARIOS.flatMap((scenario) =>
      (["ours", "theirs"] as const).map((choice) => ({
        ...scenario,
        choice,
      }))
    )
  )(
    "$id $label preserves the complete-file $choice structural result",
    async ({ id, label, conflictTable, choice }) => {
      const relativePath = "domain-structural.eidos"
      const harness = await createHarness({
        prefix: "eidos-lite-domain-structural-",
        createBase: async (root) =>
          createDomainFixture(path.join(root, relativePath)),
        changeLocal: async (root) =>
          mutateDomainStructural(path.join(root, relativePath), id, "local"),
        changeHosted: async (root) =>
          mutateDomainStructural(path.join(root, relativePath), id, "hosted"),
        validateClone: async (root) => validateEidosFiles(root, [relativePath]),
      })
      try {
        const expected = domainSnapshot(
          path.join(
            choice === "ours" ? harness.clone : harness.source,
            relativePath
          )
        )
        let merge = mergeToken(
          await materialize(harness, "applyMerge", (signal) =>
            harness.cloneClient.applyMerge(
              harness.clone,
              "origin/main",
              harness.localHead,
              harness.planToken,
              { signal }
            )
          )
        )
        const conflictItems = (
          await harness.cloneClient.listMergeConflicts(
            harness.clone,
            relativePath,
            merge.stateToken,
            { limit: 500 }
          )
        ).items
        expect(conflictItems).toEqual(
          expect.arrayContaining([
            expect.objectContaining(
              conflictTable
                ? { table: conflictTable, status: "unresolved" }
                : {
                    kind: "schema",
                    name: "Incidents",
                    status: "unresolved",
                  }
            ),
          ])
        )
        merge = mergeToken(
          await materialize(harness, "setMergePathResult", (signal) =>
            harness.cloneClient.setMergePathResult(
              harness.clone,
              relativePath,
              choice,
              merge.stateToken,
              { signal }
            )
          )
        )
        expect(merge.unmergedCount).toBe(0)
        await materialize(harness, "continueMerge", (signal) =>
          harness.cloneClient.continueMerge(
            harness.clone,
            `Resolve ${label}`,
            merge.stateToken,
            { signal }
          )
        )
        validateEidosFiles(harness.clone, [relativePath])
        expect(domainSnapshot(path.join(harness.clone, relativePath))).toEqual(
          expected
        )
      } finally {
        await closeHarness(harness)
      }
    },
    120_000
  )

  it.each(DOMAIN_COMPATIBLE_SCENARIOS)(
    "$id $label combines independent Eidos identities after resolving metadata",
    async (scenario) => {
      const relativePath = "domain-compatible.eidos"
      const harness = await createHarness({
        prefix: "eidos-lite-domain-compatible-",
        createBase: async (root) =>
          createDomainFixture(path.join(root, relativePath)),
        changeLocal: async (root) =>
          scenario.changeLocal(path.join(root, relativePath)),
        changeHosted: async (root) =>
          scenario.changeHosted(path.join(root, relativePath)),
        validateClone: async (root) => validateEidosFiles(root, [relativePath]),
      })
      try {
        let merge = mergeToken(
          await materialize(harness, "applyMerge", (signal) =>
            harness.cloneClient.applyMerge(
              harness.clone,
              "origin/main",
              harness.localHead,
              harness.planToken,
              { signal }
            )
          )
        )
        const conflicts = await harness.cloneClient.listMergeConflicts(
          harness.clone,
          relativePath,
          merge.stateToken,
          { limit: 500 }
        )
        expect(conflicts.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "row",
              table: "eidos__meta",
              key: { singleton: 1 },
            }),
          ])
        )
        for (const conflict of conflicts.items) {
          if (conflict.kind !== "row" || !conflict.table || !conflict.key)
            continue
          merge = mergeToken(
            await materialize(harness, "resolveMergeRow", (signal) =>
              harness.cloneClient.resolveMergeRow(
                harness.clone,
                relativePath,
                conflict.table!,
                conflict.key!,
                "ours",
                merge.stateToken,
                { signal }
              )
            )
          )
        }
        expect(merge.unmergedCount).toBe(0)
        await materialize(harness, "continueMerge", (signal) =>
          harness.cloneClient.continueMerge(
            harness.clone,
            `Combine ${scenario.label}`,
            merge.stateToken,
            { signal }
          )
        )
        validateEidosFiles(harness.clone, [relativePath])
        const names = eidosNames(path.join(harness.clone, relativePath))
        expect(names.tables).toEqual(
          expect.arrayContaining(scenario.expectedTables)
        )
        expect(names.fields).toEqual(
          expect.arrayContaining(scenario.expectedFields)
        )
      } finally {
        await closeHarness(harness)
      }
    },
    120_000
  )

  it("SC-EIDOS-027/028 records the Runtime validator gap for spec-permitted optional Field indexes", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-domain-index-validator-")
    )
    const filePath = path.join(root, "domain-index.eidos")
    try {
      createDomainFixture(filePath)
      const indexName = setDomainFieldIndex(filePath, true)
      expect(() => openEidosFile(filePath, { readonly: true })).toThrow(
        `Undeclared reserved SQLite object: index ${indexName}`
      )
      const database = new DatabaseSync(filePath)
      try {
        database.exec(`DROP INDEX "${indexName}"`)
      } finally {
        database.close()
      }
      validateEidosFiles(root, ["domain-index.eidos"])
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  }, 120_000)

  it("SC-EIDOS-029/SC-CROSS-006 rejects an invalid Eidos physical mapping and abort restores Local", async () => {
    const relativePath = "domain-invalid-mapping.eidos"
    const harness = await createHarness({
      prefix: "eidos-lite-domain-invalid-mapping-",
      createBase: async (root) =>
        createDomainFixture(path.join(root, relativePath)),
      changeLocal: async (root) =>
        describeIncidents(path.join(root, relativePath), "Valid Local"),
      changeHosted: async (root) =>
        corruptDomainPhysicalMapping(path.join(root, relativePath)),
      validateClone: async (root) => validateEidosFiles(root, [relativePath]),
    })
    try {
      let merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      await expect(
        materialize(harness, "setMergePathResult", (signal) =>
          harness.cloneClient.setMergePathResult(
            harness.clone,
            relativePath,
            "theirs",
            merge.stateToken,
            { signal }
          )
        )
      ).rejects.toThrow()
      merge = mergeToken(
        await harness.cloneClient.getMergeStatus(harness.clone)
      )
      await expect(
        materialize(harness, "abortMerge", (signal) =>
          harness.cloneClient.abortMerge(harness.clone, merge.stateToken, {
            signal,
          })
        )
      ).resolves.toEqual({ state: "none" })
      validateEidosFiles(harness.clone, [relativePath])
      expect(eidosNames(path.join(harness.clone, relativePath)).fields).toEqual(
        expect.arrayContaining(["Status"])
      )
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it("fails safely when independently created same-name Eidos Fields have different stable IDs", async () => {
    const relativePath = "same-name-field.eidos"
    const localFieldId = createEidosFileUuid(1_753_200_000_001)
    const hostedFieldId = createEidosFileUuid(1_753_200_000_002)
    const harness = await createHarness({
      prefix: "eidos-lite-schema-same-name-field-",
      createBase: async (root) =>
        createDomainFixture(path.join(root, relativePath)),
      changeHosted: async (root) =>
        mutateDomain(path.join(root, relativePath), {
          addedFieldId: hostedFieldId,
        }),
      changeLocal: async (root) =>
        mutateDomain(path.join(root, relativePath), {
          addedFieldId: localFieldId,
        }),
      validateClone: async (root) => validateEidosFiles(root, [relativePath]),
    })
    try {
      const merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      const conflicts = await harness.cloneClient.listMergeConflicts(
        harness.clone,
        relativePath,
        merge.stateToken,
        { limit: 100 }
      )
      const meta = conflicts.items.find(
        (conflict) =>
          conflict.kind === "row" && conflict.table === "eidos__meta"
      )
      expect(meta?.key).toEqual({ singleton: 1 })
      let observed: unknown = null
      try {
        observed = await materialize(harness, "resolveMergeRow", (signal) =>
          harness.cloneClient.resolveMergeRow(
            harness.clone,
            relativePath,
            "eidos__meta",
            meta!.key!,
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      } catch (error) {
        observed = error
      }
      expect(observed).toMatchObject({
        code: "GRAFT_SDK_REPOSITORY_COMMAND",
        message: expect.stringContaining(
          "UNIQUE constraint failed: eidos__fields.table_id, eidos__fields.physical_name"
        ),
      })

      const current = mergeToken(
        await harness.cloneClient.getMergeStatus(harness.clone)
      )
      expect(current).toMatchObject({
        stateToken: merge.stateToken,
        unmergedCount: merge.unmergedCount,
      })
      validateEidosFiles(harness.clone, [relativePath])
      expect(
        eidosFieldIds(path.join(harness.clone, relativePath), "Owner")
      ).toEqual([localFieldId])

      await expect(
        materialize(harness, "abortMerge", (signal) =>
          harness.cloneClient.abortMerge(harness.clone, current.stateToken, {
            signal,
          })
        )
      ).resolves.toEqual({ state: "none" })
      validateEidosFiles(harness.clone, [relativePath])
      expect(
        eidosFieldIds(path.join(harness.clone, relativePath), "Owner")
      ).toEqual([localFieldId])
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)

  it("fails safely when independently created same-name Eidos Tables have different stable IDs", async () => {
    const relativePath = "same-name-table.eidos"
    const localTableId = createEidosFileUuid(1_753_200_000_101)
    const hostedTableId = createEidosFileUuid(1_753_200_000_102)
    const harness = await createHarness({
      prefix: "eidos-lite-schema-same-name-table-",
      createBase: async (root) =>
        createDomainFixture(path.join(root, relativePath)),
      changeHosted: async (root) =>
        addDomainTable(path.join(root, relativePath), hostedTableId),
      changeLocal: async (root) =>
        addDomainTable(path.join(root, relativePath), localTableId),
      validateClone: async (root) => validateEidosFiles(root, [relativePath]),
    })
    try {
      const merge = mergeToken(
        await materialize(harness, "applyMerge", (signal) =>
          harness.cloneClient.applyMerge(
            harness.clone,
            "origin/main",
            harness.localHead,
            harness.planToken,
            { signal }
          )
        )
      )
      const conflicts = await harness.cloneClient.listMergeConflicts(
        harness.clone,
        relativePath,
        merge.stateToken,
        { limit: 100 }
      )
      const meta = conflicts.items.find(
        (conflict) =>
          conflict.kind === "row" && conflict.table === "eidos__meta"
      )
      expect(meta?.key).toEqual({ singleton: 1 })

      await expect(
        materialize(harness, "resolveMergeRow", (signal) =>
          harness.cloneClient.resolveMergeRow(
            harness.clone,
            relativePath,
            "eidos__meta",
            meta!.key!,
            "ours",
            merge.stateToken,
            { signal }
          )
        )
      ).rejects.toMatchObject({
        code: "GRAFT_SDK_REPOSITORY_COMMAND",
        message: expect.stringContaining("UNIQUE constraint failed"),
      })

      const current = mergeToken(
        await harness.cloneClient.getMergeStatus(harness.clone)
      )
      expect(current.stateToken).toBe(merge.stateToken)
      validateEidosFiles(harness.clone, [relativePath])
      expect(
        eidosTableIds(path.join(harness.clone, relativePath), "Projects")
      ).toEqual([localTableId])
      await expect(
        materialize(harness, "abortMerge", (signal) =>
          harness.cloneClient.abortMerge(harness.clone, current.stateToken, {
            signal,
          })
        )
      ).resolves.toEqual({ state: "none" })
    } finally {
      await closeHarness(harness)
    }
  }, 120_000)
})
