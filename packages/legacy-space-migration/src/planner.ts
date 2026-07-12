import type {
  LegacyAsset,
  LegacySpaceMigrationPlan,
  LegacySpaceSnapshot,
  LegacyTable,
  LegacyTreeNode,
  MigrationIssue,
  MigrationMapping,
  PlanLegacySpaceMigrationOptions,
  PlannedAsset,
  PlannedDocument,
  PlannedTable,
} from "./types"

const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
])

const SUPPORTED_FIELD_TYPES = new Set([
  "row-id",
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
])

const SAFE_TABLE_ID = /^[A-Za-z0-9_]+$/
const SAFE_FIELD_COLUMN = /^[A-Za-z_][A-Za-z0-9_]*$/
const SYSTEM_FIELD_COLUMNS = new Set([
  "_id",
  "title",
  "_created_time",
  "_last_edited_time",
  "_created_by",
  "_last_edited_by",
])

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function isSafeFieldColumn(value: string): boolean {
  return (
    SYSTEM_FIELD_COLUMNS.has(value) ||
    (SAFE_FIELD_COLUMN.test(value) && !value.startsWith("_"))
  )
}

function allocateFieldColumns(table: LegacyTable) {
  const allocated = new Set([
    ...SYSTEM_FIELD_COLUMNS,
    ...table.fields.map((field) => field.columnName).filter(isSafeFieldColumn),
  ])
  return table.fields.map((field) => {
    if (isSafeFieldColumn(field.columnName)) {
      return {
        sourceColumnName: field.columnName,
        targetColumnName: field.columnName,
      }
    }
    const normalized = field.columnName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase()
    const stem = normalized
      ? /^[0-9]/.test(normalized)
        ? `field_${normalized}`
        : normalized
      : `field_${stableHash(field.columnName)}`
    let targetColumnName = stem
    if (allocated.has(targetColumnName)) {
      targetColumnName = `${stem}_${stableHash(field.columnName)}`
    }
    let counter = 2
    const baseCandidate = targetColumnName
    while (allocated.has(targetColumnName)) {
      targetColumnName = `${baseCandidate}_${counter}`
      counter += 1
    }
    allocated.add(targetColumnName)
    return {
      sourceColumnName: field.columnName,
      targetColumnName,
    }
  })
}

function normalizeRelativeDirectory(value: string, fallback: string): string {
  const segments = value
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment && segment !== ".")
  if (value.startsWith("/") || segments.some((segment) => segment === "..")) {
    throw new Error(`Migration output directory must be relative: ${value}`)
  }
  return segments.join("/") || fallback
}

function stableSuffix(id: string): string {
  const normalized = id.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
  return normalized.slice(-8) || "item"
}

export function sanitizePathSegment(
  value: string,
  fallback = "Untitled"
): string {
  let result = value
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim()
  if (!result) result = fallback
  if (WINDOWS_RESERVED_NAMES.has(result.toLowerCase())) result = `_${result}`
  return result.slice(0, 120).replace(/[. ]+$/g, "") || fallback
}

function joinRelativePath(...segments: string[]): string {
  return segments
    .flatMap((segment) => segment.replace(/\\/g, "/").split("/"))
    .filter(Boolean)
    .join("/")
}

function allocatePath(
  desiredPath: string,
  id: string,
  allocated: Set<string>
): string {
  const normalized = desiredPath.toLocaleLowerCase("en-US")
  if (!allocated.has(normalized)) {
    allocated.add(normalized)
    return desiredPath
  }
  const slash = desiredPath.lastIndexOf("/")
  const directory = slash === -1 ? "" : desiredPath.slice(0, slash + 1)
  const fileName = slash === -1 ? desiredPath : desiredPath.slice(slash + 1)
  const dot = fileName.lastIndexOf(".")
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const extension = dot > 0 ? fileName.slice(dot) : ""
  let suffix = stableSuffix(id)
  let candidate = `${directory}${stem}--${suffix}${extension}`
  let counter = 2
  while (allocated.has(candidate.toLocaleLowerCase("en-US"))) {
    candidate = `${directory}${stem}--${suffix}-${counter}${extension}`
    counter += 1
  }
  allocated.add(candidate.toLocaleLowerCase("en-US"))
  return candidate
}

function buildFolderPathResolver(
  nodes: LegacyTreeNode[],
  issues: MigrationIssue[]
): (node: LegacyTreeNode) => string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const cache = new Map<string, string[]>()
  const resolve = (node: LegacyTreeNode, visiting: Set<string>): string[] => {
    const cached = cache.get(node.id)
    if (cached) return cached
    if (!node.parentId) {
      cache.set(node.id, [])
      return []
    }
    if (visiting.has(node.id)) {
      issues.push({
        severity: "error",
        code: "tree-cycle",
        message: `Tree cycle detected at ${node.name}`,
        sourceId: node.id,
      })
      return []
    }
    const parent = byId.get(node.parentId)
    if (!parent || parent.isDeleted) {
      issues.push({
        severity: "warning",
        code: "missing-parent",
        message: `Parent ${node.parentId} for ${node.name} is missing`,
        sourceId: node.id,
      })
      cache.set(node.id, [])
      return []
    }
    visiting.add(node.id)
    const parentPath = resolve(parent, visiting)
    visiting.delete(node.id)
    const result =
      parent.type === "folder"
        ? [...parentPath, sanitizePathSegment(parent.name, "Untitled folder")]
        : parentPath
    cache.set(node.id, result)
    return result
  }
  return (node) => resolve(node, new Set())
}

function planAssets(
  assets: LegacyAsset[],
  directory: string,
  issues: MigrationIssue[],
  mappings: MigrationMapping[]
): PlannedAsset[] {
  const allocated = new Set<string>()
  return [...assets]
    .sort((left, right) =>
      left.sourceRelativePath.localeCompare(right.sourceRelativePath)
    )
    .map((asset) => {
      const relativeSegments = asset.sourceRelativePath
        .replace(/\\/g, "/")
        .split("/")
        .filter((segment) => segment && segment !== "." && segment !== "..")
        .map((segment) => sanitizePathSegment(segment, "asset"))
      const desired = joinRelativePath(
        directory,
        ...(relativeSegments.length > 0
          ? relativeSegments
          : [sanitizePathSegment(asset.name, "asset")])
      )
      const targetPath = allocatePath(desired, asset.id, allocated)
      if (!asset.exists) {
        issues.push({
          severity: "warning",
          code: "asset-missing",
          message: `Asset is registered but missing: ${asset.sourceRelativePath}`,
          sourceId: asset.id,
          sourcePath: asset.sourceRelativePath,
        })
      }
      if (!asset.registered) {
        issues.push({
          severity: "warning",
          code: "asset-unregistered",
          message: `Asset exists without eidos__files metadata: ${asset.sourceRelativePath}`,
          sourceId: asset.id,
          sourcePath: asset.sourceRelativePath,
        })
      }
      mappings.push({
        kind: "asset",
        sourceId: asset.id,
        sourcePath: asset.sourceRelativePath,
        targetPath,
      })
      return {
        id: asset.id,
        sourceRelativePath: asset.sourceRelativePath,
        targetPath,
        size: asset.size,
        mime: asset.mime,
        registered: asset.registered,
        exists: asset.exists,
      }
    })
}

export function planLegacySpaceMigration(
  snapshot: LegacySpaceSnapshot,
  options: PlanLegacySpaceMigrationOptions
): LegacySpaceMigrationPlan {
  if (!options.targetRoot.trim()) {
    throw new Error("Migration target root is required")
  }
  const documentsDirectory = normalizeRelativeDirectory(
    options.documentsDirectory ?? "notes",
    "notes"
  )
  const assetsDirectory = normalizeRelativeDirectory(
    options.assetsDirectory ?? "assets",
    "assets"
  )
  const basePath = normalizeRelativeDirectory(
    options.basePath ?? "main.base",
    "main.base"
  )
  if (!basePath.toLowerCase().endsWith(".base")) {
    throw new Error(`Migration Base path must end with .base: ${basePath}`)
  }

  const issues = [...snapshot.issues]
  const mappings: MigrationMapping[] = []
  const activeNodes = snapshot.nodes.filter((node) => !node.isDeleted)
  const allNodesById = new Map(snapshot.nodes.map((node) => [node.id, node]))
  const nodeById = new Map(activeNodes.map((node) => [node.id, node]))
  const documentById = new Map(
    snapshot.documents.map((document) => [document.id, document])
  )
  const resolveFolders = buildFolderPathResolver(activeNodes, issues)
  const allocatedDocumentPaths = new Set<string>()

  const documents: PlannedDocument[] = activeNodes
    .filter((node) => node.type === "doc" || node.type === "day")
    .sort((left, right) => {
      const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER
      const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER
      return leftPosition - rightPosition || left.id.localeCompare(right.id)
    })
    .map((node) => {
      const source = documentById.get(node.id)
      const desiredPath = joinRelativePath(
        documentsDirectory,
        ...resolveFolders(node),
        `${sanitizePathSegment(node.name)}.md`
      )
      const targetPath = allocatePath(
        desiredPath,
        node.id,
        allocatedDocumentPaths
      )
      if (!source) {
        issues.push({
          severity: "warning",
          code: "document-body-missing",
          message: `Document body is missing for ${node.name}; an explanatory placeholder will be exported`,
          sourceId: node.id,
        })
      } else if (source.markdown === null) {
        issues.push({
          severity: "warning",
          code: "document-markdown-missing",
          message: `Document ${node.name} only has Lexical state and needs conversion`,
          sourceId: node.id,
        })
      }
      mappings.push({ kind: "document", sourceId: node.id, targetPath })
      return {
        id: node.id,
        sourceName: node.name,
        targetPath,
        hasMarkdown:
          source?.markdown !== null && source?.markdown !== undefined,
        hasLexicalState:
          source?.lexicalState !== null && source?.lexicalState !== undefined,
        sourceMissing: source === undefined,
        createdAt: source?.createdAt ?? node.createdAt,
        updatedAt: source?.updatedAt ?? node.updatedAt,
      }
    })

  for (const document of snapshot.documents) {
    if (nodeById.has(document.id)) continue
    const inactiveNode = allNodesById.get(document.id)
    if (inactiveNode?.isDeleted) {
      issues.push({
        severity: "warning",
        code: "deleted-document-skipped",
        message: `Deleted document ${inactiveNode.name} will not be exported`,
        sourceId: document.id,
      })
      continue
    }
    const targetPath = allocatePath(
      joinRelativePath(
        documentsDirectory,
        "_Orphans",
        `${sanitizePathSegment(document.id)}.md`
      ),
      document.id,
      allocatedDocumentPaths
    )
    issues.push({
      severity: "warning",
      code: "orphan-document-recovered",
      message: `Document ${document.id} has no active tree node and will be exported to ${targetPath}`,
      sourceId: document.id,
    })
    documents.push({
      id: document.id,
      sourceName: document.id,
      targetPath,
      hasMarkdown: document.markdown !== null,
      hasLexicalState: document.lexicalState !== null,
      sourceMissing: false,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    })
    mappings.push({
      kind: "document",
      sourceId: document.id,
      targetPath,
    })
  }

  for (const node of activeNodes) {
    if (
      node.type !== "doc" &&
      node.type !== "day" &&
      node.type !== "folder" &&
      node.type !== "table"
    ) {
      issues.push({
        severity: "warning",
        code: "unsupported-node-type",
        message: `Node ${node.name} uses unsupported type ${node.type} and will not be exported`,
        sourceId: node.id,
      })
    }
  }

  const sourceTablesByRawName = new Map(
    snapshot.tables.map((table) => [table.rawTableName, table])
  )
  const invalidReferenceParticipant = (
    reference: LegacyTable["references"][number]
  ) => {
    const participants = [
      [reference.selfTableName, reference.selfColumnName],
      [reference.refTableName, reference.refColumnName],
      [reference.linkTableName, reference.linkColumnName],
    ] as const
    return participants.find(([tableName, columnName]) => {
      const participantTable = sourceTablesByRawName.get(tableName)
      return (
        !participantTable ||
        (!SYSTEM_FIELD_COLUMNS.has(columnName) &&
          !participantTable.fields.some(
            (field) => field.columnName === columnName
          ))
      )
    })
  }

  const tables: PlannedTable[] = [...snapshot.tables]
    .sort((left, right) => {
      const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER
      const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER
      return leftPosition - rightPosition || left.id.localeCompare(right.id)
    })
    .map((table) => {
      if (!SAFE_TABLE_ID.test(table.id)) {
        issues.push({
          severity: "error",
          code: "table-id-invalid",
          message: `Table ${table.name} has an ID that cannot be preserved in Base: ${table.id}`,
          sourceId: table.id,
        })
      }
      const plannedFields = allocateFieldColumns(table)
      const references = table.references.filter(
        (reference) => !invalidReferenceParticipant(reference)
      )
      for (const [index, field] of table.fields.entries()) {
        const plannedField = plannedFields[index]
        if (field.columnName !== plannedField.targetColumnName) {
          issues.push({
            severity: "warning",
            code: "field-column-remapped",
            message: `Field ${table.name}.${field.name} will use Base column ${plannedField.targetColumnName}; its source column was ${field.columnName}`,
            sourceId: table.id,
          })
        }
        mappings.push({
          kind: "field",
          sourceId: `${table.id}:${field.columnName}`,
          sourcePath: `${table.rawTableName}.${field.columnName}`,
          targetPath: `${basePath}#${table.id}.${plannedField.targetColumnName}`,
        })
        if (!SUPPORTED_FIELD_TYPES.has(field.type)) {
          issues.push({
            severity: "warning",
            code: "unsupported-field-type",
            message: `Field ${table.name}.${field.name} uses unsupported type ${field.type}; current values will be imported as text and the source type will be retained in migration metadata`,
            sourceId: table.id,
          })
        }
        if (field.type === "formula" || field.type === "lookup") {
          issues.push({
            severity: "warning",
            code: "derived-field-materialized",
            message: `Field ${table.name}.${field.name} will preserve current values and metadata but needs Base recomputation support`,
            sourceId: table.id,
          })
        }
      }
      mappings.push({ kind: "table", sourceId: table.id, targetPath: basePath })
      return {
        id: table.id,
        sourceName: table.name,
        targetBasePath: basePath,
        rowCount: table.rowCount,
        fieldCount: table.fields.length,
        viewCount: table.views.length,
        referenceCount: references.length,
        fields: plannedFields,
        references,
      }
    })

  for (const table of snapshot.tables) {
    for (const reference of table.references) {
      const invalidParticipant = invalidReferenceParticipant(reference)
      if (invalidParticipant) {
        issues.push({
          severity: "warning",
          code: "dangling-reference-skipped",
          message: `Reference ${reference.selfTableName}.${reference.selfColumnName} points to missing field ${invalidParticipant[0]}.${invalidParticipant[1]} and will be preserved in the migration plan but not installed into Base`,
          sourceId: table.id,
        })
      }
    }
  }

  const assets = planAssets(snapshot.assets, assetsDirectory, issues, mappings)
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning"
  ).length
  const errorCount = issues.filter((issue) => issue.severity === "error").length
  const skippedReferences = snapshot.tables.flatMap((table) =>
    table.references.filter((reference) =>
      Boolean(invalidReferenceParticipant(reference))
    )
  )

  return {
    format: "eidos-legacy-space-migration-plan",
    formatVersion: 1,
    sourceRoot: snapshot.sourceRoot,
    sourceDatabasePath: snapshot.databasePath,
    sourceFingerprint: snapshot.sourceFingerprint,
    targetRoot: options.targetRoot,
    basePath,
    documents,
    tables,
    skippedReferences,
    assets,
    mappings,
    issues,
    summary: {
      documentCount: documents.length,
      tableCount: tables.length,
      rowCount: tables.reduce((count, table) => count + table.rowCount, 0),
      fieldCount: tables.reduce((count, table) => count + table.fieldCount, 0),
      viewCount: tables.reduce((count, table) => count + table.viewCount, 0),
      referenceCount: tables.reduce(
        (count, table) => count + table.referenceCount,
        0
      ),
      skippedReferenceCount: skippedReferences.length,
      assetCount: assets.length,
      missingAssetCount: assets.filter((asset) => !asset.exists).length,
      warningCount,
      errorCount,
    },
  }
}
