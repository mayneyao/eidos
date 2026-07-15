import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import type { BaseRow } from "@eidos.space/base"
import { normalizeBaseFilter } from "@eidos.space/base"
import {
  createBaseFile,
  inspectBaseFile,
  openBaseFile,
} from "@eidos.space/base/better-sqlite3"
import Database from "better-sqlite3"
import { parse as parseYaml, stringify as stringifyYaml } from "yaml"

import { inspectLegacySpace } from "./better-sqlite3"
import {
  assessLegacyExtensionPortability,
  type LegacyExtensionPortabilityAssessment,
} from "./extension-portability"
import {
  baseFieldTypeForLegacyField,
  buildLegacyFieldImportStrategies,
  fieldColumnMap,
  legacyFieldStrategyKey,
  remapFieldMetadata,
  rewriteExpressionIdentifiers,
} from "./field-migration"
import { sanitizePathSegment } from "./planner"
import type {
  ExportLegacySpaceOptions,
  LegacyAsset,
  LegacyExtension,
  LegacySpaceMigrationPlan,
  LegacySpaceMigrationResult,
  LegacySpaceSnapshot,
  MigrationExportProgress,
  MigrationIssue,
  PlannedExtension,
} from "./types"

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
- Dangling references skipped: ${result.skippedReferenceCount}
- Assets copied: ${result.copiedAssetCount}
- Legacy extensions archived: ${result.archivedExtensionCount}
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
- Extension count matches: ${result.validation.extensionCountMatches ? "yes" : "no"}
- Archived extension files exist: ${result.validation.archivedExtensionsExist ? "yes" : "no"}

## Issues

${issueLines.join("\n")}
`
}

function legacyExtensionMetadata(extension: LegacyExtension) {
  return {
    format: "eidos-legacy-extension-archive",
    formatVersion: 2,
    identity: {
      id: extension.id,
      slug: extension.slug,
      marketplaceId: extension.marketplaceId,
    },
    presentation: {
      name: extension.name,
      description: extension.description,
      icon: extension.icon,
    },
    sourceModel: {
      type: extension.type,
      version: extension.version,
      enabled: extension.enabled,
      metaJson: extension.metaJson,
      bindingsJson: extension.bindingsJson,
      originalTypeScriptStored: extension.tsCode !== null,
      compiledJavaScriptStored: extension.code !== null,
      createdAt: extension.createdAt,
      updatedAt: extension.updatedAt,
    },
    portability: assessLegacyExtensionPortability(extension),
  }
}

function legacyExtensionReadme(
  extension: LegacyExtension,
  planned: PlannedExtension
): string {
  const portability = assessLegacyExtensionPortability(extension)
  const steps = portability.manualSteps
    .map((step, index) => `${index + 1}. ${step}`)
    .join("\n")
  return `# ${extension.name ?? extension.slug ?? extension.id}

This directory is a lossless archive of a database-backed Eidos extension.
It is not an installable file-based extension and Eidos will never execute
it automatically.

- Legacy ID: \`${extension.id}\`
- Legacy slug: \`${extension.slug ?? "(none)"}\`
- Legacy type: \`${extension.type ?? "(unknown)"}\`
- Previously enabled: ${extension.enabled ? "yes" : "no"}
- Original TypeScript: ${planned.sourcePath ? `\`${path.posix.relative(planned.targetDirectory, planned.sourcePath)}\`` : "not stored"}
- Compiled JavaScript: ${planned.compiledPath ? `\`${path.posix.relative(planned.targetDirectory, planned.compiledPath)}\`` : "not stored"}
- Original metadata: \`${path.posix.relative(planned.targetDirectory, planned.metadataPath)}\`

## Portability assessment

- Readiness: \`${portability.readiness}\`
- Legacy contribution: \`${portability.legacyContribution ?? "(unknown)"}\`
- v1 candidate: \`${portability.candidateContribution ?? "(none)"}\`
- Source state: \`${portability.sourceState}\`
- Metadata state: \`${portability.metadataState}\`

${portability.summary}

### Next steps

${steps}

Before porting this code, create a new extension package under
\`.eidos/extensions/<publisher.name>/\`, declare only the capabilities it
needs, and replace legacy global \`eidos\` access with the file-based extension
SDK. Trust and enable the new package only after reviewing the converted code.
`
}

async function archiveLegacyExtension(
  stagingRoot: string,
  extension: LegacyExtension,
  planned: PlannedExtension
): Promise<void> {
  const metadataPath = resolveOutputPath(stagingRoot, planned.metadataPath)
  const readmePath = resolveOutputPath(stagingRoot, planned.readmePath)
  await mkdir(path.dirname(metadataPath), { recursive: true })
  await writeFile(
    metadataPath,
    `${JSON.stringify(legacyExtensionMetadata(extension), null, 2)}\n`,
    "utf8"
  )
  await writeFile(readmePath, legacyExtensionReadme(extension, planned), "utf8")
  if (planned.compiledPath && extension.code !== null) {
    const compiledPath = resolveOutputPath(stagingRoot, planned.compiledPath)
    await mkdir(path.dirname(compiledPath), { recursive: true })
    await writeFile(compiledPath, extension.code, "utf8")
  }
  if (planned.sourcePath && extension.tsCode !== null) {
    const sourcePath = resolveOutputPath(stagingRoot, planned.sourcePath)
    await mkdir(path.dirname(sourcePath), { recursive: true })
    await writeFile(sourcePath, extension.tsCode, "utf8")
  }
}

async function archivedLegacyExtensionIsExact(
  stagingRoot: string,
  extension: LegacyExtension,
  planned: PlannedExtension
): Promise<boolean> {
  try {
    const [metadata, readme] = await Promise.all([
      readFile(resolveOutputPath(stagingRoot, planned.metadataPath), "utf8"),
      readFile(resolveOutputPath(stagingRoot, planned.readmePath), "utf8"),
    ])
    if (
      metadata !==
        `${JSON.stringify(legacyExtensionMetadata(extension), null, 2)}\n` ||
      !readme.includes("not an installable file-based extension")
    ) {
      return false
    }
    if (planned.compiledPath) {
      if (
        extension.code === null ||
        (await readFile(
          resolveOutputPath(stagingRoot, planned.compiledPath),
          "utf8"
        )) !== extension.code
      ) {
        return false
      }
    } else if (extension.code !== null) {
      return false
    }
    if (!planned.sourcePath) return extension.tsCode === null
    return (
      extension.tsCode !== null &&
      (await readFile(
        resolveOutputPath(stagingRoot, planned.sourcePath),
        "utf8"
      )) === extension.tsCode
    )
  } catch {
    return false
  }
}

export interface ExportLegacyExtensionArchiveOptions {
  targetDirectory: string
}

export interface LegacyExtensionArchiveExportResult {
  targetDirectory: string
  metadataPath: string
  readmePath: string
  sourcePath: string | null
  compiledPath: string | null
  portability: LegacyExtensionPortabilityAssessment
}

/**
 * Export one database-backed extension as a non-executable source archive.
 *
 * The target is written through a sibling staging directory and atomically
 * renamed only after every archived byte has been verified. Existing target
 * contents are never overwritten.
 */
export async function exportLegacyExtensionArchive(
  extension: LegacyExtension,
  options: ExportLegacyExtensionArchiveOptions
): Promise<LegacyExtensionArchiveExportResult> {
  if (!options.targetDirectory.trim()) {
    throw new Error("Legacy extension archive target is required")
  }
  const targetDirectory = path.resolve(options.targetDirectory)
  if (targetDirectory === path.parse(targetDirectory).root) {
    throw new Error(
      "Legacy extension archive target cannot be a filesystem root"
    )
  }
  await assertEmptyOrMissingDirectory(targetDirectory)
  const targetParent = path.dirname(targetDirectory)
  await mkdir(targetParent, { recursive: true })
  const stagingRoot = await mkdtemp(
    path.join(
      targetParent,
      `.${path.basename(targetDirectory)}.eidos-extension-archive-`
    )
  )
  const planned: PlannedExtension = {
    id: extension.id,
    sourceSlug: extension.slug,
    sourceType: extension.type,
    targetDirectory: ".",
    sourcePath:
      extension.tsCode === null
        ? null
        : extension.type === "block"
          ? "src/view.tsx"
          : "src/extension.ts",
    compiledPath: extension.code === null ? null : "dist/extension.js",
    metadataPath: "legacy-extension.json",
    readmePath: "README.md",
  }
  try {
    await archiveLegacyExtension(stagingRoot, extension, planned)
    if (
      !(await archivedLegacyExtensionIsExact(stagingRoot, extension, planned))
    ) {
      throw new Error("Legacy extension archive validation failed")
    }
    await assertEmptyOrMissingDirectory(targetDirectory)
    await removeEmptyDirectoryIfPresent(targetDirectory)
    await rename(stagingRoot, targetDirectory)
    const absolute = (relativePath: string | null) =>
      relativePath
        ? path.join(targetDirectory, ...relativePath.split("/"))
        : null
    return {
      targetDirectory,
      metadataPath: absolute(planned.metadataPath)!,
      readmePath: absolute(planned.readmePath)!,
      sourcePath: absolute(planned.sourcePath),
      compiledPath: absolute(planned.compiledPath),
      portability: assessLegacyExtensionPortability(extension),
    }
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true })
    throw error
  }
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

function* tableRowBatches(
  database: Database.Database,
  rawTableName: string,
  batchSize: number,
  unreadableColumns: ReadonlySet<string>
): Generator<BaseRow[]> {
  const quoted = `"${rawTableName.replace(/"/g, '""')}"`
  const physicalColumnRows = database
    .prepare(`PRAGMA table_xinfo(${quoted})`)
    .all() as Array<{ name: string; hidden: number }>
  const physicalColumns = new Set(
    physicalColumnRows.map((column) => column.name.toLowerCase())
  )
  const selectedColumnNames = physicalColumnRows
    .filter(
      (column) => column.hidden === 0 || !unreadableColumns.has(column.name)
    )
    .map((column) => column.name)
  const selectedColumnsSql = selectedColumnNames
    .map((columnName) => `"${columnName.replace(/"/g, '""')}"`)
    .join(", ")
  const withoutRowId = (
    database.prepare("PRAGMA table_list").all() as Array<{
      name: string
      wr: number
    }>
  ).some((table) => table.name === rawTableName && table.wr === 1)
  if (withoutRowId) {
    const statement = database
      .prepare(`SELECT ${selectedColumnsSql} FROM ${quoted} LIMIT ? OFFSET ?`)
      .raw(true)
    for (let offset = 0; ; offset += batchSize) {
      const values = statement.all(batchSize, offset) as Array<
        Array<BaseRow[string]>
      >
      if (values.length === 0) return
      yield values.map((record) =>
        Object.fromEntries(
          selectedColumnNames.map((columnName, index) => [
            columnName,
            record[index],
          ])
        )
      ) as BaseRow[]
    }
  }
  const rowIdIdentifier = ["rowid", "_rowid_", "oid"].find(
    (candidate) => !physicalColumns.has(candidate)
  )
  if (!rowIdIdentifier) {
    throw new Error(
      `Legacy table ${rawTableName} shadows every SQLite rowid alias`
    )
  }
  const firstStatement = database
    .prepare(
      `SELECT ${rowIdIdentifier}, ${selectedColumnsSql} FROM ${quoted} ORDER BY ${rowIdIdentifier} LIMIT ?`
    )
    .raw(true)
  const nextStatement = database
    .prepare(
      `SELECT ${rowIdIdentifier}, ${selectedColumnsSql} FROM ${quoted} WHERE ${rowIdIdentifier} > ? ORDER BY ${rowIdIdentifier} LIMIT ?`
    )
    .raw(true)
  let afterRowId: number | bigint | null = null
  while (true) {
    const values = (
      afterRowId === null
        ? firstStatement.all(batchSize)
        : nextStatement.all(afterRowId, batchSize)
    ) as Array<Array<BaseRow[string] | bigint>>
    if (values.length === 0) return
    yield values.map((record) =>
      Object.fromEntries(
        selectedColumnNames.map((columnName, index) => [
          columnName,
          record[index + 1],
        ])
      )
    ) as BaseRow[]
    const rowId = values[values.length - 1][0]
    if (typeof rowId !== "number" && typeof rowId !== "bigint") {
      throw new Error(`Legacy table ${rawTableName} returned an invalid rowid`)
    }
    afterRowId = rowId
  }
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
  const fieldStrategies = buildLegacyFieldImportStrategies(
    snapshot,
    plan.tables
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
  let archivedExtensionCount = 0
  let exportedRowCount = 0
  let exportedFieldCount = 0
  let exportedViewCount = 0
  let baseRuntime: ReturnType<typeof createBaseFile> | null = null
  let sourceDatabase: Database.Database | null = null
  try {
    for (const [index, document] of plan.documents.entries()) {
      const sourceDocument = snapshotDocuments.get(document.id)
      const outputPath = resolveOutputPath(stagingRoot, document.targetPath)
      await mkdir(path.dirname(outputPath), { recursive: true })
      let markdown = sourceDocument?.markdown ?? null
      if (!sourceDocument) {
        markdown = `<!-- Eidos migration: this document existed in the legacy tree, but no document body was present in eidos__docs. Source node: ${document.id}. -->\n`
      } else if (markdown === null) {
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
        sourceDocument?.properties ?? {}
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
      const columnMap = fieldColumnMap(plannedTable)
      for (const field of sourceTable.fields) {
        const type = baseFieldTypeForLegacyField(field)
        const strategy = fieldStrategies.get(
          legacyFieldStrategyKey(sourceTable.id, field.columnName)
        )
        if (!strategy) {
          throw new Error(
            `Migration strategy is missing for ${sourceTable.rawTableName}.${field.columnName}`
          )
        }
        const targetColumnName = columnMap.get(field.columnName)
        if (!targetColumnName) {
          throw new Error(
            `Migration plan is missing field mapping for ${sourceTable.rawTableName}.${field.columnName}`
          )
        }
        baseRuntime.importField(sourceTable.id, {
          name: field.name,
          columnName: targetColumnName,
          type,
          property: strategy.property,
          storageCodec: strategy.storageCodec,
          valueKind: strategy.valueKind,
          isHidden:
            field.columnName.startsWith("_") ||
            targetColumnName.startsWith("_"),
          isDerived: strategy.isDerived,
          sourceTableColumnName:
            targetColumnName === field.columnName
              ? undefined
              : field.columnName,
          dependsOn: strategy.dependsOn,
        })
        exportedFieldCount += 1
      }
      for (const view of sourceTable.views) {
        baseRuntime.createView(sourceTable.id, {
          id: view.id,
          name: view.name,
          type: view.type,
          query: rewriteExpressionIdentifiers(view.query, columnMap),
          properties: remapFieldMetadata(view.properties, columnMap) as Record<
            string,
            unknown
          > | null,
          filter: normalizeBaseFilter(
            remapFieldMetadata(view.filter, columnMap)
          ),
          orderMap: remapFieldMetadata(view.orderMap, columnMap) as Record<
            string,
            number
          > | null,
          hiddenFields: remapFieldMetadata(
            view.hiddenFields,
            columnMap
          ) as string[],
          position: view.position,
        })
        exportedViewCount += 1
      }
      const fileColumns = new Set(
        sourceTable.fields
          .filter((field) => field.type === "file")
          .map((field) => columnMap.get(field.columnName) ?? field.columnName)
      )
      const liveDerivedColumns = new Set(
        sourceTable.fields.flatMap((field) => {
          const strategy = fieldStrategies.get(
            legacyFieldStrategyKey(sourceTable.id, field.columnName)
          )
          const targetColumnName = columnMap.get(field.columnName)
          return strategy?.omitSourceValue && targetColumnName
            ? [targetColumnName]
            : []
        })
      )
      const batchSize = Math.min(
        2_000,
        Math.max(1, Math.trunc(options.rowBatchSize ?? 500))
      )
      for (const rows of tableRowBatches(
        sourceDatabase,
        sourceTable.rawTableName,
        batchSize,
        new Set(
          plannedTable.fields
            .filter((field) => !field.sourceReadable)
            .map((field) => field.sourceColumnName)
        )
      )) {
        const rewrittenRows = rows.map((row) => {
          const rewritten = Object.fromEntries(
            Object.entries(row).map(([columnName, value]) => [
              columnMap.get(columnName) ?? columnName,
              value,
            ])
          ) as BaseRow
          for (const columnName of fileColumns) {
            rewritten[columnName] = rewriteFileValue(
              rewritten[columnName],
              assetLookup
            )
          }
          for (const columnName of liveDerivedColumns) {
            delete rewritten[columnName]
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
    for (const selfPlan of plan.tables) {
      for (const reference of selfPlan.references) {
        const refTableId = sourceTableId(reference.refTableName)
        const linkTableId = sourceTableId(reference.linkTableName)
        const refPlan = plan.tables.find((table) => table.id === refTableId)
        const linkPlan = plan.tables.find((table) => table.id === linkTableId)
        if (!refPlan || !linkPlan) {
          throw new Error("Migration plan is missing a referenced Base table")
        }
        baseRuntime.createReference({
          selfTableId: selfPlan.id,
          selfColumnName:
            fieldColumnMap(selfPlan).get(reference.selfColumnName) ??
            reference.selfColumnName,
          refTableId,
          refColumnName:
            fieldColumnMap(refPlan).get(reference.refColumnName) ??
            reference.refColumnName,
          linkTableId,
          linkColumnName:
            fieldColumnMap(linkPlan).get(reference.linkColumnName) ??
            reference.linkColumnName,
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

    const snapshotExtensions = new Map(
      snapshot.extensions.map((extension) => [extension.id, extension])
    )
    for (const [index, plannedExtension] of plan.extensions.entries()) {
      const sourceExtension = snapshotExtensions.get(plannedExtension.id)
      if (!sourceExtension) {
        throw new Error(
          `Legacy extension disappeared after planning: ${plannedExtension.id}`
        )
      }
      await archiveLegacyExtension(
        stagingRoot,
        sourceExtension,
        plannedExtension
      )
      archivedExtensionCount += 1
      emitProgress(options, {
        phase: "extensions",
        completed: index + 1,
        total: plan.extensions.length,
        currentPath: plannedExtension.targetDirectory,
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
      (
        plan.tables.find((planned) => planned.id === table.id)?.fields ?? []
      ).map((field) => `${table.id}.${field.targetColumnName}`)
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
    const archivedExtensionsExist = (
      await Promise.all(
        plan.extensions.map(async (plannedExtension) => {
          const sourceExtension = snapshotExtensions.get(plannedExtension.id)
          return (
            sourceExtension !== undefined &&
            (await archivedLegacyExtensionIsExact(
              stagingRoot,
              sourceExtension,
              plannedExtension
            ))
          )
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
      extensionCountMatches:
        archivedExtensionCount === plan.summary.extensionCount,
      archivedExtensionsExist,
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
      skippedReferenceCount: plan.summary.skippedReferenceCount,
      copiedAssetCount,
      archivedExtensionCount,
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
