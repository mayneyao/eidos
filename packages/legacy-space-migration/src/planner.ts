import type {
  LegacyAsset,
  LegacySpaceMigrationPlan,
  LegacySpaceSnapshot,
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
          severity: "error",
          code: "document-body-missing",
          message: `Document body is missing for ${node.name}`,
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
        markdown: source?.markdown ?? null,
        lexicalState: source?.lexicalState ?? null,
        metadata: source?.metadata ?? null,
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
      markdown: document.markdown,
      lexicalState: document.lexicalState,
      metadata: document.metadata,
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

  const tables: PlannedTable[] = [...snapshot.tables]
    .sort((left, right) => {
      const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER
      const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER
      return leftPosition - rightPosition || left.id.localeCompare(right.id)
    })
    .map((table) => {
      for (const field of table.fields) {
        if (!SUPPORTED_FIELD_TYPES.has(field.type)) {
          issues.push({
            severity: "warning",
            code: "unsupported-field-type",
            message: `Field ${table.name}.${field.name} uses unsupported type ${field.type}`,
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
        referenceCount: table.references.length,
      }
    })

  const assets = planAssets(snapshot.assets, assetsDirectory, issues, mappings)
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning"
  ).length
  const errorCount = issues.filter((issue) => issue.severity === "error").length

  return {
    format: "eidos-legacy-space-migration-plan",
    formatVersion: 1,
    sourceRoot: snapshot.sourceRoot,
    sourceDatabasePath: snapshot.databasePath,
    targetRoot: options.targetRoot,
    basePath,
    documents,
    tables,
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
      assetCount: assets.length,
      missingAssetCount: assets.filter((asset) => !asset.exists).length,
      warningCount,
      errorCount,
    },
  }
}
