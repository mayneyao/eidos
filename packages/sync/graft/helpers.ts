export interface GraftPushResult {
  rawMessage?: string
}

export type GraftSyncStatus = "ahead" | "behind" | "up_to_date" | "diverged"

export type GraftWorkflowState =
  | "not_grafted"
  | "clean"
  | "dirty"
  | "staged"
  | "ahead"
  | "behind"
  | "diverged"
  | "merge_ready"
  | "merge_conflict"

export type GraftWorkflowAction =
  | "check_remote"
  | "commit"
  | "push"
  | "pull"
  | "merge"
  | "complete_merge"
  | "resolve_conflicts"
  | "abort_merge"
  | "open_changes"

export interface GraftWorkflow {
  state: GraftWorkflowState
  primaryAction?: GraftWorkflowAction
  allowedActions: GraftWorkflowAction[]
  mutatesWorktree: boolean
  statusLabel: string
  actionLabel?: string
  description?: string
}

export interface GraftWorkflowInput {
  isGrafted?: boolean
  dirty?: boolean
  staged?: unknown[]
  unstaged?: unknown[]
  unstagedChanges?: unknown[]
  conflicted?: unknown[]
  isMergeInProgress?: boolean
  canCompleteMerge?: boolean
  status?: GraftSyncStatus
  ahead?: number
  behind?: number
}

export interface GraftStatus {
  currentBranch?: string
  headTarget?: string
  upstream?: { remote: string; branch: string }
  localLogId?: string
  remoteLogId?: string
  dirty?: boolean
  staged?: string[]
  unstaged?: string[]
  unstagedChanges?: Array<{ path: string; change?: string }>
  conflicted?: string[]
  mergeHead?: string
  isMergeInProgress?: boolean
  canCompleteMerge?: boolean
  status?: GraftSyncStatus
  commitDiff?: number
  ahead?: number
  behind?: number
  suggestedAction?: GraftWorkflowAction
  workflow?: GraftWorkflow
  isGrafted?: boolean
  conflictAnalysis?: GraftConflictAnalysis
}

export type GraftConflictResolution = "ours" | "theirs" | "manual"
export interface GraftBlobPrimaryKeyValue {
  $blob: string
}
export type GraftPrimaryKeyValue =
  | string
  | number
  | null
  | GraftBlobPrimaryKeyValue
export type GraftRowKey = Record<string, GraftPrimaryKeyValue>
export interface GraftConflictResolveTarget {
  table?: string
  rowid?: number
  key?: GraftRowKey
}

export function deriveGraftWorkflow(input: GraftWorkflowInput): GraftWorkflow {
  const isGrafted = input.isGrafted !== false
  if (!isGrafted) {
    return {
      state: "not_grafted",
      allowedActions: [],
      mutatesWorktree: false,
      statusLabel: "Version history not enabled",
    }
  }

  const stagedCount = Array.isArray(input.staged) ? input.staged.length : 0
  const unstagedCount =
    (Array.isArray(input.unstaged) ? input.unstaged.length : 0) +
    (Array.isArray(input.unstagedChanges) ? input.unstagedChanges.length : 0)
  const conflictedCount = Array.isArray(input.conflicted)
    ? input.conflicted.length
    : 0
  const ahead = nonNegativeNumber(input.ahead)
  const behind = nonNegativeNumber(input.behind)
  const syncStatus =
    input.status ??
    (ahead > 0 && behind > 0
      ? "diverged"
      : ahead > 0
        ? "ahead"
        : behind > 0
          ? "behind"
          : "up_to_date")
  const remoteLabel = formatSyncStatusLabel(syncStatus, ahead, behind)

  if (input.isMergeInProgress) {
    if (input.canCompleteMerge) {
      return {
        state: "merge_ready",
        primaryAction: "complete_merge",
        allowedActions: ["complete_merge", "abort_merge", "open_changes"],
        mutatesWorktree: false,
        statusLabel: "Merge ready",
        actionLabel: "Complete merge",
        description:
          "Remote changes are applied locally and ready to be committed as a merge.",
      }
    }

    return {
      state: "merge_conflict",
      primaryAction: "resolve_conflicts",
      allowedActions: ["resolve_conflicts", "abort_merge", "open_changes"],
      mutatesWorktree: true,
      statusLabel: "Merge in progress",
      actionLabel: "Resolve merge",
      description: "Resolve conflicts before completing or aborting the merge.",
    }
  }

  const hasUncommittedChanges =
    Boolean(input.dirty) ||
    stagedCount > 0 ||
    unstagedCount > 0 ||
    conflictedCount > 0

  if (hasUncommittedChanges) {
    const state: GraftWorkflowState = stagedCount > 0 ? "staged" : "dirty"
    return {
      state,
      primaryAction: "commit",
      allowedActions: ["check_remote", "commit", "open_changes"],
      mutatesWorktree: false,
      statusLabel:
        syncStatus === "up_to_date"
          ? stagedCount > 0
            ? "Staged changes"
            : "Uncommitted changes"
          : `${stagedCount > 0 ? "Staged changes" : "Uncommitted changes"}, ${remoteLabel.toLowerCase()}`,
      actionLabel: "Commit",
      description:
        syncStatus === "up_to_date"
          ? "Commit or discard local changes before syncing with a remote."
          : "Commit or discard local changes before pulling, merging, or pushing remote history.",
    }
  }

  if (syncStatus === "diverged") {
    return {
      state: "diverged",
      primaryAction: "merge",
      allowedActions: ["check_remote", "merge"],
      mutatesWorktree: true,
      statusLabel: remoteLabel,
      actionLabel: "Merge",
      description:
        "Local and remote history both moved forward. Merge remote changes before pushing.",
    }
  }

  if (syncStatus === "behind") {
    return {
      state: "behind",
      primaryAction: "pull",
      allowedActions: ["check_remote", "pull"],
      mutatesWorktree: true,
      statusLabel: remoteLabel,
      actionLabel: "Pull",
      description: "Remote commits are available and can be pulled explicitly.",
    }
  }

  if (syncStatus === "ahead") {
    return {
      state: "ahead",
      primaryAction: "push",
      allowedActions: ["check_remote", "push"],
      mutatesWorktree: false,
      statusLabel: remoteLabel,
      actionLabel: "Push",
      description: "Local commits are ready to push to the remote.",
    }
  }

  return {
    state: "clean",
    allowedActions: ["check_remote"],
    mutatesWorktree: false,
    statusLabel: "Up to date",
  }
}

function formatSyncStatusLabel(
  status: GraftSyncStatus,
  ahead: number,
  behind: number
): string {
  const parts: string[] = []
  if (ahead > 0) {
    parts.push(`${ahead} commit${ahead === 1 ? "" : "s"} ahead`)
  }
  if (behind > 0) {
    parts.push(`${behind} commit${behind === 1 ? "" : "s"} behind`)
  }
  if (parts.length > 0) return parts.join(", ")
  if (status === "ahead") return "Ahead"
  if (status === "behind") return "Behind"
  if (status === "diverged") return "Diverged"
  return "Up to date"
}

export interface GraftConflictAnalysis {
  path: string
  available: boolean
  canAutoMerge: boolean
  oursChanges: number
  theirsChanges: number
  applyChanges: number
  opaqueChanges: number
  resolvedOpaqueChanges: number
  resolvedOpaqueChangeDetails: GraftResolvedOpaqueChange[]
  applyPolicy?: GraftRowMergeApplyPolicy
  limitations: GraftDiffLimitation[]
  blockedReasons: string[]
  rowConflicts: Array<{
    reason: string
    table: string
    columns: string[]
    rowid?: number
    key?: GraftRowKey
    oursRowid?: number
    theirsRowid?: number
    oursKey?: GraftRowKey
    theirsKey?: GraftRowKey
    semanticKey?: string[]
    ours: string
    theirs: string
    baseRow?: unknown[] | null
    oursRow?: unknown[] | null
    theirsRow?: unknown[] | null
  }>
  schemaConflicts: Array<{
    reason: string
    name: string
    entryType: string
    ours?: string
    theirs?: string
    columnChanges: GraftSchemaColumnChange[]
    message?: string
  }>
  message?: string
}

export interface GraftResolvedOpaqueChange {
  name: string
  reason: string
  resolver: string
}

export interface GraftSchemaColumnChange {
  side: string
  operation: string
  from?: string
  to?: string
}

export interface GraftRowMergeApplyPolicy {
  foreignKeys: string
  triggers: string
  validation: string[]
  defaultSemanticKeys: string[]
  internalResolvers: Record<string, string>
  schemaResolvers: Record<string, string>
  generatedColumns: Record<string, string[]>
}

export interface GraftAppMergePolicy {
  defaultSemanticKeys: string[]
  semanticKeys: Record<string, string[]>
  internalResolvers: Record<string, string>
  schemaResolvers: Record<string, string>
  generatedColumns: Record<string, string[]>
  generatedColumnTables: string[]
}

export const EIDOS_GRAFT_MERGE_POLICY: GraftAppMergePolicy = {
  defaultSemanticKeys: ["_id"],
  semanticKeys: {
    eidos__tree: ["id"],
    eidos__columns: ["table_name", "table_column_name"],
    eidos__views: ["id"],
    eidos__docs: ["id"],
    eidos__extensions: ["id"],
    eidos__files: ["id"],
    eidos__embeddings: ["id"],
    eidos__chats: ["id"],
    eidos__messages: ["id"],
    eidos__extnodes: ["id"],
    eidos__kv: ["key"],
    eidos__references: [
      "self_table_name",
      "self_table_column_name",
      "ref_table_name",
      "ref_table_column_name",
      "link_table_name",
      "link_table_column_name",
    ],
  },
  internalResolvers: {
    sqlite_sequence: "sequence_max",
    sqlite_stat1: "rebuild",
    sqlite_stat2: "rebuild",
    sqlite_stat3: "rebuild",
    sqlite_stat4: "rebuild",
    index_btree: "reindex",
  },
  schemaResolvers: {
    add_column: "alter_table_add_column",
  },
  generatedColumns: {
    eidos__references: ["self", "ref", "link"],
  },
  generatedColumnTables: ["eidos__references"],
}

const GRAFT_MERGE_SEMANTIC_KEYS_HEADER = "[merge.semantic_keys]"
const GRAFT_MERGE_INTERNAL_RESOLVERS_HEADER = "[merge.internal_resolvers]"
const GRAFT_MERGE_SCHEMA_RESOLVERS_HEADER = "[merge.schema_resolvers]"
const GRAFT_MERGE_GENERATED_COLUMNS_HEADER = "[merge.generated_columns]"

export function formatGraftMergePolicyToml(
  policy: GraftAppMergePolicy = EIDOS_GRAFT_MERGE_POLICY
) {
  const lines = ["[merge]"]
  if (policy.defaultSemanticKeys.length > 0) {
    lines.push(
      `default_semantic_keys = [${policy.defaultSemanticKeys.map(tomlString).join(", ")}]`
    )
  }
  lines.push("", GRAFT_MERGE_SEMANTIC_KEYS_HEADER)
  for (const table of Object.keys(policy.semanticKeys).sort()) {
    const columns = policy.semanticKeys[table] ?? []
    if (columns.length === 0) continue
    lines.push(`${tomlString(table)} = [${columns.map(tomlString).join(", ")}]`)
  }
  const internalSubjects = Object.keys(policy.internalResolvers).sort()
  if (internalSubjects.length > 0) {
    lines.push("", GRAFT_MERGE_INTERNAL_RESOLVERS_HEADER)
    for (const subject of internalSubjects) {
      const resolver = policy.internalResolvers[subject]
      if (!resolver) continue
      lines.push(`${tomlString(subject)} = ${tomlString(resolver)}`)
    }
  }
  const schemaOperations = Object.keys(policy.schemaResolvers).sort()
  if (schemaOperations.length > 0) {
    lines.push("", GRAFT_MERGE_SCHEMA_RESOLVERS_HEADER)
    for (const operation of schemaOperations) {
      const resolver = policy.schemaResolvers[operation]
      if (!resolver) continue
      lines.push(`${tomlString(operation)} = ${tomlString(resolver)}`)
    }
  }
  const generatedTables = Object.keys(policy.generatedColumns).sort()
  if (generatedTables.length > 0) {
    lines.push("", GRAFT_MERGE_GENERATED_COLUMNS_HEADER)
    for (const table of generatedTables) {
      const columns = policy.generatedColumns[table] ?? []
      if (columns.length === 0) continue
      lines.push(
        `${tomlString(table)} = [${columns.map(tomlString).join(", ")}]`
      )
    }
  }
  return `${lines.join("\n")}\n`
}

export function upsertGraftMergePolicyToml(
  configToml: string,
  policy: GraftAppMergePolicy = EIDOS_GRAFT_MERGE_POLICY
) {
  const withoutExistingSection = [
    "[merge]",
    GRAFT_MERGE_SEMANTIC_KEYS_HEADER,
    GRAFT_MERGE_INTERNAL_RESOLVERS_HEADER,
    GRAFT_MERGE_SCHEMA_RESOLVERS_HEADER,
    GRAFT_MERGE_GENERATED_COLUMNS_HEADER,
  ]
    .reduce((toml, section) => removeTomlSection(toml, section), configToml)
    .trimEnd()
  const policyToml = formatGraftMergePolicyToml(policy).trimEnd()
  return `${withoutExistingSection}${withoutExistingSection ? "\n\n" : ""}${policyToml}\n`
}

function removeTomlSection(configToml: string, sectionHeader: string) {
  const lines = configToml.split(/\r?\n/)
  const result: string[] = []
  let skipping = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^\[[^\]]+\]$/.test(trimmed)) {
      skipping = trimmed === sectionHeader
      if (skipping) continue
    }
    if (!skipping) result.push(line)
  }

  return result.join("\n")
}

function tomlString(value: string) {
  return JSON.stringify(value)
}

/** Parse `graft status --json` output into structured data. */
export function parseGraftStatus(data: any): GraftStatus {
  const json = parseGraftJson<Record<string, any>>(data)
  if (json && (json.head || json.head_target !== undefined)) {
    const head = json.head
    const branch =
      head?.Branch?.name ??
      head?.branch?.name ??
      head?.name ??
      json.branches?.find?.((branch: any) => branch.current)?.name
    const upstream = json.upstream
      ? {
          remote: String(json.upstream.remote),
          branch: String(json.upstream.branch),
        }
      : undefined
    const staged = Array.isArray(json.staged) ? json.staged.map(String) : []
    const unstaged = Array.isArray(json.unstaged)
      ? json.unstaged.map(String)
      : []
    const unstagedChanges = Array.isArray(json.unstaged_changes)
      ? json.unstaged_changes.map((change: any) => ({
          path: String(change.path ?? change),
          change: change.change != null ? String(change.change) : undefined,
        }))
      : []
    const conflicted = Array.isArray(json.conflicted)
      ? json.conflicted.map(String)
      : []
    const mergeHead =
      json.merge_head != null
        ? String(json.merge_head)
        : json.mergeHead != null
          ? String(json.mergeHead)
          : undefined
    const isMergeInProgress = Boolean(mergeHead)
    const conflictAnalysis = parseGraftConflictAnalysis(
      json.conflict_analysis ?? json.conflictAnalysis
    )
    const canCompleteMerge =
      isMergeInProgress &&
      (conflicted.length === 0 || Boolean(conflictAnalysis?.canAutoMerge))
    const ahead = nonNegativeNumber(
      json.ahead ?? json.upstream_status?.ahead ?? json.sync_status?.ahead
    )
    const behind = nonNegativeNumber(
      json.behind ?? json.upstream_status?.behind ?? json.sync_status?.behind
    )
    const syncStatus =
      json.status === "ahead" ||
      json.status === "behind" ||
      json.status === "up_to_date" ||
      json.status === "diverged"
        ? json.status
        : ahead > 0 && behind > 0
          ? "diverged"
          : ahead > 0
            ? "ahead"
            : behind > 0
              ? "behind"
              : "up_to_date"

    const workflow = deriveGraftWorkflow({
      isGrafted: true,
      dirty: Boolean(json.dirty),
      staged,
      unstaged,
      unstagedChanges,
      conflicted,
      isMergeInProgress,
      canCompleteMerge,
      status: syncStatus,
      ahead,
      behind,
    })

    return {
      currentBranch: branch ? String(branch) : undefined,
      headTarget:
        json.head_target != null ? String(json.head_target) : undefined,
      upstream,
      isGrafted: true,
      dirty: Boolean(json.dirty),
      staged,
      unstaged,
      unstagedChanges,
      conflicted,
      mergeHead,
      isMergeInProgress,
      canCompleteMerge,
      status: syncStatus,
      ahead,
      behind,
      conflictAnalysis,
      commitDiff: ahead - behind,
      suggestedAction: workflow.primaryAction,
      workflow,
    }
  }

  return {
    isGrafted: false,
    workflow: deriveGraftWorkflow({ isGrafted: false }),
  }
}

function parseGraftConflictAnalysis(
  data: any
): GraftConflictAnalysis | undefined {
  if (!data || typeof data !== "object") return undefined

  const analysis: GraftConflictAnalysis = {
    path: String(data.path ?? ""),
    available: Boolean(data.available),
    canAutoMerge: Boolean(data.can_auto_merge ?? data.canAutoMerge),
    oursChanges: nonNegativeNumber(data.ours_changes ?? data.oursChanges),
    theirsChanges: nonNegativeNumber(data.theirs_changes ?? data.theirsChanges),
    applyChanges: nonNegativeNumber(data.apply_changes ?? data.applyChanges),
    opaqueChanges: nonNegativeNumber(data.opaque_changes ?? data.opaqueChanges),
    resolvedOpaqueChanges: nonNegativeNumber(
      data.resolved_opaque_changes ?? data.resolvedOpaqueChanges
    ),
    resolvedOpaqueChangeDetails: parseResolvedOpaqueChanges(
      data.resolved_opaque_change_details ?? data.resolvedOpaqueChangeDetails
    ),
    applyPolicy: parseGraftRowMergeApplyPolicy(
      data.apply_policy ?? data.applyPolicy
    ),
    limitations: parseGraftDiffLimitations(data.limitations),
    blockedReasons: Array.isArray(data.blocked_reasons)
      ? data.blocked_reasons.map(String)
      : Array.isArray(data.blockedReasons)
        ? data.blockedReasons.map(String)
        : [],
    rowConflicts: parseGraftRowConflicts(
      data.row_conflicts ?? data.rowConflicts
    ),
    schemaConflicts: Array.isArray(data.schema_conflicts)
      ? data.schema_conflicts.map((conflict: any) => ({
          reason: String(conflict.reason ?? "schema_conflict"),
          name: String(conflict.name ?? ""),
          entryType: String(conflict.entry_type ?? conflict.entryType ?? ""),
          ours: conflict.ours != null ? String(conflict.ours) : undefined,
          theirs: conflict.theirs != null ? String(conflict.theirs) : undefined,
          columnChanges: parseSchemaColumnChanges(
            conflict.column_changes ?? conflict.columnChanges
          ),
          message:
            conflict.message != null ? String(conflict.message) : undefined,
        }))
      : Array.isArray(data.schemaConflicts)
        ? data.schemaConflicts.map((conflict: any) => ({
            reason: String(conflict.reason ?? "schema_conflict"),
            name: String(conflict.name ?? ""),
            entryType: String(conflict.entry_type ?? conflict.entryType ?? ""),
            ours: conflict.ours != null ? String(conflict.ours) : undefined,
            theirs:
              conflict.theirs != null ? String(conflict.theirs) : undefined,
            columnChanges: parseSchemaColumnChanges(
              conflict.column_changes ?? conflict.columnChanges
            ),
            message:
              conflict.message != null ? String(conflict.message) : undefined,
          }))
        : [],
  }

  if (data.message != null) analysis.message = String(data.message)
  return analysis
}

function parseGraftRowConflicts(
  data: any
): GraftConflictAnalysis["rowConflicts"] {
  if (!Array.isArray(data)) return []
  return data.map((conflict: any) => {
    const parsed: GraftConflictAnalysis["rowConflicts"][number] = {
      reason: String(conflict.reason ?? "row_conflict"),
      table: String(conflict.table ?? ""),
      columns: Array.isArray(conflict.columns)
        ? conflict.columns.map(String)
        : [],
      ours: String(conflict.ours ?? ""),
      theirs: String(conflict.theirs ?? ""),
      baseRow: conflict.base_row ?? conflict.baseRow ?? null,
      oursRow: conflict.ours_row ?? conflict.oursRow ?? null,
      theirsRow: conflict.theirs_row ?? conflict.theirsRow ?? null,
    }
    const rowid = optionalRowId(conflict.rowid)
    const key = parseGraftRowKey(conflict.key)
    const oursRowid = optionalRowId(conflict.ours_rowid ?? conflict.oursRowid)
    const theirsRowid = optionalRowId(
      conflict.theirs_rowid ?? conflict.theirsRowid
    )
    const semanticKey = parseStringArray(
      conflict.semantic_key ?? conflict.semanticKey
    )
    if (rowid !== undefined) parsed.rowid = rowid
    if (key) parsed.key = key
    if (oursRowid !== undefined) parsed.oursRowid = oursRowid
    if (theirsRowid !== undefined) parsed.theirsRowid = theirsRowid
    const oursKey = parseGraftRowKey(conflict.ours_key ?? conflict.oursKey)
    const theirsKey = parseGraftRowKey(
      conflict.theirs_key ?? conflict.theirsKey
    )
    if (oursKey) parsed.oursKey = oursKey
    if (theirsKey) parsed.theirsKey = theirsKey
    if (semanticKey.length > 0) parsed.semanticKey = semanticKey
    return parsed
  })
}

function parseResolvedOpaqueChanges(data: any): GraftResolvedOpaqueChange[] {
  if (!Array.isArray(data)) return []
  return data.map((change: any) => ({
    name: String(change?.name ?? ""),
    reason: String(change?.reason ?? ""),
    resolver: String(change?.resolver ?? ""),
  }))
}

function parseSchemaColumnChanges(data: any): GraftSchemaColumnChange[] {
  if (!Array.isArray(data)) return []
  return data.map((change: any) => {
    const parsed: GraftSchemaColumnChange = {
      side: String(change?.side ?? ""),
      operation: String(change?.operation ?? ""),
    }
    if (change?.from != null) parsed.from = String(change.from)
    if (change?.to != null) parsed.to = String(change.to)
    return parsed
  })
}

function parseGraftRowMergeApplyPolicy(
  data: any
): GraftRowMergeApplyPolicy | undefined {
  if (!data || typeof data !== "object") return undefined
  return {
    foreignKeys: String(data.foreign_keys ?? data.foreignKeys ?? ""),
    triggers: String(data.triggers ?? ""),
    validation: parseStringArray(data.validation),
    defaultSemanticKeys: parseStringArray(
      data.default_semantic_keys ?? data.defaultSemanticKeys
    ),
    internalResolvers: parseResolverRecord(
      data.internal_resolvers ?? data.internalResolvers
    ),
    schemaResolvers: parseResolverRecord(
      data.schema_resolvers ?? data.schemaResolvers
    ),
    generatedColumns: parseGeneratedColumnsRecord(
      data.generated_columns ?? data.generatedColumns
    ),
  }
}

function parseGeneratedColumnsRecord(data: unknown): Record<string, string[]> {
  if (Array.isArray(data)) {
    return Object.fromEntries(
      data
        .map((item) => {
          if (!item || typeof item !== "object") return null
          const record = item as Record<string, unknown>
          const table = String(record.table ?? record.name ?? "")
          const columns = parseStringArray(record.columns)
          return table && columns.length > 0 ? [table, columns] : null
        })
        .filter((entry): entry is [string, string[]] => Boolean(entry))
    )
  }
  if (!data || typeof data !== "object") return {}
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>)
      .map(([table, columns]) => [table, parseStringArray(columns)] as const)
      .filter(([, columns]) => columns.length > 0)
  )
}

function parseResolverRecord(data: unknown): Record<string, string> {
  if (Array.isArray(data)) {
    return Object.fromEntries(
      data
        .map((item) => {
          if (!item || typeof item !== "object") return null
          const record = item as Record<string, unknown>
          const table = String(
            record.table ?? record.name ?? record.operation ?? ""
          )
          const resolver = String(record.resolver ?? record.strategy ?? "")
          return table && resolver ? [table, resolver] : null
        })
        .filter((entry): entry is [string, string] => Boolean(entry))
    )
  }
  if (!data || typeof data !== "object") return {}
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).map(([key, value]) => [
      key,
      String(value),
    ])
  )
}

export type GraftConflictArtifactKind = "row" | "schema" | "opaque" | "file"

export interface GraftConflictArtifact {
  id: string
  path: string
  kind: GraftConflictArtifactKind | string
  reason: string
  status: string
  resolution?: GraftConflictResolution | string
  table?: string
  columns?: string[]
  rowid?: number
  key?: GraftRowKey
  oursRowid?: number
  theirsRowid?: number
  oursKey?: GraftRowKey
  theirsKey?: GraftRowKey
  semanticKey?: string[]
  name?: string
  entryType?: string
  columnChanges?: GraftSchemaColumnChange[]
  change?: string
  owner?: string
  oursOp?: string
  theirsOp?: string
  baseRow?: unknown[] | null
  oursRow?: unknown[] | null
  theirsRow?: unknown[] | null
  message?: string
}

export interface GraftConflictListResult {
  mergeHead?: string
  conflicts: GraftConflictArtifact[]
  isEmpty: boolean
  rawMessage?: string
}

export interface GraftResolveConflictResult {
  operation?: string
  path?: string
  resolution?: GraftConflictResolution | string
  remainingConflicts?: number
  rawMessage?: string
}

/** Parse `graft conflicts --json` output. */
export function parseGraftConflicts(data: any): GraftConflictListResult {
  const json = parseGraftJson<Record<string, any>>(data)
  const conflicts = Array.isArray(json?.conflicts)
    ? json.conflicts.map(parseGraftConflictArtifact)
    : []

  return {
    mergeHead:
      json?.merge_head != null
        ? String(json.merge_head)
        : json?.mergeHead != null
          ? String(json.mergeHead)
          : undefined,
    conflicts,
    isEmpty: conflicts.length === 0,
    rawMessage: extractGraftJsonRaw(data),
  }
}

function parseGraftConflictArtifact(data: any): GraftConflictArtifact {
  const artifact: GraftConflictArtifact = {
    id: String(data?.id ?? ""),
    path: String(data?.path ?? ""),
    kind: String(data?.kind ?? "file"),
    reason: String(data?.reason ?? ""),
    status: String(data?.status ?? "unresolved"),
    resolution: data?.resolution != null ? String(data.resolution) : undefined,
    table: data?.table != null ? String(data.table) : undefined,
    columns: Array.isArray(data?.columns)
      ? data.columns.map(String)
      : undefined,
    name: data?.name != null ? String(data.name) : undefined,
    entryType:
      data?.entry_type != null
        ? String(data.entry_type)
        : data?.entryType != null
          ? String(data.entryType)
          : undefined,
    columnChanges: parseSchemaColumnChanges(
      data?.column_changes ?? data?.columnChanges
    ),
    change: data?.change != null ? String(data.change) : undefined,
    owner: data?.owner != null ? String(data.owner) : undefined,
    oursOp:
      data?.ours_op != null
        ? String(data.ours_op)
        : data?.oursOp != null
          ? String(data.oursOp)
          : undefined,
    theirsOp:
      data?.theirs_op != null
        ? String(data.theirs_op)
        : data?.theirsOp != null
          ? String(data.theirsOp)
          : undefined,
    baseRow: data?.base_row ?? data?.baseRow ?? null,
    oursRow: data?.ours_row ?? data?.oursRow ?? null,
    theirsRow: data?.theirs_row ?? data?.theirsRow ?? null,
    message: data?.message != null ? String(data.message) : undefined,
  }
  const rowid = optionalRowId(data?.rowid)
  const key = parseGraftRowKey(data?.key)
  const oursRowid = optionalRowId(data?.ours_rowid ?? data?.oursRowid)
  const theirsRowid = optionalRowId(data?.theirs_rowid ?? data?.theirsRowid)
  const semanticKey = parseStringArray(data?.semantic_key ?? data?.semanticKey)
  if (rowid !== undefined) artifact.rowid = rowid
  if (key) artifact.key = key
  if (oursRowid !== undefined) artifact.oursRowid = oursRowid
  if (theirsRowid !== undefined) artifact.theirsRowid = theirsRowid
  const oursKey = parseGraftRowKey(data?.ours_key ?? data?.oursKey)
  const theirsKey = parseGraftRowKey(data?.theirs_key ?? data?.theirsKey)
  if (oursKey) artifact.oursKey = oursKey
  if (theirsKey) artifact.theirsKey = theirsKey
  if (semanticKey.length > 0) artifact.semanticKey = semanticKey
  return artifact
}

/** Parse `graft resolve --json` output. */
export function parseGraftResolveConflict(
  data: any
): GraftResolveConflictResult {
  const json = parseGraftJson<Record<string, any>>(data)
  if (!json) return { rawMessage: extractGraftJsonRaw(data) }

  return {
    operation: json.operation != null ? String(json.operation) : undefined,
    path: json.path != null ? String(json.path) : undefined,
    resolution: json.resolution != null ? String(json.resolution) : undefined,
    remainingConflicts:
      json.remaining_conflicts != null
        ? Number(json.remaining_conflicts)
        : json.remainingConflicts != null
          ? Number(json.remainingConflicts)
          : undefined,
    rawMessage: extractGraftJsonRaw(data),
  }
}

export interface GraftBranch {
  name: string
  volumeId?: string
  local?: string
  remote?: string
  status?: string
  isCurrent: boolean
}

export interface GraftTag {
  name: string
  target?: string
  object?: string
  annotated: boolean
}

/** Parse `graft branch --json` output into structured data. */
export function parseGraftBranches(data: any): GraftBranch[] {
  const json = parseGraftJson<any>(data)
  if (json) {
    const local = Array.isArray(json.branches)
      ? json.branches.map(
          (branch: any): GraftBranch => ({
            name: String(branch.name ?? ""),
            volumeId:
              branch.target != null
                ? String(branch.target).slice(0, 12)
                : undefined,
            status: branch.upstream
              ? `${String(branch.upstream.remote)}/${String(branch.upstream.branch)}`
              : undefined,
            isCurrent: Boolean(branch.current),
          })
        )
      : []
    const remote = Array.isArray(json.remote_branches)
      ? json.remote_branches.map(
          (branch: any): GraftBranch => ({
            name: `remotes/${String(branch.remote)}/${String(branch.branch)}`,
            volumeId:
              branch.head != null
                ? String(branch.head).slice(0, 12)
                : undefined,
            remote: String(branch.remote),
            status: "remote",
            isCurrent: false,
          })
        )
      : []
    return [...local, ...remote].filter((branch) => branch.name.length > 0)
  }

  return []
}

/** Parse `graft tag --json` output into structured data. */
export function parseGraftTags(data: any): GraftTag[] {
  const json = parseGraftJson<any>(data)
  const tags = Array.isArray(json)
    ? json
    : Array.isArray(json?.tags)
      ? json.tags
      : []
  if (tags.length > 0) {
    return tags
      .map(
        (tag: any): GraftTag => ({
          name: String(tag.name ?? ""),
          target: tag.target != null ? String(tag.target) : undefined,
          object: tag.object != null ? String(tag.object) : undefined,
          annotated: Boolean(tag.annotated),
        })
      )
      .filter((tag: GraftTag) => tag.name.length > 0)
  }

  return []
}

export interface GraftVolume {
  id: string
  local?: string
  remote?: string
  status?: string
  isCurrent: boolean
}

/** Parse the optional VFS data-plane volume diagnostic. */
export function parseGraftVolumes(data: any): GraftVolume[] {
  const json = parseGraftJson<any[]>(data)
  if (Array.isArray(json)) {
    return json
      .map(
        (volume: any): GraftVolume => ({
          id: String(volume.id ?? volume.vid ?? ""),
          local: volume.local != null ? String(volume.local) : undefined,
          remote: volume.remote != null ? String(volume.remote) : undefined,
          status: volume.status != null ? String(volume.status) : undefined,
          isCurrent: Boolean(volume.current ?? volume.isCurrent),
        })
      )
      .filter((volume) => volume.id.length > 0)
  }

  return []
}

export interface GraftAudit {
  localPages?: number
  totalPages?: number
  percentage?: number
  checksum?: string
  needsHydrate?: boolean
  rawMessage?: string
}

/** Normalize CLI JSON or an optional extension diagnostic result. */
function extractGraftJsonRaw(data: any): string {
  if (typeof data === "string") return data
  if (Array.isArray(data) && data.length === 1) {
    const first = data[0]
    if (first && typeof first === "object") {
      const values = Object.values(first)
      if (values.length === 1 && typeof values[0] === "string") {
        return values[0]
      }
    }
  }
  return data == null ? "" : JSON.stringify(data)
}

function parseGraftJson<T = unknown>(data: any): T | null {
  const raw = extractGraftJsonRaw(data).trim()
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function parseGraftJsonResult<T = unknown>(data: any): T {
  const parsed = parseGraftJson<T>(data)
  if (parsed == null) {
    throw new Error(`Invalid Graft JSON result: ${extractGraftJsonRaw(data)}`)
  }
  return parsed
}

function commitFileMap(row: Record<string, unknown>): Record<string, any> {
  return row.files && typeof row.files === "object" && !Array.isArray(row.files)
    ? (row.files as Record<string, any>)
    : {}
}

function commitParents(row: Record<string, unknown>): string[] {
  if (Array.isArray(row.parents)) {
    return row.parents.map((parent) => String(parent))
  }
  return row.parent != null ? [String(row.parent)] : []
}

function snapshotPageCount(state: any): number | undefined {
  const pageCount = Number(state?.snapshot?.page_count)
  return Number.isFinite(pageCount) && pageCount > 0 ? pageCount : undefined
}

function snapshotRangeCount(state: any): number {
  const ranges = state?.snapshot?.ranges
  return Array.isArray(ranges) ? ranges.length : 0
}

function optionalNumber(value: unknown): number | undefined {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : undefined
}

function optionalRowId(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined
}

function parseGraftRowKey(value: unknown): GraftRowKey | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return undefined

  const key: GraftRowKey = {}
  for (const [column, raw] of entries) {
    if (!column || column.includes("\0")) return undefined
    if (
      raw === null ||
      typeof raw === "string" ||
      (typeof raw === "number" && Number.isFinite(raw))
    ) {
      key[column] = raw
      continue
    }
    if (
      raw &&
      typeof raw === "object" &&
      !Array.isArray(raw) &&
      Object.keys(raw).length === 1
    ) {
      const blob = (raw as Record<string, unknown>).$blob
      if (
        typeof blob === "string" &&
        blob.length % 2 === 0 &&
        /^[0-9a-f]*$/.test(blob)
      ) {
        key[column] = { $blob: blob }
        continue
      }
    }
    return undefined
  }
  return key
}

function nonNegativeNumber(value: unknown): number {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : 0
}

export interface GraftStorageCommitRef {
  lsn: number
  commitHash?: string
}

export interface GraftSnapshotRangeRef {
  log?: string
  start?: number
  end?: number
  commits: GraftStorageCommitRef[]
}

export interface GraftFileStateRef {
  volume?: string
  snapshot?: {
    pageCount?: number
    ranges: GraftSnapshotRangeRef[]
  }
}

export function parseGraftFileState(state: any): GraftFileStateRef | undefined {
  if (!state || typeof state !== "object") return undefined
  const snapshot = state.snapshot
  const ranges = Array.isArray(snapshot?.ranges)
    ? snapshot.ranges
        .filter((range: any) => range && typeof range === "object")
        .map((range: any) => ({
          log: range.log != null ? String(range.log) : undefined,
          start: optionalNumber(range.start),
          end: optionalNumber(range.end),
          commits: Array.isArray(range.commits)
            ? range.commits
                .filter((commit: any) => commit && typeof commit === "object")
                .map((commit: any) => ({
                  lsn: optionalNumber(commit.lsn) ?? 0,
                  commitHash:
                    commit.commit_hash != null
                      ? String(commit.commit_hash)
                      : commit.commitHash != null
                        ? String(commit.commitHash)
                        : undefined,
                }))
                .filter((commit: GraftStorageCommitRef) => commit.lsn > 0)
            : [],
        }))
    : []

  return {
    volume: state.volume != null ? String(state.volume) : undefined,
    snapshot: snapshot
      ? {
          pageCount: snapshotPageCount(state),
          ranges,
        }
      : undefined,
  }
}

export function graftFileStateHeadLsn(
  state: GraftFileStateRef | undefined
): number | undefined {
  const ranges = state?.snapshot?.ranges
  if (!ranges?.length) return undefined
  const head = ranges[0]
  return head.end ?? head.commits[head.commits.length - 1]?.lsn
}

// =============================================================================
// graft log --json
// =============================================================================

export interface GraftLogEntry {
  id: string
  shortId: string
  parent?: string
  parents: string[]
  tree?: string
  files: string[]
  lsn: string
  pages: number
  changed: number
  checkpoint: boolean
  segment: string
  timestampMs?: number
  message?: string
  tables: GraftLogTableSummary[]
  changedTables: number
}

export interface GraftLogResult {
  entries: GraftLogEntry[]
  isEmpty: boolean
}

export interface GraftLogTableSummary {
  table: string
  inserts: number
  deletes: number
  updates: number
}

function commitTableSummary(
  row: Record<string, unknown>
): GraftLogTableSummary[] {
  const rawTables = row.tables
  if (!Array.isArray(rawTables)) return []
  return rawTables
    .filter((table: any) => table && typeof table === "object")
    .map((table: any) => ({
      table: String(table.table ?? table.name ?? ""),
      inserts: nonNegativeNumber(table.inserts),
      deletes: nonNegativeNumber(table.deletes),
      updates: nonNegativeNumber(table.updates),
    }))
    .filter(
      (table) =>
        table.table && table.inserts + table.deletes + table.updates > 0
    )
}

function changedTableCount(
  row: Record<string, unknown>,
  tables: GraftLogTableSummary[]
): number {
  const rawChangedTables = Number(row.changed_tables ?? row.changedTables)
  return Number.isFinite(rawChangedTables) && rawChangedTables >= 0
    ? rawChangedTables
    : tables.length
}

function rowChangeCount(tables: GraftLogTableSummary[]): number {
  return tables.reduce(
    (total, table) => total + table.inserts + table.deletes + table.updates,
    0
  )
}

/**
 * Parse `graft log --json` output.
 *
 * Returns repository commit JSON array.
 */
export function parseGraftLog(data: any): GraftLogResult {
  const arr = parseGraftJson<Array<Record<string, unknown>>>(data)
  if (!arr || arr.length === 0) {
    return { entries: [], isEmpty: true }
  }

  const entries: GraftLogEntry[] = arr.map((row) => {
    const id = String(row.id ?? row.lsn ?? "")
    const fileMap = commitFileMap(row)
    const files = Object.keys(fileMap)
    const firstFile = fileMap[files[0]]
    const changed = files.reduce(
      (total, file) => total + snapshotRangeCount(fileMap[file]),
      0
    )
    const tables = commitTableSummary(row)
    const changedTables = changedTableCount(row, tables)
    return {
      id,
      shortId: id.slice(0, 12),
      parent: row.parent != null ? String(row.parent) : undefined,
      parents: commitParents(row),
      tree: row.tree != null ? String(row.tree) : undefined,
      files,
      // Backward-compatible alias for older UI code. In repository mode this
      // is a commit id, not a storage LSN.
      lsn: id,
      pages: Number(firstFile?.snapshot?.page_count ?? row.page_count ?? 0),
      changed: changed || Number(row.changed_pages ?? files.length),
      checkpoint: Boolean(row.is_checkpoint ?? false),
      segment: String(row.segment ?? ""),
      timestampMs:
        row.timestamp_ms != null ? Number(row.timestamp_ms) : undefined,
      message: row.message != null ? String(row.message) : undefined,
      tables,
      changedTables,
    }
  })

  return { entries, isEmpty: false }
}

// =============================================================================
// graft show --json
// =============================================================================

export interface GraftShowSchema {
  type: string
  table: string
  rootPage?: number
  rowCount?: number
}

export interface GraftShowResult {
  id: string
  shortId: string
  parent?: string
  parents: string[]
  tree?: string
  message?: string
  timestampMs?: number
  files: string[]
  lsn: string
  pageCount?: number
  checkpoint: boolean
  segment?: string
  changedPages?: number
  tables: GraftLogTableSummary[]
  changedTables: number
  rowChanges: number
  schemas: GraftShowSchema[]
  isEmpty: boolean
}

/**
 * Parse `graft show --json <rev>` output.
 *
 * Returns JSON:
 *   {"lsn":3,"page_count":2,"is_checkpoint":false,
 *    "segment":"...","changed_pages":1,
 *    "tables":[{"type":"table","name":"users","root_page":2,"rows":2}]}
 */
export function parseGraftShow(data: any): GraftShowResult | null {
  const obj = parseGraftJson<Record<string, unknown>>(data)
  if (!obj) return null

  const schemas: GraftShowSchema[] = []
  const fileMap = commitFileMap(obj)
  const files = Object.keys(fileMap)

  if (files.length > 0 || obj.id != null) {
    let pageCount = 0
    for (const file of files) {
      const state = fileMap[file]
      const filePageCount = snapshotPageCount(state)
      if (filePageCount) pageCount += filePageCount
      schemas.push({
        type: "database",
        table: file,
        rowCount: filePageCount,
      })
    }

    const id = String(obj.id ?? obj.lsn ?? "")
    const tables = commitTableSummary(obj)
    return {
      id,
      shortId: id.slice(0, 12),
      parent: obj.parent != null ? String(obj.parent) : undefined,
      parents: commitParents(obj),
      tree: obj.tree != null ? String(obj.tree) : undefined,
      message: obj.message != null ? String(obj.message) : undefined,
      timestampMs:
        obj.timestamp_ms != null ? Number(obj.timestamp_ms) : undefined,
      files,
      lsn: id,
      pageCount: pageCount || undefined,
      checkpoint: Boolean(obj.is_checkpoint ?? false),
      segment: obj.segment != null ? String(obj.segment) : undefined,
      changedPages: Number(obj.changed_pages ?? undefined) || undefined,
      tables,
      changedTables: changedTableCount(obj, tables),
      rowChanges: rowChangeCount(tables),
      schemas,
      isEmpty: files.length === 0,
    }
  }

  const rawTables = obj.tables
  if (Array.isArray(rawTables)) {
    for (const t of rawTables) {
      if (t && typeof t === "object") {
        schemas.push({
          type: String(t.type ?? "table"),
          table: String(t.name ?? ""),
          rootPage: Number(t.root_page ?? t.rootPage ?? undefined) || undefined,
          rowCount: Number(t.rows ?? t.rowCount ?? undefined) || undefined,
        })
      }
    }
  }

  const lsn = String(obj.lsn ?? "")
  return {
    id: lsn,
    shortId: lsn.slice(0, 12),
    parents: [],
    files: [],
    lsn,
    pageCount: Number(obj.page_count ?? undefined) || undefined,
    checkpoint: Boolean(obj.is_checkpoint ?? false),
    segment: obj.segment != null ? String(obj.segment) : undefined,
    changedPages: Number(obj.changed_pages ?? undefined) || undefined,
    tables: [],
    changedTables: 0,
    rowChanges: 0,
    schemas,
    isEmpty: schemas.length === 0,
  }
}

// =============================================================================
// graft diff --json
// =============================================================================

export interface GraftDiffTableChange {
  table: string
  inserts: number
  deletes: number
  updates: number
}

export interface GraftDiffRowChange {
  table: string
  op: "insert" | "delete" | "update"
  rowid?: number | string
  key?: GraftRowKey
  values?: unknown[]
  before?: unknown[]
  after?: unknown[]
  old_values?: unknown[]
  columns?: string[]
  primaryKeyColumns?: string[]
}

export interface GraftDiffFileChange {
  path: string
  change: string
  fromPages?: number
  toPages?: number
  fromState?: GraftFileStateRef
  toState?: GraftFileStateRef
  fromLsn?: number
  toLsn?: number
  rowDiffAvailable?: boolean
  logicalStatus?: string
  capabilities: string[]
  limitations: GraftDiffLimitation[]
  message?: string
}

export interface GraftDiffOpaqueChange {
  table: string
  change: string
  reason: string
  owner?: string
}

export interface GraftDiffLimitation {
  kind: string
  subject?: string
}

export interface GraftDiffResult {
  from: string
  to: string
  mode: "summary" | "rows"
  files: GraftDiffFileChange[]
  tables: GraftDiffTableChange[]
  rows: GraftDiffRowChange[]
  opaqueChanges: GraftDiffOpaqueChange[]
  logicalStatus?: string
  capabilities: string[]
  limitations: GraftDiffLimitation[]
  empty: boolean
}

function appendGraftTableDiffs(
  rawTables: unknown,
  tables: GraftDiffTableChange[],
  rows: GraftDiffRowChange[]
) {
  if (!Array.isArray(rawTables)) return

  for (const t of rawTables) {
    if (!t || typeof t !== "object") continue

    const table = String((t as any).name ?? (t as any).table ?? "")
    const changes = (t as any).changes
    const counts = { inserts: 0, deletes: 0, updates: 0 }
    const cols = Array.isArray((t as any).columns)
      ? (t as any).columns.map(String)
      : undefined
    const primaryKeyColumns = parseStringArray(
      (t as any).primary_key_columns ?? (t as any).primaryKeyColumns
    )

    if (Array.isArray(changes)) {
      for (const c of changes) {
        if (!c || typeof c !== "object") continue
        const op = String((c as any).op ?? "").toLowerCase()
        if (op !== "insert" && op !== "delete" && op !== "update") continue

        if (op === "insert") counts.inserts += 1
        else if (op === "delete") counts.deletes += 1
        else counts.updates += 1

        const change: GraftDiffRowChange = {
          table,
          op,
          rowid: (c as any).rowid ?? (c as any).row_id ?? undefined,
          columns: cols,
          primaryKeyColumns,
        }
        const key = parseGraftRowKey((c as any).key)
        if (key) change.key = key
        if ((c as any).values !== undefined) change.values = (c as any).values
        if ((c as any).values !== undefined && op === "update") {
          change.after = (c as any).values
        }
        if ((c as any).old_values !== undefined) {
          change.old_values = (c as any).old_values
          change.before = (c as any).old_values
        }
        if ((c as any).before !== undefined) change.before = (c as any).before
        if ((c as any).after !== undefined) change.after = (c as any).after
        rows.push(change)
      }
    }

    tables.push({
      table,
      inserts:
        (t as any).inserts == null
          ? counts.inserts
          : Number((t as any).inserts),
      deletes:
        (t as any).deletes == null
          ? counts.deletes
          : Number((t as any).deletes),
      updates:
        (t as any).updates == null
          ? counts.updates
          : Number((t as any).updates),
    })
  }
}

function appendGraftOpaqueChanges(
  rawOpaqueChanges: unknown,
  opaqueChanges: GraftDiffOpaqueChange[]
) {
  if (!Array.isArray(rawOpaqueChanges)) return

  for (const change of rawOpaqueChanges) {
    if (!change || typeof change !== "object") continue
    opaqueChanges.push({
      table: String((change as any).name ?? (change as any).table ?? ""),
      change: String((change as any).change ?? "modified"),
      reason: String((change as any).reason ?? "opaque"),
      owner:
        (change as any).owner === undefined || (change as any).owner === null
          ? undefined
          : String((change as any).owner),
    })
  }
}

function parseStringArray(data: unknown): string[] {
  return Array.isArray(data)
    ? data
        .map((item) => (item == null ? "" : String(item)))
        .filter((item) => item.length > 0)
    : []
}

function parseGraftDiffLimitations(data: unknown): GraftDiffLimitation[] {
  if (!Array.isArray(data)) return []
  return data
    .map((limitation) => {
      if (typeof limitation === "string") {
        return { kind: limitation }
      }
      if (!limitation || typeof limitation !== "object") return null
      const item = limitation as Record<string, unknown>
      const kind = String(item.kind ?? item.reason ?? "")
      if (!kind) return null
      return {
        kind,
        subject:
          item.subject === undefined || item.subject === null
            ? undefined
            : String(item.subject),
      }
    })
    .filter((limitation): limitation is GraftDiffLimitation =>
      Boolean(limitation)
    )
}

function aggregateRepoLogicalStatus(files: GraftDiffFileChange[]) {
  const statuses = files
    .map((file) => file.logicalStatus)
    .filter((status): status is string => Boolean(status))
  if (statuses.includes("logical_changes")) return "logical_changes"
  if (statuses.includes("unsupported_logical_surface")) {
    return "unsupported_logical_surface"
  }
  if (statuses.includes("file_changed_no_supported_logical_changes")) {
    return "file_changed_no_supported_logical_changes"
  }
  if (statuses.includes("row_diff_unavailable")) return "row_diff_unavailable"
  return undefined
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values))
}

/**
 * Parse `graft diff --json [--rows] <from> [to]` output.
 *
 * Summary:
 *   {"from_lsn":1,"to_lsn":3,"tables":[{"name":"users","inserts":2,"deletes":0,"updates":0}]}
 *
 * Rows:
 *   {"from_lsn":1,"to_lsn":3,
 *    "tables":[{"name":"users","columns":["id","name","email"],
 *               "changes":[{"op":"insert","rowid":1,"values":[null,"Alice","alice@example.com"]}]}]}
 */
export function parseGraftDiff(
  data: any,
  opts?: { from: string; to: string; mode: "summary" | "rows" }
): GraftDiffResult {
  const obj = parseGraftJson<Record<string, unknown>>(data)
  const from = opts?.from ?? String(obj?.from ?? obj?.from_lsn ?? "")
  const to = opts?.to ?? String(obj?.to ?? obj?.to_lsn ?? "")
  const mode = opts?.mode ?? "summary"

  if (!obj) {
    return {
      from,
      to,
      mode,
      files: [],
      tables: [],
      rows: [],
      opaqueChanges: [],
      capabilities: [],
      limitations: [],
      empty: true,
    }
  }

  if (Array.isArray(obj.files)) {
    let hasRowPayload = false
    const tables: GraftDiffTableChange[] = []
    const rows: GraftDiffRowChange[] = []
    const opaqueChanges: GraftDiffOpaqueChange[] = []
    const files: GraftDiffFileChange[] = obj.files
      .filter((file) => file && typeof file === "object")
      .map((file: any) => {
        const fromState = parseGraftFileState(file.from)
        const toState = parseGraftFileState(file.to)
        const change: GraftDiffFileChange = {
          path: String(file.path ?? ""),
          change: String(file.change ?? ""),
          fromPages: snapshotPageCount(file.from),
          toPages: snapshotPageCount(file.to),
          fromState,
          toState,
          fromLsn: graftFileStateHeadLsn(fromState),
          toLsn: graftFileStateHeadLsn(toState),
          capabilities: parseStringArray(file.capabilities),
          limitations: parseGraftDiffLimitations(
            file.limitations ?? file.limits
          ),
        }
        if (file.logical_status != null || file.logicalStatus != null) {
          change.logicalStatus = String(
            file.logical_status ?? file.logicalStatus
          )
        }
        if (file.row_diff_available != null) {
          change.rowDiffAvailable = Boolean(file.row_diff_available)
        } else if (file.rowDiffAvailable != null) {
          change.rowDiffAvailable = Boolean(file.rowDiffAvailable)
        }
        if (file.message != null && file.message !== "") {
          change.message = String(file.message)
        }
        return change
      })

    for (const file of obj.files) {
      if (!file || typeof file !== "object") continue
      const rawOpaqueChanges = file.opaque_changes ?? file.opaqueChanges
      if (
        file.row_diff_available === true ||
        file.rowDiffAvailable === true ||
        Array.isArray(file.tables) ||
        Array.isArray(rawOpaqueChanges)
      ) {
        hasRowPayload = true
      }
      appendGraftTableDiffs(file.tables, tables, rows)
      appendGraftOpaqueChanges(rawOpaqueChanges, opaqueChanges)
    }

    if (!hasRowPayload) {
      tables.push(
        ...files.map((file) => ({
          table: file.path,
          inserts: file.change === "added" ? 1 : 0,
          deletes: file.change === "deleted" ? 1 : 0,
          updates: file.change === "modified" ? 1 : 0,
        }))
      )
    }

    return {
      from,
      to,
      mode,
      files,
      tables,
      rows,
      opaqueChanges,
      logicalStatus:
        obj.logical_status != null || obj.logicalStatus != null
          ? String(obj.logical_status ?? obj.logicalStatus)
          : aggregateRepoLogicalStatus(files),
      capabilities: uniqueStrings(
        parseStringArray(obj.capabilities).concat(
          files.flatMap((file) => file.capabilities)
        )
      ),
      limitations: files.flatMap((file) => file.limitations),
      empty: files.length === 0,
    }
  }

  const tables: GraftDiffTableChange[] = []
  const rows: GraftDiffRowChange[] = []
  const opaqueChanges: GraftDiffOpaqueChange[] = []

  appendGraftTableDiffs(obj.tables, tables, rows)

  const rawOpaqueChanges = obj.opaque_changes ?? obj.opaqueChanges
  appendGraftOpaqueChanges(rawOpaqueChanges, opaqueChanges)

  return {
    from,
    to,
    mode,
    files: [],
    tables,
    rows,
    opaqueChanges,
    logicalStatus:
      obj.logical_status != null || obj.logicalStatus != null
        ? String(obj.logical_status ?? obj.logicalStatus)
        : undefined,
    capabilities: parseStringArray(obj.capabilities),
    limitations: parseGraftDiffLimitations(obj.limitations),
    empty:
      tables.length === 0 && rows.length === 0 && opaqueChanges.length === 0,
  }
}
// =============================================================================
// graft checkout / graft reset
// =============================================================================

// =============================================================================
// graft log --json filtered for a table timeline
// =============================================================================

export interface GraftTableLogEntry {
  id: string
  shortId: string
  files: string[]
  lsn: string
  timestampMs?: number
  summary: string
  detail: string
}

export interface GraftTableLogResult {
  table: string
  entries: GraftTableLogEntry[]
  isEmpty: boolean
}

/**
 * Parse `graft log --json` output for the table version panel.
 */
export function parseGraftTableLog(
  data: any,
  table: string
): GraftTableLogResult {
  const arr = parseGraftJson<Array<Record<string, unknown>>>(data)
  if (!arr || arr.length === 0) {
    return { table, entries: [], isEmpty: true }
  }

  const entries: GraftTableLogEntry[] = arr.map((row) => {
    const id = String(row.id ?? row.lsn ?? "")
    const files = Object.keys(commitFileMap(row))
    const detail =
      row.detail != null
        ? String(row.detail)
        : files.length > 0
          ? files.join(", ")
          : "Repository commit"
    return {
      id,
      shortId: id.slice(0, 12),
      files,
      lsn: id,
      timestampMs:
        row.timestamp_ms != null ? Number(row.timestamp_ms) : undefined,
      summary: String(
        row.message ?? row.summary ?? `Commit ${id.slice(0, 12)}`
      ),
      detail,
    }
  })

  return { table, entries, isEmpty: false }
}

export interface GraftCheckoutResult {
  rawMessage: string
  lsn?: string
  revision?: string
  volumeId?: string
  localLogId?: string
}

/** Parse `graft checkout --json` / `graft reset --json` output. */
export function parseGraftCheckout(data: any): GraftCheckoutResult {
  const json = parseGraftJson<Record<string, unknown>>(data)
  if (json) {
    const target = json.target != null ? String(json.target) : undefined
    return {
      rawMessage: extractGraftJsonRaw(data),
      lsn: target,
      revision: target,
    }
  }

  return { rawMessage: extractGraftJsonRaw(data).trim() }
}

export interface GraftInfo {
  volumeId?: string
  localLog?: string
  remoteLog?: string
  lastSync?: string
  snapshot?: string
  snapshotPages?: number
  snapshotSize?: string
  rawMessage?: string
}

/** Parse the optional VFS data-plane info diagnostic. */
export function parseGraftInfo(data: any): GraftInfo | null {
  const json = parseGraftJson<Record<string, unknown>>(data)
  if (json) {
    const snapshotSizeBytes = Number(json.snapshot_size_bytes)
    return {
      volumeId: json.vid != null ? String(json.vid) : undefined,
      localLog: json.local != null ? String(json.local) : undefined,
      remoteLog: json.remote != null ? String(json.remote) : undefined,
      snapshotPages:
        Number(json.snapshot_pages ?? json.page_count) || undefined,
      snapshotSize: Number.isFinite(snapshotSizeBytes)
        ? String(snapshotSizeBytes)
        : undefined,
      rawMessage: extractGraftJsonRaw(data),
    }
  }

  return null
}

/** Parse the optional VFS data-plane audit diagnostic. */
export function parseGraftAudit(data: any): GraftAudit | null {
  const json = parseGraftJson<Record<string, unknown>>(data)
  if (json) {
    return {
      localPages: Number(json.local_pages ?? 0),
      totalPages: Number(json.total_pages ?? 0),
      percentage: Number(json.percentage ?? 0),
      checksum: json.checksum != null ? String(json.checksum) : undefined,
      needsHydrate: Boolean(json.needs_hydrate),
      rawMessage: extractGraftJsonRaw(data),
    }
  }

  return null
}
