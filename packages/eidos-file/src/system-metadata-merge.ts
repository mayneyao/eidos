import type { EidosFileConnection, EidosFileSqlPrimitive } from "./connection"
import { isCanonicalEidosFileInstant } from "./temporal"
import type {
  EidosFileValidationIssue,
  EidosFileValidationResult,
} from "./types"
import { validateEidosFile } from "./validation"

const PROFILE = "ER-System-Merge-1.0"
const MAX_INT64 = 9_223_372_036_854_775_807n
const SIDE_KEY = /^[a-z0-9._~-]{1,128}$/

const SYSTEM_TABLES = [
  "eidos__meta",
  "eidos__tables",
  "eidos__fields",
  "eidos__features",
  "eidos__relation_fields",
  "eidos__formula_fields",
  "eidos__lookup_fields",
  "eidos__views",
] as const

export const EIDOS_SYSTEM_METADATA_TABLES: readonly string[] = SYSTEM_TABLES

export type EidosSystemMergeObjectKind =
  | "file"
  | "table"
  | "field"
  | "view"
  | "feature"
  | "dependency"

export type EidosSystemMergeConflictCode =
  | "identity-collision"
  | "name-collision"
  | "delete-update"
  | "table-rename-conflict"
  | "field-rename-conflict"
  | "field-conversion-conflict"
  | "option-catalog-conflict"
  | "dependency-conflict"
  | "feature-conflict"
  | "unsupported-schema-change"
  | "validation-failed"

export interface EidosSystemMergeSummary {
  state: "absent" | "present"
  changedGroups?: string[]
}

export interface EidosSystemMergeDomainConflict {
  code: EidosSystemMergeConflictCode
  objectKind: EidosSystemMergeObjectKind
  objectId: string
  group: string
  message: string
  base: EidosSystemMergeSummary
  ours: EidosSystemMergeSummary
  theirs: EidosSystemMergeSummary
  resolutionScope: "object" | "group" | "schema" | "dependency"
}

export interface EidosSystemMergeAutomaticResolution {
  objectKind: EidosSystemMergeObjectKind
  objectId: string
  group: string
  reason: "last-write-wins" | "merge-finalization"
  selectedSide?: "ours" | "theirs"
}

export interface EidosSystemMergeInputIssue {
  input: "base" | "ours" | "theirs" | "result" | "request"
  code: string
  message: string
}

export interface EidosSystemMergeValidationProof {
  profile: typeof PROFILE
  level: "full"
  fileId: string
  revision: string
  operationInstant: string
  errors: EidosFileValidationIssue[]
  warnings: EidosFileValidationIssue[]
}

export type EidosSystemMergeResult =
  | {
      outcome: "merged"
      automaticResolutions: EidosSystemMergeAutomaticResolution[]
      validation: EidosSystemMergeValidationProof
    }
  | {
      outcome: "conflict"
      conflicts: EidosSystemMergeDomainConflict[]
      automaticResolutions: EidosSystemMergeAutomaticResolution[]
    }
  | { outcome: "invalid-input"; issues: EidosSystemMergeInputIssue[] }
  | {
      outcome: "failed"
      code: "clock-not-after-input" | "revision-exhausted"
    }

export interface EidosSystemMergeInput {
  base: EidosFileConnection
  ours: EidosFileConnection
  theirs: EidosFileConnection
  /** Private candidate seeded from Ours with non-provider tables pre-merged. */
  result: EidosFileConnection
  oursKey: string
  theirsKey: string
  operationInstant: string
}

interface MetaRow {
  singleton: number
  format_major: number
  format_minor: number
  file_id: string
  title: string
  default_table_id: string | null
  revision: number | bigint
  created_at: string
  updated_at: string
}

interface TableRow {
  id: string
  name: string
  physical_name: string
  label_field_id: string
  position: number
  settings_json: string
  created_at: string
  updated_at: string
}

interface FieldRow {
  id: string
  table_id: string
  name: string
  physical_name: string | null
  type: string
  system_role: string | null
  nullable: number
  position: number
  settings_json: string
  created_at: string
  updated_at: string
}

interface RelationRow {
  field_id: string
  direction: string
  target_table_id: string
  cardinality: string
  inverse_of_field_id: string | null
  on_delete: string | null
}

interface FormulaRow {
  field_id: string
  source_text: string
  result_type: string
}

interface LookupRow {
  field_id: string
  relation_field_id: string
  target_field_id: string
  aggregate: string
  distinct_values: number
}

interface ViewRow {
  id: string
  table_id: string
  name: string
  type: string
  query_json: string
  layout_json: string
  position: number
  created_at: string
  updated_at: string
}

interface FeatureRow {
  name: string
  version: string
  required: number
  config_json: string
}

interface SystemSnapshot {
  meta: MetaRow
  tables: Map<string, TableRow>
  fields: Map<string, FieldRow>
  relations: Map<string, RelationRow>
  formulas: Map<string, FormulaRow>
  lookups: Map<string, LookupRow>
  views: Map<string, ViewRow>
  features: Map<string, FeatureRow>
}

interface MergePlan {
  meta: MetaRow
  tables: Map<string, TableRow>
  fields: Map<string, FieldRow>
  relations: Map<string, RelationRow>
  formulas: Map<string, FormulaRow>
  lookups: Map<string, LookupRow>
  views: Map<string, ViewRow>
  features: Map<string, FeatureRow>
  automaticResolutions: EidosSystemMergeAutomaticResolution[]
  conflicts: EidosSystemMergeDomainConflict[]
}

interface RankedSide {
  side: "ours" | "theirs"
  clock: string
  key: string
}

function mapRows<T>(rows: T[], key: (row: T) => string): Map<string, T> {
  return new Map(rows.map((row) => [key(row), row]))
}

function readSnapshot(connection: EidosFileConnection): SystemSnapshot {
  const meta = connection.get<MetaRow>(
    `SELECT singleton,format_major,format_minor,file_id,title,default_table_id,
      revision,created_at,updated_at FROM eidos__meta WHERE singleton=1`
  )
  if (!meta) throw new Error("Missing eidos__meta singleton")
  return {
    meta,
    tables: mapRows(
      connection.query<TableRow>(
        `SELECT id,name,physical_name,label_field_id,position,settings_json,created_at,updated_at
         FROM eidos__tables ORDER BY id`
      ),
      (row) => row.id
    ),
    fields: mapRows(
      connection.query<FieldRow>(
        `SELECT id,table_id,name,physical_name,type,system_role,nullable,position,
          settings_json,created_at,updated_at FROM eidos__fields ORDER BY id`
      ),
      (row) => row.id
    ),
    relations: mapRows(
      connection.query<RelationRow>(
        `SELECT field_id,direction,target_table_id,cardinality,inverse_of_field_id,on_delete
         FROM eidos__relation_fields ORDER BY field_id`
      ),
      (row) => row.field_id
    ),
    formulas: mapRows(
      connection.query<FormulaRow>(
        `SELECT field_id,source_text,result_type FROM eidos__formula_fields ORDER BY field_id`
      ),
      (row) => row.field_id
    ),
    lookups: mapRows(
      connection.query<LookupRow>(
        `SELECT field_id,relation_field_id,target_field_id,aggregate,distinct_values
         FROM eidos__lookup_fields ORDER BY field_id`
      ),
      (row) => row.field_id
    ),
    views: mapRows(
      connection.query<ViewRow>(
        `SELECT id,table_id,name,type,query_json,layout_json,position,created_at,updated_at
         FROM eidos__views ORDER BY id`
      ),
      (row) => row.id
    ),
    features: mapRows(
      connection.query<FeatureRow>(
        `SELECT name,version,required,config_json FROM eidos__features ORDER BY name`
      ),
      (row) => row.name
    ),
  }
}

function valueKey(value: unknown): string {
  if (typeof value === "bigint") return `bigint:${value.toString()}`
  if (Array.isArray(value)) return `[${value.map(valueKey).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${valueKey(entry)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function equal(left: unknown, right: unknown): boolean {
  return valueKey(left) === valueKey(right)
}

function ids<T>(...maps: Array<Map<string, T>>): string[] {
  return [...new Set(maps.flatMap((map) => [...map.keys()]))].sort()
}

function rankWinner(ours: RankedSide, theirs: RankedSide): "ours" | "theirs" {
  if (ours.clock !== theirs.clock) {
    return ours.clock > theirs.clock ? "ours" : "theirs"
  }
  return ours.key > theirs.key ? "ours" : "theirs"
}

function changedGroups(
  base: Record<string, unknown> | undefined,
  row: Record<string, unknown> | undefined,
  groups: Record<string, readonly string[]>
): string[] {
  if (!base || !row) return []
  return Object.entries(groups)
    .filter(([, columns]) =>
      columns.some((column) => !equal(base[column], row[column]))
    )
    .map(([group]) => group)
}

function summary(
  row: object | undefined,
  groups: string[] = []
): EidosSystemMergeSummary {
  return row
    ? { state: "present", ...(groups.length ? { changedGroups: groups } : {}) }
    : { state: "absent" }
}

function conflict(
  code: EidosSystemMergeConflictCode,
  objectKind: EidosSystemMergeObjectKind,
  objectId: string,
  group: string,
  message: string,
  base: object | undefined,
  ours: object | undefined,
  theirs: object | undefined,
  groups: Record<string, readonly string[]>,
  resolutionScope: EidosSystemMergeDomainConflict["resolutionScope"]
): EidosSystemMergeDomainConflict {
  return {
    code,
    objectKind,
    objectId,
    group,
    message,
    base: summary(base),
    ours: summary(
      ours,
      changedGroups(
        base as Record<string, unknown> | undefined,
        ours as Record<string, unknown> | undefined,
        groups
      )
    ),
    theirs: summary(
      theirs,
      changedGroups(
        base as Record<string, unknown> | undefined,
        theirs as Record<string, unknown> | undefined,
        groups
      )
    ),
    resolutionScope,
  }
}

function resolveLwwGroup<T>(options: {
  base: T
  ours: T
  theirs: T
  objectKind: EidosSystemMergeObjectKind
  objectId: string
  group: string
  oursRank: RankedSide
  theirsRank: RankedSide
  automaticResolutions: EidosSystemMergeAutomaticResolution[]
}): T {
  const {
    base,
    ours,
    theirs,
    objectKind,
    objectId,
    group,
    oursRank,
    theirsRank,
    automaticResolutions,
  } = options
  if (equal(ours, theirs)) return ours
  if (equal(ours, base)) return theirs
  if (equal(theirs, base)) return ours
  const selectedSide = rankWinner(oursRank, theirsRank)
  automaticResolutions.push({
    objectKind,
    objectId,
    group,
    reason: "last-write-wins",
    selectedSide,
  })
  return selectedSide === "ours" ? ours : theirs
}

function immutableMeta(meta: MetaRow): unknown[] {
  return [
    meta.singleton,
    meta.format_major,
    meta.format_minor,
    meta.file_id,
    meta.created_at,
  ]
}

function sameSystemSnapshot(
  left: SystemSnapshot,
  right: SystemSnapshot
): boolean {
  return (
    equal(left.meta, right.meta) &&
    equal([...left.tables], [...right.tables]) &&
    equal([...left.fields], [...right.fields]) &&
    equal([...left.relations], [...right.relations]) &&
    equal([...left.formulas], [...right.formulas]) &&
    equal([...left.lookups], [...right.lookups]) &&
    equal([...left.views], [...right.views]) &&
    equal([...left.features], [...right.features])
  )
}

function structuralTable(row: TableRow): unknown[] {
  return [row.id, row.name, row.physical_name, row.created_at]
}

function structuralField(row: FieldRow): unknown[] {
  return [
    row.id,
    row.table_id,
    row.name,
    row.physical_name,
    row.type,
    row.system_role,
    row.nullable,
    row.created_at,
  ]
}

const TABLE_GROUPS = {
  physicalIdentity: ["name", "physical_name"],
  recordLabel: ["label_field_id"],
  order: ["position"],
  settings: ["settings_json"],
} as const

const FIELD_GROUPS = {
  nameMapping: ["name", "physical_name"],
  shape: ["type", "system_role", "nullable"],
  definition: ["settings_json"],
  order: ["position"],
} as const

const VIEW_GROUPS = {
  identityOwner: ["table_id", "created_at"],
  name: ["name"],
  query: ["query_json"],
  presentation: ["type", "layout_json"],
  order: ["position"],
} as const

const FEATURE_GROUPS = {
  declaration: ["version", "required", "config_json"],
} as const

function mergeExistingTables(
  base: SystemSnapshot,
  ours: SystemSnapshot,
  theirs: SystemSnapshot,
  plan: MergePlan,
  oursKey: string,
  theirsKey: string,
  operationInstant: string
): void {
  for (const id of ids(base.tables, ours.tables, theirs.tables)) {
    const baseRow = base.tables.get(id)
    const oursRow = ours.tables.get(id)
    const theirsRow = theirs.tables.get(id)
    if (!baseRow || !oursRow || !theirsRow) {
      const code =
        baseRow && (!oursRow || !theirsRow)
          ? "delete-update"
          : "unsupported-schema-change"
      plan.conflicts.push(
        conflict(
          code,
          "table",
          id,
          "physical-identity",
          code === "delete-update"
            ? "Table deletion cannot be combined without proving its schema and dependency effects."
            : "Table creation requires physical schema reconstruction and is not automatic in this implementation.",
          baseRow,
          oursRow,
          theirsRow,
          TABLE_GROUPS,
          "schema"
        )
      )
      continue
    }
    if (
      !equal(structuralTable(baseRow), structuralTable(oursRow)) ||
      !equal(structuralTable(baseRow), structuralTable(theirsRow))
    ) {
      const bothRenamed =
        !equal(baseRow.name, oursRow.name) &&
        !equal(baseRow.name, theirsRow.name) &&
        !equal(oursRow.name, theirsRow.name)
      plan.conflicts.push(
        conflict(
          bothRenamed ? "table-rename-conflict" : "unsupported-schema-change",
          "table",
          id,
          "physical-identity",
          bothRenamed
            ? "The same Table received incompatible concurrent physical names."
            : "A Table physical identity change requires schema reconstruction before it can be merged.",
          baseRow,
          oursRow,
          theirsRow,
          TABLE_GROUPS,
          "schema"
        )
      )
      continue
    }
    const oursRank = {
      side: "ours" as const,
      clock: oursRow.updated_at,
      key: oursKey,
    }
    const theirsRank = {
      side: "theirs" as const,
      clock: theirsRow.updated_at,
      key: theirsKey,
    }
    const merged: TableRow = {
      ...baseRow,
      label_field_id: resolveLwwGroup({
        base: baseRow.label_field_id,
        ours: oursRow.label_field_id,
        theirs: theirsRow.label_field_id,
        objectKind: "table",
        objectId: id,
        group: "record-label",
        oursRank,
        theirsRank,
        automaticResolutions: plan.automaticResolutions,
      }),
      position: resolveLwwGroup({
        base: baseRow.position,
        ours: oursRow.position,
        theirs: theirsRow.position,
        objectKind: "table",
        objectId: id,
        group: "order",
        oursRank,
        theirsRank,
        automaticResolutions: plan.automaticResolutions,
      }),
      settings_json: resolveLwwGroup({
        base: baseRow.settings_json,
        ours: oursRow.settings_json,
        theirs: theirsRow.settings_json,
        objectKind: "table",
        objectId: id,
        group: "settings",
        oursRank,
        theirsRank,
        automaticResolutions: plan.automaticResolutions,
      }),
    }
    if (
      merged.label_field_id !== baseRow.label_field_id ||
      merged.position !== baseRow.position ||
      merged.settings_json !== baseRow.settings_json
    ) {
      merged.updated_at = operationInstant
    } else {
      merged.updated_at = baseRow.updated_at
    }
    plan.tables.set(id, merged)
  }
}

function fieldSubtype(snapshot: SystemSnapshot, id: string): unknown {
  return (
    snapshot.relations.get(id) ??
    snapshot.formulas.get(id) ??
    snapshot.lookups.get(id) ??
    null
  )
}

function setFieldSubtype(plan: MergePlan, id: string, row: unknown): void {
  plan.relations.delete(id)
  plan.formulas.delete(id)
  plan.lookups.delete(id)
  if (!row) return
  if ("direction" in (row as object)) plan.relations.set(id, row as RelationRow)
  else if ("source_text" in (row as object))
    plan.formulas.set(id, row as FormulaRow)
  else plan.lookups.set(id, row as LookupRow)
}

function mergeExistingFields(
  base: SystemSnapshot,
  ours: SystemSnapshot,
  theirs: SystemSnapshot,
  plan: MergePlan,
  oursKey: string,
  theirsKey: string,
  operationInstant: string
): void {
  for (const id of ids(base.fields, ours.fields, theirs.fields)) {
    const baseRow = base.fields.get(id)
    const oursRow = ours.fields.get(id)
    const theirsRow = theirs.fields.get(id)
    if (!baseRow || !oursRow || !theirsRow) {
      const code =
        baseRow && (!oursRow || !theirsRow)
          ? "delete-update"
          : "unsupported-schema-change"
      plan.conflicts.push(
        conflict(
          code,
          "field",
          id,
          "shape",
          code === "delete-update"
            ? "Field deletion cannot be combined without proving row, View, and dependency effects."
            : "Field creation requires physical schema reconstruction and is not automatic in this implementation.",
          baseRow,
          oursRow,
          theirsRow,
          FIELD_GROUPS,
          "schema"
        )
      )
      continue
    }
    if (
      !equal(structuralField(baseRow), structuralField(oursRow)) ||
      !equal(structuralField(baseRow), structuralField(theirsRow))
    ) {
      const oursRenamed = !equal(
        [baseRow.name, baseRow.physical_name],
        [oursRow.name, oursRow.physical_name]
      )
      const theirsRenamed = !equal(
        [baseRow.name, baseRow.physical_name],
        [theirsRow.name, theirsRow.physical_name]
      )
      const concurrentRename =
        oursRenamed &&
        theirsRenamed &&
        !equal(
          [oursRow.name, oursRow.physical_name],
          [theirsRow.name, theirsRow.physical_name]
        )
      const shapeChanged =
        !equal(
          [baseRow.type, baseRow.system_role, baseRow.nullable],
          [oursRow.type, oursRow.system_role, oursRow.nullable]
        ) ||
        !equal(
          [baseRow.type, baseRow.system_role, baseRow.nullable],
          [theirsRow.type, theirsRow.system_role, theirsRow.nullable]
        )
      const code = concurrentRename
        ? "field-rename-conflict"
        : shapeChanged
          ? "field-conversion-conflict"
          : "unsupported-schema-change"
      plan.conflicts.push(
        conflict(
          code,
          "field",
          id,
          shapeChanged ? "shape" : "name-mapping",
          code === "field-rename-conflict"
            ? "The same Field received incompatible concurrent names."
            : code === "field-conversion-conflict"
              ? "The Field shape changed without a proven lossless conversion projection."
              : "A Field mapping change requires schema reconstruction before it can be merged.",
          baseRow,
          oursRow,
          theirsRow,
          FIELD_GROUPS,
          "schema"
        )
      )
      continue
    }
    const oursRank = {
      side: "ours" as const,
      clock: oursRow.updated_at,
      key: oursKey,
    }
    const theirsRank = {
      side: "theirs" as const,
      clock: theirsRow.updated_at,
      key: theirsKey,
    }
    const baseSubtype = fieldSubtype(base, id)
    const oursSubtype = fieldSubtype(ours, id)
    const theirsSubtype = fieldSubtype(theirs, id)
    const concurrentSelectSettings =
      ["select", "multi-select"].includes(baseRow.type) &&
      !equal(oursRow.settings_json, baseRow.settings_json) &&
      !equal(theirsRow.settings_json, baseRow.settings_json) &&
      !equal(oursRow.settings_json, theirsRow.settings_json)
    if (concurrentSelectSettings) {
      plan.conflicts.push(
        conflict(
          "option-catalog-conflict",
          "field",
          id,
          "definition",
          "Concurrent option catalog changes cannot be combined without proving value and View rewrites.",
          baseRow,
          oursRow,
          theirsRow,
          FIELD_GROUPS,
          "group"
        )
      )
      continue
    }
    const mergedDefinition = resolveLwwGroup({
      base: [baseRow.settings_json, baseSubtype] as const,
      ours: [oursRow.settings_json, oursSubtype] as const,
      theirs: [theirsRow.settings_json, theirsSubtype] as const,
      objectKind: "field",
      objectId: id,
      group: "definition",
      oursRank,
      theirsRank,
      automaticResolutions: plan.automaticResolutions,
    })
    const [mergedSettings, mergedSubtype] = mergedDefinition
    const merged: FieldRow = {
      ...baseRow,
      position: resolveLwwGroup({
        base: baseRow.position,
        ours: oursRow.position,
        theirs: theirsRow.position,
        objectKind: "field",
        objectId: id,
        group: "order",
        oursRank,
        theirsRank,
        automaticResolutions: plan.automaticResolutions,
      }),
      settings_json: mergedSettings,
    }
    const substantive =
      merged.position !== baseRow.position ||
      merged.settings_json !== baseRow.settings_json ||
      !equal(mergedSubtype, baseSubtype)
    merged.updated_at = substantive ? operationInstant : baseRow.updated_at
    plan.fields.set(id, merged)
    setFieldSubtype(plan, id, mergedSubtype)
  }
}

function mergeViews(
  base: SystemSnapshot,
  ours: SystemSnapshot,
  theirs: SystemSnapshot,
  plan: MergePlan,
  oursKey: string,
  theirsKey: string,
  operationInstant: string
): void {
  for (const id of ids(base.views, ours.views, theirs.views)) {
    const baseRow = base.views.get(id)
    const oursRow = ours.views.get(id)
    const theirsRow = theirs.views.get(id)
    if (!baseRow) {
      if (!oursRow && theirsRow) {
        plan.views.set(id, { ...theirsRow, updated_at: operationInstant })
      } else if (oursRow && !theirsRow) {
        plan.views.set(id, { ...oursRow, updated_at: operationInstant })
      } else if (oursRow && theirsRow) {
        if (
          equal(
            { ...oursRow, updated_at: "" },
            { ...theirsRow, updated_at: "" }
          )
        ) {
          plan.views.set(id, { ...oursRow, updated_at: operationInstant })
        } else {
          plan.conflicts.push(
            conflict(
              "identity-collision",
              "view",
              id,
              "identity",
              "The same View ID was independently created with unequal definitions.",
              undefined,
              oursRow,
              theirsRow,
              VIEW_GROUPS,
              "object"
            )
          )
        }
      }
      continue
    }
    if (!oursRow && !theirsRow) {
      plan.views.delete(id)
      continue
    }
    if (!oursRow || !theirsRow) {
      const survivor = oursRow ?? theirsRow
      if (
        survivor &&
        equal({ ...survivor, updated_at: "" }, { ...baseRow, updated_at: "" })
      ) {
        plan.views.delete(id)
      } else {
        plan.conflicts.push(
          conflict(
            "delete-update",
            "view",
            id,
            "object",
            "One side deleted a View that the other side changed.",
            baseRow,
            oursRow,
            theirsRow,
            VIEW_GROUPS,
            "object"
          )
        )
      }
      continue
    }
    if (
      oursRow.table_id !== baseRow.table_id ||
      theirsRow.table_id !== baseRow.table_id ||
      oursRow.created_at !== baseRow.created_at ||
      theirsRow.created_at !== baseRow.created_at
    ) {
      plan.conflicts.push(
        conflict(
          "identity-collision",
          "view",
          id,
          "identity-owner",
          "A View owner or creation identity changed.",
          baseRow,
          oursRow,
          theirsRow,
          VIEW_GROUPS,
          "object"
        )
      )
      continue
    }
    const oursRank = {
      side: "ours" as const,
      clock: oursRow.updated_at,
      key: oursKey,
    }
    const theirsRank = {
      side: "theirs" as const,
      clock: theirsRow.updated_at,
      key: theirsKey,
    }
    const merged: ViewRow = {
      ...baseRow,
      name: resolveLwwGroup({
        base: baseRow.name,
        ours: oursRow.name,
        theirs: theirsRow.name,
        objectKind: "view",
        objectId: id,
        group: "name",
        oursRank,
        theirsRank,
        automaticResolutions: plan.automaticResolutions,
      }),
      query_json: resolveLwwGroup({
        base: baseRow.query_json,
        ours: oursRow.query_json,
        theirs: theirsRow.query_json,
        objectKind: "view",
        objectId: id,
        group: "query",
        oursRank,
        theirsRank,
        automaticResolutions: plan.automaticResolutions,
      }),
      type: baseRow.type,
      layout_json: "",
      position: resolveLwwGroup({
        base: baseRow.position,
        ours: oursRow.position,
        theirs: theirsRow.position,
        objectKind: "view",
        objectId: id,
        group: "order",
        oursRank,
        theirsRank,
        automaticResolutions: plan.automaticResolutions,
      }),
    }
    const presentation = resolveLwwGroup({
      base: [baseRow.type, baseRow.layout_json],
      ours: [oursRow.type, oursRow.layout_json],
      theirs: [theirsRow.type, theirsRow.layout_json],
      objectKind: "view",
      objectId: id,
      group: "presentation",
      oursRank,
      theirsRank,
      automaticResolutions: plan.automaticResolutions,
    })
    merged.type = presentation[0]
    merged.layout_json = presentation[1]
    const substantive = !equal(
      [
        merged.name,
        merged.query_json,
        merged.type,
        merged.layout_json,
        merged.position,
      ],
      [
        baseRow.name,
        baseRow.query_json,
        baseRow.type,
        baseRow.layout_json,
        baseRow.position,
      ]
    )
    merged.updated_at = substantive ? operationInstant : baseRow.updated_at
    plan.views.set(id, merged)
  }
}

function mergeFeatures(
  base: SystemSnapshot,
  ours: SystemSnapshot,
  theirs: SystemSnapshot,
  plan: MergePlan
): void {
  for (const name of ids(base.features, ours.features, theirs.features)) {
    const baseRow = base.features.get(name)
    const oursRow = ours.features.get(name)
    const theirsRow = theirs.features.get(name)
    if (!baseRow) {
      if (oursRow && theirsRow && !equal(oursRow, theirsRow)) {
        plan.conflicts.push(
          conflict(
            "feature-conflict",
            "feature",
            name,
            "declaration",
            "The same Feature was independently declared with unequal capabilities.",
            undefined,
            oursRow,
            theirsRow,
            FEATURE_GROUPS,
            "object"
          )
        )
      } else if (oursRow || theirsRow) {
        plan.features.set(name, (oursRow ?? theirsRow)!)
      }
      continue
    }
    if (!oursRow && !theirsRow) {
      plan.features.delete(name)
    } else if (!oursRow || !theirsRow) {
      const survivor = oursRow ?? theirsRow
      if (survivor && equal(survivor, baseRow)) plan.features.delete(name)
      else {
        plan.conflicts.push(
          conflict(
            "delete-update",
            "feature",
            name,
            "declaration",
            "One side removed a Feature that the other side changed.",
            baseRow,
            oursRow,
            theirsRow,
            FEATURE_GROUPS,
            "object"
          )
        )
      }
    } else if (equal(oursRow, theirsRow)) {
      plan.features.set(name, oursRow)
    } else if (equal(oursRow, baseRow)) {
      plan.features.set(name, theirsRow)
    } else if (equal(theirsRow, baseRow)) {
      plan.features.set(name, oursRow)
    } else {
      plan.conflicts.push(
        conflict(
          "feature-conflict",
          "feature",
          name,
          "declaration",
          "Concurrent unequal Feature declarations have no canonical last-write clock.",
          baseRow,
          oursRow,
          theirsRow,
          FEATURE_GROUPS,
          "group"
        )
      )
    }
  }
}

function viewNameConflicts(plan: MergePlan): void {
  const names = new Map<string, string>()
  for (const view of plan.views.values()) {
    const scope = `${view.table_id}\u001f${view.name.toLocaleLowerCase("en-US")}`
    const previous = names.get(scope)
    if (previous && previous !== view.id) {
      plan.conflicts.push({
        code: "name-collision",
        objectKind: "view",
        objectId: view.id,
        group: "name",
        message:
          "Two Views in the same Table have the same case-insensitive final name.",
        base: { state: "absent" },
        ours: { state: "present", changedGroups: ["name"] },
        theirs: { state: "present", changedGroups: ["name"] },
        resolutionScope: "group",
      })
    } else {
      names.set(scope, view.id)
    }
  }
}

function buildPlan(
  base: SystemSnapshot,
  ours: SystemSnapshot,
  theirs: SystemSnapshot,
  oursKey: string,
  theirsKey: string,
  operationInstant: string
): MergePlan | "revision-exhausted" {
  const automaticResolutions: EidosSystemMergeAutomaticResolution[] = []
  const conflicts: EidosSystemMergeDomainConflict[] = []
  const oursRank = {
    side: "ours" as const,
    clock: ours.meta.updated_at,
    key: oursKey,
  }
  const theirsRank = {
    side: "theirs" as const,
    clock: theirs.meta.updated_at,
    key: theirsKey,
  }
  const revision = [
    base.meta.revision,
    ours.meta.revision,
    theirs.meta.revision,
  ]
    .map(BigInt)
    .reduce((maximum, value) => (value > maximum ? value : maximum))
  if (revision >= MAX_INT64) return "revision-exhausted"
  const meta: MetaRow = {
    ...base.meta,
    title: resolveLwwGroup({
      base: base.meta.title,
      ours: ours.meta.title,
      theirs: theirs.meta.title,
      objectKind: "file",
      objectId: base.meta.file_id,
      group: "title",
      oursRank,
      theirsRank,
      automaticResolutions,
    }),
    default_table_id: resolveLwwGroup({
      base: base.meta.default_table_id,
      ours: ours.meta.default_table_id,
      theirs: theirs.meta.default_table_id,
      objectKind: "file",
      objectId: base.meta.file_id,
      group: "default-table",
      oursRank,
      theirsRank,
      automaticResolutions,
    }),
    revision: revision + 1n,
    updated_at: operationInstant,
  }
  automaticResolutions.push({
    objectKind: "file",
    objectId: base.meta.file_id,
    group: "revision-and-timestamp",
    reason: "merge-finalization",
  })
  const plan: MergePlan = {
    meta,
    tables: new Map(base.tables),
    fields: new Map(base.fields),
    relations: new Map(base.relations),
    formulas: new Map(base.formulas),
    lookups: new Map(base.lookups),
    views: new Map(base.views),
    features: new Map(base.features),
    automaticResolutions,
    conflicts,
  }
  mergeExistingTables(
    base,
    ours,
    theirs,
    plan,
    oursKey,
    theirsKey,
    operationInstant
  )
  mergeExistingFields(
    base,
    ours,
    theirs,
    plan,
    oursKey,
    theirsKey,
    operationInstant
  )
  mergeViews(base, ours, theirs, plan, oursKey, theirsKey, operationInstant)
  mergeFeatures(base, ours, theirs, plan)
  viewNameConflicts(plan)
  if (
    plan.meta.default_table_id !== null &&
    !plan.tables.has(plan.meta.default_table_id)
  ) {
    plan.conflicts.push({
      code: "dependency-conflict",
      objectKind: "file",
      objectId: plan.meta.file_id,
      group: "default-table",
      message: "The merged default Table reference does not exist.",
      base: summary(base.tables.get(plan.meta.default_table_id)),
      ours: summary(ours.tables.get(plan.meta.default_table_id)),
      theirs: summary(theirs.tables.get(plan.meta.default_table_id)),
      resolutionScope: "dependency",
    })
  }
  return plan
}

function replaceRows<T extends object>(
  connection: EidosFileConnection,
  table: string,
  keyColumn: string,
  columns: readonly string[],
  rows: Map<string, T>
): void {
  const existing = connection.query<Record<string, EidosFileSqlPrimitive>>(
    `SELECT ${keyColumn} FROM ${table}`
  )
  for (const row of existing) {
    const key = String(row[keyColumn])
    if (!rows.has(key))
      connection.run(`DELETE FROM ${table} WHERE ${keyColumn}=?`, [key])
  }
  const placeholders = columns.map(() => "?").join(",")
  const updates = columns
    .filter((column) => column !== keyColumn)
    .map((column) => `${column}=excluded.${column}`)
    .join(",")
  const sql = `INSERT INTO ${table}(${columns.join(",")}) VALUES(${placeholders})
    ON CONFLICT(${keyColumn}) DO UPDATE SET ${updates}`
  for (const row of rows.values()) {
    connection.run(
      sql,
      columns.map(
        (column) => (row as Record<string, EidosFileSqlPrimitive>)[column]!
      )
    )
  }
}

class CandidateValidationFailure extends Error {
  constructor(readonly validation: EidosFileValidationResult) {
    super("Merged Eidos system metadata candidate failed validation")
  }
}

function applyPlan(
  connection: EidosFileConnection,
  plan: MergePlan
): EidosFileValidationResult {
  return connection.transaction(() => {
    connection.exec("PRAGMA defer_foreign_keys = ON;")
    replaceRows(
      connection,
      "eidos__tables",
      "id",
      [
        "id",
        "name",
        "physical_name",
        "label_field_id",
        "position",
        "settings_json",
        "created_at",
        "updated_at",
      ],
      plan.tables
    )
    replaceRows(
      connection,
      "eidos__fields",
      "id",
      [
        "id",
        "table_id",
        "name",
        "physical_name",
        "type",
        "system_role",
        "nullable",
        "position",
        "settings_json",
        "created_at",
        "updated_at",
      ],
      plan.fields
    )
    replaceRows(
      connection,
      "eidos__relation_fields",
      "field_id",
      [
        "field_id",
        "direction",
        "target_table_id",
        "cardinality",
        "inverse_of_field_id",
        "on_delete",
      ],
      plan.relations
    )
    replaceRows(
      connection,
      "eidos__formula_fields",
      "field_id",
      ["field_id", "source_text", "result_type"],
      plan.formulas
    )
    replaceRows(
      connection,
      "eidos__lookup_fields",
      "field_id",
      [
        "field_id",
        "relation_field_id",
        "target_field_id",
        "aggregate",
        "distinct_values",
      ],
      plan.lookups
    )
    replaceRows(
      connection,
      "eidos__views",
      "id",
      [
        "id",
        "table_id",
        "name",
        "type",
        "query_json",
        "layout_json",
        "position",
        "created_at",
        "updated_at",
      ],
      plan.views
    )
    replaceRows(
      connection,
      "eidos__features",
      "name",
      ["name", "version", "required", "config_json"],
      plan.features
    )
    connection.run(
      `UPDATE eidos__meta SET title=?,default_table_id=?,revision=?,updated_at=? WHERE singleton=1`,
      [
        plan.meta.title,
        plan.meta.default_table_id,
        plan.meta.revision,
        plan.meta.updated_at,
      ]
    )
    const validation = validateEidosFile(connection, { level: "full" })
    if (!validation.valid) throw new CandidateValidationFailure(validation)
    return validation
  })
}

function validationIssues(
  input: EidosSystemMergeInputIssue["input"],
  validation: EidosFileValidationResult
): EidosSystemMergeInputIssue[] {
  return validation.errors.map((issue) => ({
    input,
    code: issue.code,
    message: issue.message,
  }))
}

/**
 * Deterministically merges the canonical Eidos system metadata tables into a private candidate.
 * The result connection must be an Ours-derived seed whose system rows are still byte-logically
 * equal to Ours; a host may pre-merge only non-provider tables before this call.
 */
export function mergeEidosSystemMetadata(
  input: EidosSystemMergeInput
): EidosSystemMergeResult {
  const requestIssues: EidosSystemMergeInputIssue[] = []
  if (!SIDE_KEY.test(input.oursKey)) {
    requestIssues.push({
      input: "request",
      code: "invalid-side-key",
      message: "oursKey is not a stable lowercase ASCII side key",
    })
  }
  if (!SIDE_KEY.test(input.theirsKey)) {
    requestIssues.push({
      input: "request",
      code: "invalid-side-key",
      message: "theirsKey is not a stable lowercase ASCII side key",
    })
  }
  if (input.oursKey === input.theirsKey) {
    requestIssues.push({
      input: "request",
      code: "duplicate-side-key",
      message: "oursKey and theirsKey must be distinct",
    })
  }
  if (!isCanonicalEidosFileInstant(input.operationInstant)) {
    requestIssues.push({
      input: "request",
      code: "invalid-operation-instant",
      message: "operationInstant is not a canonical Eidos File instant",
    })
  }
  if (requestIssues.length)
    return { outcome: "invalid-input", issues: requestIssues }

  const connections = [
    ["base", input.base],
    ["ours", input.ours],
    ["theirs", input.theirs],
    ["result", input.result],
  ] as const
  const validationIssuesFound: EidosSystemMergeInputIssue[] = []
  for (const [name, connection] of connections) {
    try {
      const validation = validateEidosFile(connection, { level: "structural" })
      if (!validation.valid)
        validationIssuesFound.push(...validationIssues(name, validation))
    } catch (error) {
      validationIssuesFound.push({
        input: name,
        code: "invalid-merge-input",
        message:
          error instanceof Error ? error.message : "Snapshot validation failed",
      })
    }
  }
  if (validationIssuesFound.length)
    return { outcome: "invalid-input", issues: validationIssuesFound }

  let base: SystemSnapshot
  let ours: SystemSnapshot
  let theirs: SystemSnapshot
  let result: SystemSnapshot
  try {
    base = readSnapshot(input.base)
    ours = readSnapshot(input.ours)
    theirs = readSnapshot(input.theirs)
    result = readSnapshot(input.result)
  } catch (error) {
    return {
      outcome: "invalid-input",
      issues: [
        {
          input: "request",
          code: "invalid-merge-input",
          message:
            error instanceof Error
              ? error.message
              : "Could not read system metadata",
        },
      ],
    }
  }
  if (
    !equal(immutableMeta(base.meta), immutableMeta(ours.meta)) ||
    !equal(immutableMeta(base.meta), immutableMeta(theirs.meta))
  ) {
    return {
      outcome: "invalid-input",
      issues: [
        {
          input: "request",
          code: "identity-mismatch",
          message:
            "Base, Ours, and Theirs do not describe the same immutable Eidos File identity",
        },
      ],
    }
  }
  if (!sameSystemSnapshot(ours, result)) {
    return {
      outcome: "invalid-input",
      issues: [
        {
          input: "result",
          code: "invalid-result-seed",
          message:
            "The private result seed must preserve every Eidos system metadata row from Ours before Runtime merge",
        },
      ],
    }
  }
  const latestInputClock = [
    base.meta.updated_at,
    ours.meta.updated_at,
    theirs.meta.updated_at,
    ...[base, ours, theirs].flatMap((snapshot) => [
      ...[...snapshot.tables.values()].map((row) => row.updated_at),
      ...[...snapshot.fields.values()].map((row) => row.updated_at),
      ...[...snapshot.views.values()].map((row) => row.updated_at),
    ]),
  ]
    .sort()
    .at(-1)!
  if (input.operationInstant <= latestInputClock) {
    return { outcome: "failed", code: "clock-not-after-input" }
  }
  const plan = buildPlan(
    base,
    ours,
    theirs,
    input.oursKey,
    input.theirsKey,
    input.operationInstant
  )
  if (plan === "revision-exhausted") return { outcome: "failed", code: plan }
  if (plan.conflicts.length) {
    return {
      outcome: "conflict",
      conflicts: plan.conflicts,
      automaticResolutions: plan.automaticResolutions,
    }
  }
  let validation: EidosFileValidationResult
  try {
    validation = applyPlan(input.result, plan)
  } catch (error) {
    if (error instanceof CandidateValidationFailure) {
      return {
        outcome: "conflict",
        conflicts: [
          {
            code: "validation-failed",
            objectKind: "dependency",
            objectId: base.meta.file_id,
            group: "candidate",
            message: error.validation.errors
              .map((issue) => issue.message)
              .join("; "),
            base: { state: "present" },
            ours: { state: "present" },
            theirs: { state: "present" },
            resolutionScope: "dependency",
          },
        ],
        automaticResolutions: plan.automaticResolutions,
      }
    }
    throw error
  }
  return {
    outcome: "merged",
    automaticResolutions: plan.automaticResolutions,
    validation: {
      profile: PROFILE,
      level: "full",
      fileId: plan.meta.file_id,
      revision: BigInt(plan.meta.revision).toString(),
      operationInstant: input.operationInstant,
      errors: validation.errors,
      warnings: validation.warnings,
    },
  }
}
