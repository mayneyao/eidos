import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import type {
  BaseFieldType,
  BaseRow,
  BaseStorageCodec,
  BaseValueKind,
} from "@eidos.space/base"
import {
  createBaseFile,
  inspectBaseFile,
  openBaseFile,
} from "@eidos.space/base/better-sqlite3"
import Database from "better-sqlite3"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

import { inspectLegacySpace } from "./better-sqlite3"
import { sanitizePathSegment } from "./planner"
import type {
  ExportLegacySpaceOptions,
  LegacyAsset,
  LegacyField,
  LegacySpaceMigrationPlan,
  LegacySpaceMigrationResult,
  LegacySpaceSnapshot,
  MigrationExportProgress,
  MigrationIssue,
} from "./types"

const BASE_FIELD_TYPES = new Set<BaseFieldType>([
  "title",
  "text",
  "number",
  "checkbox",
  "date",
  "datetime",
  "file",
  "multi-select",
  "rating",
  "select",
  "url",
  "formula",
  "link",
  "lookup",
  "created-time",
  "created-by",
  "last-edited-time",
  "last-edited-by",
  "row-id",
])

function emitProgress(
  options: ExportLegacySpaceOptions,
  progress: MigrationExportProgress
) {
  try {
    options.onProgress?.(progress)
  } catch {
    // Progress observers must never change migration correctness.
  }
}

function normalizeLookupPath(value: string): string {
  return value
    .trim()
    .replace(/^<|>$/g, "")
    .replace(/\\/g, "/")
    .replace(/^~\//, "")
    .replace(/^\.\//, "")
    .replace(/^\.eidos\//, "")
    .replace(/^files\//, "")
}

function buildAssetLookup(
  snapshot: LegacySpaceSnapshot,
  plan: LegacySpaceMigrationPlan
): Map<string, string> {
  const plannedById = new Map(plan.assets.map((asset) => [asset.id, asset]))
  const lookup = new Map<string, string>()
  const aliases = new Map<string, Set<string>>()
  const register = (source: string | null | undefined, target: string) => {
    if (!source) return
    lookup.set(normalizeLookupPath(source).toLocaleLowerCase("en-US"), target)
  }
  const registerAlias = (source: string, target: string) => {
    const key = normalizeLookupPath(source).toLocaleLowerCase("en-US")
    const targets = aliases.get(key) ?? new Set<string>()
    targets.add(target)
    aliases.set(key, targets)
  }
  for (const asset of snapshot.assets) {
    const planned = plannedById.get(asset.id)
    if (!planned) continue
    register(asset.sourceRelativePath, planned.targetPath)
    register(asset.databasePath, planned.targetPath)
    registerAlias(asset.name, planned.targetPath)
    registerAlias(
      path.posix.basename(asset.sourceRelativePath),
      planned.targetPath
    )
  }
  for (const [alias, targets] of aliases) {
    if (targets.size === 1 && !lookup.has(alias)) {
      lookup.set(alias, [...targets][0])
    }
  }
  return lookup
}

function rewriteAssetReference(
  value: string,
  lookup: Map<string, string>
): string {
  return (
    lookup.get(normalizeLookupPath(value).toLocaleLowerCase("en-US")) ?? value
  )
}

function rewriteMarkdownAssets(
  markdown: string,
  lookup: Map<string, string>
): string {
  const links = markdown.replace(
    /(!?\[[^\]]*\]\()(<[^>]+>|[^)\s]+)(\))/g,
    (_match, prefix: string, destination: string, suffix: string) => {
      const angled = destination.startsWith("<") && destination.endsWith(">")
      const raw = angled ? destination.slice(1, -1) : destination
      const rewritten = rewriteAssetReference(raw, lookup)
      return `${prefix}${angled ? `<${rewritten}>` : rewritten}${suffix}`
    }
  )
  return links.replace(
    /(!?\[\[)([^\]|]+)([^\]]*\]\])/g,
    (_match, prefix: string, destination: string, suffix: string) =>
      `${prefix}${rewriteAssetReference(destination, lookup)}${suffix}`
  )
}

function mergeDocumentProperties(
  markdown: string,
  properties: Record<string, unknown>
): { markdown: string; recovery: Record<string, unknown> | null } {
  const entries = Object.entries(properties).filter(
    ([, value]) => value !== undefined
  )
  if (entries.length === 0) return { markdown, recovery: null }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)
  if (!frontmatter) {
    return {
      markdown: `---\n${stringifyYaml(Object.fromEntries(entries)).trimEnd()}\n---\n${markdown}`,
      recovery: null,
    }
  }
  try {
    const parsed = parseYaml(frontmatter[1])
    if (
      parsed !== null &&
      (typeof parsed !== "object" || Array.isArray(parsed))
    ) {
      return { markdown, recovery: Object.fromEntries(entries) }
    }
    const merged = {
      ...((parsed as Record<string, unknown> | null) ?? {}),
      ...Object.fromEntries(entries),
    }
    return {
      markdown: `---\n${stringifyYaml(merged).trimEnd()}\n---\n${markdown.slice(frontmatter[0].length)}`,
      recovery: null,
    }
  } catch {
    return { markdown, recovery: Object.fromEntries(entries) }
  }
}

function rewriteFileValue(
  value: BaseRow[string],
  lookup: Map<string, string>
): BaseRow[string] {
  if (typeof value !== "string" || !value.trim()) return value
  const trimmed = value.trim()
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => typeof item === "string")
      ) {
        return JSON.stringify(
          parsed.map((item) => rewriteAssetReference(item, lookup))
        )
      }
    } catch {
      // Preserve malformed legacy values verbatim.
    }
  }
  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((item) => rewriteAssetReference(item.trim(), lookup))
      .join(",")
  }
  return rewriteAssetReference(trimmed, lookup)
}

function storageCodecForField(field: LegacyField): BaseStorageCodec {
  if (field.type === "multi-select") return "csv_ids"
  if (field.type === "link") return "relation"
  if (field.type === "formula" || field.type === "lookup") {
    return "materialized_text"
  }
  return "scalar"
}

function valueKindForField(field: LegacyField): BaseValueKind {
  if (field.type === "row-id" || field.columnName.startsWith("_")) {
    return "system"
  }
  if (field.type === "link") return "relation"
  if (field.type === "formula" || field.type === "lookup") {
    return "materialized"
  }
  return "source"
}

function assertFieldType(field: LegacyField): BaseFieldType {
  if (!BASE_FIELD_TYPES.has(field.type as BaseFieldType)) {
    throw new Error(
      `Unsupported legacy field type ${field.type} for ${field.tableName}.${field.columnName}`
    )
  }
  return field.type as BaseFieldType
}

function isInside(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate)
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

function resolveOutputPath(root: string, relativePath: string): string {
  const resolved = path.resolve(root, ...relativePath.split("/"))
  if (!isInside(root, resolved)) {
    throw new Error(
      `Migration output escapes the target Space: ${relativePath}`
    )
  }
  return resolved
}

async function assertEmptyOrMissingDirectory(
  targetRoot: string
): Promise<void> {
  try {
    const entries = await readdir(targetRoot)
    if (entries.length > 0) {
      throw new Error(`Migration target must be empty: ${targetRoot}`)
    }
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return
    }
    throw error
  }
}

async function removeEmptyDirectoryIfPresent(
  targetRoot: string
): Promise<void> {
  try {
    await rmdir(targetRoot)
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return
    }
    throw error
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function createMigrationId(value?: string): string {
  const migrationId =
    value ?? new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z")
  if (!/^[A-Za-z0-9._-]+$/.test(migrationId)) {
    throw new Error(`Invalid migration ID: ${migrationId}`)
  }
  return migrationId
}

function sourceTableId(rawTableName: string): string {
  if (!rawTableName.startsWith("tb_")) {
    throw new Error(`Invalid legacy table name: ${rawTableName}`)
  }
  return rawTableName.slice(3)
}

function serializeReport(result: LegacySpaceMigrationResult): string {
  const warnings = result.issues.filter((issue) => issue.severity === "warning")
  const errors = result.issues.filter((issue) => issue.severity === "error")
  const issueLines = result.issues.length
    ? result.issues.map(
        (issue) =>
          `- **${issue.severity.toUpperCase()} · ${issue.code}** — ${issue.message}`
      )
    : ["- None"]
  return `# Eidos Space migration report

- Status: completed
- Migration ID: \`${result.migrationId}\`
- Source: \`${result.sourceRoot}\`
- Source database: \`${result.sourceDatabasePath}\`
- Target: \`${result.targetRoot}\`
- Documents: ${result.exportedDocumentCount}
- Tables: ${result.exportedTableCount}
- Rows: ${result.exportedRowCount}
- Fields: ${result.exportedFieldCount}
- Views: ${result.exportedViewCount}
- References: ${result.exportedReferenceCount}
- Assets copied: ${result.copiedAssetCount}
- Lexical recovery files: ${result.recoveredLexicalDocumentCount}
- Warnings: ${warnings.length}
- Errors: ${errors.length}

## Validation

- Base valid: ${result.validation.baseValid ? "yes" : "no"}
- Document count matches: ${result.validation.documentCountMatches ? "yes" : "no"}
- Table count matches: ${result.validation.tableCountMatches ? "yes" : "no"}
- Row count matches: ${result.validation.rowCountMatches ? "yes" : "no"}
- Field count matches: ${result.validation.fieldCountMatches ? "yes" : "no"}
- View count matches: ${result.validation.viewCountMatches ? "yes" : "no"}
- Reference count matches: ${result.validation.referenceCountMatches ? "yes" : "no"}
- Asset count matches: ${result.validation.assetCountMatches ? "yes" : "no"}
- Copied assets exist: ${result.validation.copiedAssetsExist ? "yes" : "no"}

## Issues

${issueLines.join("\n")}
`
}

function assertSourceUnchanged(
  plan: LegacySpaceMigrationPlan,
  snapshot: LegacySpaceSnapshot
) {
  if (
    plan.sourceRoot !== snapshot.sourceRoot ||
    plan.sourceDatabasePath !== snapshot.databasePath ||
    JSON.stringify(plan.sourceFingerprint) !==
      JSON.stringify(snapshot.sourceFingerprint)
  ) {
    throw new Error(
      "Legacy Space changed after the migration plan was created; inspect it again before exporting"
    )
  }
}

function tableRows(
  database: Database.Database,
  rawTableName: string,
  offset: number,
  limit: number
): BaseRow[] {
  const quoted = `"${rawTableName.replace(/"/g, '""')}"`
  return database
    .prepare(`SELECT * FROM ${quoted} ORDER BY rowid LIMIT ? OFFSET ?`)
    .all(limit, offset) as BaseRow[]
}

function buildAssetSourcePath(sourceRoot: string, asset: LegacyAsset): string {
  return path.join(
    sourceRoot,
    ".eidos",
    "files",
    ...asset.sourceRelativePath.split("/")
  )
}

export async function exportLegacySpace(
  plan: LegacySpaceMigrationPlan,
  options: ExportLegacySpaceOptions = {}
): Promise<LegacySpaceMigrationResult> {
  if (plan.issues.some((issue) => issue.severity === "error")) {
    throw new Error(
      "Migration plan has errors; resolve them before exporting the legacy Space"
    )
  }
  const migrationId = createMigrationId(options.migrationId)
  const sourceRoot = path.resolve(plan.sourceRoot)
  const targetRoot = path.resolve(plan.targetRoot)
  if (
    sourceRoot === targetRoot ||
    isInside(sourceRoot, targetRoot) ||
    isInside(targetRoot, sourceRoot)
  ) {
    throw new Error("Migration source and target Spaces must not overlap")
  }
  await assertEmptyOrMissingDirectory(targetRoot)
  const snapshot = inspectLegacySpace(sourceRoot, {
    databasePath: plan.sourceDatabasePath,
  })
  assertSourceUnchanged(plan, snapshot)
  const snapshotTables = new Map(
    snapshot.tables.map((table) => [table.id, table])
  )
  const snapshotDocuments = new Map(
    snapshot.documents.map((document) => [document.id, document])
  )
  const assetLookup = buildAssetLookup(snapshot, plan)
  const targetParent = path.dirname(targetRoot)
  await mkdir(targetParent, { recursive: true })
  const stagingRoot = await mkdtemp(
    path.join(
      targetParent,
      `.${path.basename(targetRoot)}.eidos-migration-${migrationId}-`
    )
  )
  emitProgress(options, { phase: "preparing", completed: 0, total: 1 })

  const issues: MigrationIssue[] = [...plan.issues]
  let exportedDocumentCount = 0
  let recoveredLexicalDocumentCount = 0
  let copiedAssetCount = 0
  let exportedRowCount = 0
  let exportedFieldCount = 0
  let exportedViewCount = 0
  let baseRuntime: ReturnType<typeof createBaseFile> | null = null
  let sourceDatabase: Database.Database | null = null
  try {
    for (const [index, document] of plan.documents.entries()) {
      const sourceDocument = snapshotDocuments.get(document.id)
      if (!sourceDocument) {
        throw new Error(
          `Legacy document disappeared after planning: ${document.id}`
        )
      }
      const outputPath = resolveOutputPath(stagingRoot, document.targetPath)
      await mkdir(path.dirname(outputPath), { recursive: true })
      let markdown = sourceDocument.markdown
      if (markdown === null) {
        const recoveryName = `${sanitizePathSegment(document.id)}.lexical.json`
        markdown = `<!-- Eidos migration: Markdown was unavailable. The original Lexical state is preserved in .eidos/migration/${migrationId}/recovery/${recoveryName}. -->\n`
        const recoveryPath = resolveOutputPath(
          stagingRoot,
          `.eidos/migration/${migrationId}/recovery/${recoveryName}`
        )
        await mkdir(path.dirname(recoveryPath), { recursive: true })
        await writeFile(
          recoveryPath,
          sourceDocument.lexicalState ?? "null",
          "utf8"
        )
        recoveredLexicalDocumentCount += 1
      }
      const mergedProperties = mergeDocumentProperties(
        markdown,
        sourceDocument.properties
      )
      markdown = mergedProperties.markdown
      if (mergedProperties.recovery) {
        const recoveryName = `${sanitizePathSegment(document.id)}.properties.json`
        const recoveryPath = resolveOutputPath(
          stagingRoot,
          `.eidos/migration/${migrationId}/recovery/${recoveryName}`
        )
        await mkdir(path.dirname(recoveryPath), { recursive: true })
        await writeFile(
          recoveryPath,
          `${JSON.stringify(mergedProperties.recovery, null, 2)}\n`,
          "utf8"
        )
        issues.push({
          severity: "warning",
          code: "document-properties-recovered",
          message: `Document ${document.sourceName} has invalid frontmatter; current properties were preserved in ${recoveryName}`,
          sourceId: document.id,
        })
      }
      await writeFile(
        outputPath,
        rewriteMarkdownAssets(markdown, assetLookup),
        "utf8"
      )
      exportedDocumentCount += 1
      emitProgress(options, {
        phase: "documents",
        completed: index + 1,
        total: plan.documents.length,
        currentPath: document.targetPath,
      })
    }

    const baseOutputPath = resolveOutputPath(stagingRoot, plan.basePath)
    await mkdir(path.dirname(baseOutputPath), { recursive: true })
    baseRuntime = createBaseFile(baseOutputPath, {
      title: path.basename(sourceRoot),
    })
    sourceDatabase = new Database(plan.sourceDatabasePath, {
      fileMustExist: true,
      readonly: true,
    })
    sourceDatabase.pragma("query_only = ON")
    sourceDatabase.exec("BEGIN")
    for (const [tableIndex, plannedTable] of plan.tables.entries()) {
      const sourceTable = snapshotTables.get(plannedTable.id)
      if (!sourceTable) {
        throw new Error(
          `Legacy table disappeared after planning: ${plannedTable.id}`
        )
      }
      baseRuntime.createTable({
        id: sourceTable.id,
        name: sourceTable.name,
        icon: sourceTable.icon ?? undefined,
        createDefaultView: false,
      })
      for (const field of sourceTable.fields) {
        const type = assertFieldType(field)
        baseRuntime.importField(sourceTable.id, {
          name: field.name,
          columnName: field.columnName,
          type,
          property: field.property,
          storageCodec: storageCodecForField(field),
          valueKind: valueKindForField(field),
          isHidden:
            field.columnName === "_id" || field.columnName.startsWith("_"),
          isDerived: field.type === "formula" || field.type === "lookup",
          dependsOn: field.property?.dependsOn,
        })
        exportedFieldCount += 1
      }
      for (const view of sourceTable.views) {
        baseRuntime.createView(sourceTable.id, {
          id: view.id,
          name: view.name,
          type: view.type,
          query: view.query,
          properties: view.properties,
          filter: view.filter,
          orderMap: view.orderMap,
          hiddenFields: view.hiddenFields,
          position: view.position,
        })
        exportedViewCount += 1
      }
      const fileColumns = new Set(
        sourceTable.fields
          .filter((field) => field.type === "file")
          .map((field) => field.columnName)
      )
      const batchSize = Math.min(
        2_000,
        Math.max(1, Math.trunc(options.rowBatchSize ?? 500))
      )
      for (let offset = 0; offset < sourceTable.rowCount; offset += batchSize) {
        const rows = tableRows(
          sourceDatabase,
          sourceTable.rawTableName,
          offset,
          batchSize
        )
        const rewrittenRows = rows.map((row) => {
          const rewritten = { ...row }
          for (const columnName of fileColumns) {
            rewritten[columnName] = rewriteFileValue(
              rewritten[columnName],
              assetLookup
            )
          }
          return rewritten
        })
        baseRuntime.insertImportedRows(sourceTable.id, rewrittenRows)
        exportedRowCount += rewrittenRows.length
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
      emitProgress(options, {
        phase: "tables",
        completed: tableIndex + 1,
        total: plan.tables.length,
        currentPath: `${plan.basePath}#${sourceTable.id}`,
      })
    }
    for (const sourceTable of snapshot.tables) {
      for (const reference of sourceTable.references) {
        baseRuntime.createReference({
          selfTableId: sourceTableId(reference.selfTableName),
          selfColumnName: reference.selfColumnName,
          refTableId: sourceTableId(reference.refTableName),
          refColumnName: reference.refColumnName,
          linkTableId: sourceTableId(reference.linkTableName),
          linkColumnName: reference.linkColumnName,
        })
      }
    }
    sourceDatabase.exec("COMMIT")
    sourceDatabase.close()
    sourceDatabase = null
    baseRuntime.close()
    baseRuntime = null

    const snapshotAssets = new Map(
      snapshot.assets.map((asset) => [asset.id, asset])
    )
    for (const [index, plannedAsset] of plan.assets.entries()) {
      const sourceAsset = snapshotAssets.get(plannedAsset.id)
      if (!sourceAsset || !sourceAsset.exists) continue
      const outputPath = resolveOutputPath(stagingRoot, plannedAsset.targetPath)
      await mkdir(path.dirname(outputPath), { recursive: true })
      await copyFile(buildAssetSourcePath(sourceRoot, sourceAsset), outputPath)
      copiedAssetCount += 1
      emitProgress(options, {
        phase: "assets",
        completed: index + 1,
        total: plan.assets.length,
        currentPath: plannedAsset.targetPath,
      })
    }

    emitProgress(options, { phase: "validating", completed: 0, total: 1 })
    const baseInspection = inspectBaseFile(baseOutputPath)
    const validationBase = openBaseFile(baseOutputPath, { readonly: true })
    const outputTables = validationBase.listTables()
    const actualRowCount = outputTables.reduce(
      (count, table) => count + validationBase.countRows(table.id),
      0
    )
    const expectedFields = snapshot.tables.flatMap((table) =>
      table.fields.map((field) => `${table.id}.${field.columnName}`)
    )
    const outputFields = new Set(
      outputTables.flatMap((table) =>
        validationBase
          .listFields(table.id)
          .map((field) => `${table.id}.${field.tableColumnName}`)
      )
    )
    const actualViewCount = outputTables.reduce(
      (count, table) => count + validationBase.listViews(table.id).length,
      0
    )
    const actualReferenceCount = Number(
      validationBase.connection.get<{ count: number | bigint }>(
        "SELECT COUNT(*) AS count FROM eidos__references"
      )?.count ?? 0
    )
    validationBase.close()
    const copiedAssetsExist = (
      await Promise.all(
        plan.assets
          .filter((asset) => asset.exists)
          .map(async (asset) => {
            const sourceAsset = snapshotAssets.get(asset.id)
            if (!sourceAsset) return false
            const sourcePath = buildAssetSourcePath(sourceRoot, sourceAsset)
            const outputPath = resolveOutputPath(stagingRoot, asset.targetPath)
            if (!(await fileExists(outputPath))) return false
            const [sourceStats, outputStats] = await Promise.all([
              stat(sourcePath),
              stat(outputPath),
            ])
            return sourceStats.size === outputStats.size
          })
      )
    ).every(Boolean)
    const validation = {
      baseValid: baseInspection.valid,
      documentCountMatches:
        exportedDocumentCount === plan.summary.documentCount,
      tableCountMatches: outputTables.length === plan.summary.tableCount,
      rowCountMatches: actualRowCount === plan.summary.rowCount,
      fieldCountMatches:
        exportedFieldCount === plan.summary.fieldCount &&
        expectedFields.every((field) => outputFields.has(field)),
      viewCountMatches: actualViewCount === plan.summary.viewCount,
      referenceCountMatches:
        actualReferenceCount === plan.summary.referenceCount,
      assetCountMatches:
        copiedAssetCount === plan.assets.filter((asset) => asset.exists).length,
      copiedAssetsExist,
    }
    if (Object.values(validation).some((valid) => !valid)) {
      throw new Error(
        `Migration validation failed: ${JSON.stringify(validation)}`
      )
    }
    assertSourceUnchanged(
      plan,
      inspectLegacySpace(sourceRoot, {
        databasePath: plan.sourceDatabasePath,
      })
    )

    const reportRelativePath = `.eidos/migration/${migrationId}/report.md`
    const mappingRelativePath = `.eidos/migration/${migrationId}/mapping.json`
    const result: LegacySpaceMigrationResult = {
      status: "completed",
      migrationId,
      sourceRoot,
      sourceDatabasePath: plan.sourceDatabasePath,
      targetRoot,
      reportPath: path.join(targetRoot, ...reportRelativePath.split("/")),
      mappingPath: path.join(targetRoot, ...mappingRelativePath.split("/")),
      exportedDocumentCount,
      exportedTableCount: outputTables.length,
      exportedRowCount,
      exportedFieldCount,
      exportedViewCount,
      exportedReferenceCount: actualReferenceCount,
      copiedAssetCount,
      recoveredLexicalDocumentCount,
      validation,
      issues,
    }
    emitProgress(options, { phase: "reporting", completed: 0, total: 1 })
    const reportOutputPath = resolveOutputPath(stagingRoot, reportRelativePath)
    const mappingOutputPath = resolveOutputPath(
      stagingRoot,
      mappingRelativePath
    )
    await mkdir(path.dirname(reportOutputPath), { recursive: true })
    await writeFile(reportOutputPath, serializeReport(result), "utf8")
    await writeFile(
      mappingOutputPath,
      `${JSON.stringify({ plan, result }, null, 2)}\n`,
      "utf8"
    )

    emitProgress(options, { phase: "finalizing", completed: 0, total: 1 })
    await assertEmptyOrMissingDirectory(targetRoot)
    await removeEmptyDirectoryIfPresent(targetRoot)
    await rename(stagingRoot, targetRoot)
    emitProgress(options, { phase: "finalizing", completed: 1, total: 1 })
    return result
  } catch (error) {
    sourceDatabase?.close()
    baseRuntime?.close()
    await rm(stagingRoot, { recursive: true, force: true })
    throw error
  }
}
