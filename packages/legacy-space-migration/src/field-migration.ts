import {
  compileEidosFileFormula,
  type EidosFileFieldInfo,
  type EidosFileFieldType,
  type EidosFileFormulaDisplayType,
  type EidosFileStorageCodec,
  type EidosFileValueKind,
} from "@eidos.space/eidos-file"

import type {
  LegacyField,
  LegacySpaceSnapshot,
  LegacyTable,
  PlannedTable,
} from "./types"
import { eidosFileSelectPropertyFromLegacy } from "./value-migration"

const EIDOS_FILE_FIELD_TYPES = new Set<EidosFileFieldType>([
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
const EIDOS_FILE_SYSTEM_COLUMNS = new Set([
  "_id",
  "title",
  "_created_time",
  "_last_edited_time",
  "_created_by",
  "_last_edited_by",
])
const EIDOS_FILE_SYSTEM_FIELD_TYPES = new Map<string, EidosFileFieldType>([
  ["_id", "row-id"],
  ["title", "title"],
  ["_created_time", "created-time"],
  ["_last_edited_time", "last-edited-time"],
  ["_created_by", "created-by"],
  ["_last_edited_by", "last-edited-by"],
])
const FORMULA_DISPLAY_TYPES = new Set<EidosFileFormulaDisplayType>([
  "text",
  "number",
  "checkbox",
  "date",
  "datetime",
  "url",
])

export interface LegacyFieldImportStrategy {
  property: Record<string, unknown> | null
  storageCodec: EidosFileStorageCodec
  valueKind: EidosFileValueKind
  isDerived: boolean
  dependsOn: unknown
  omitSourceValue: boolean
  fallbackReason?: string
}

export function legacyFieldStrategyKey(
  tableId: string,
  sourceColumnName: string
): string {
  return `${tableId}\u0000${sourceColumnName}`
}

export function fieldColumnMap(table: PlannedTable): Map<string, string> {
  return new Map(
    table.fields.map((field) => [
      field.sourceColumnName,
      field.targetColumnName,
    ])
  )
}

export function rewriteExpressionIdentifiers(
  value: string,
  fieldMap: Map<string, string>
): string {
  const remapped = [...fieldMap].filter(([source, target]) => source !== target)
  if (remapped.length === 0) return value
  let result = ""
  for (let index = 0; index < value.length; ) {
    const character = value[index]
    if (character === "'") {
      const start = index
      index += 1
      while (index < value.length) {
        if (value[index] !== "'") {
          index += 1
          continue
        }
        index += 1
        if (value[index] === "'") index += 1
        else break
      }
      result += value.slice(start, index)
      continue
    }
    if (character === '"' || character === "`" || character === "[") {
      const closing = character === "[" ? "]" : character
      const start = index
      index += 1
      let identifier = ""
      while (index < value.length) {
        if (
          closing !== "]" &&
          value[index] === closing &&
          value[index + 1] === closing
        ) {
          identifier += closing
          index += 2
          continue
        }
        if (value[index] === closing) break
        identifier += value[index]
        index += 1
      }
      if (index >= value.length) {
        result += value.slice(start)
        break
      }
      index += 1
      const target = fieldMap.get(identifier)
      if (!target) {
        result += value.slice(start, index)
      } else if (character === "[") {
        result += `[${target}]`
      } else {
        result += `${character}${target.split(closing).join(closing + closing)}${closing}`
      }
      continue
    }
    const match = remapped.find(([source]) => {
      if (!value.startsWith(source, index)) return false
      const previous = index === 0 ? "" : value[index - 1]
      const next = value[index + source.length] ?? ""
      return !/[A-Za-z0-9_]/.test(previous) && !/[A-Za-z0-9_]/.test(next)
    })
    if (match) {
      result += match[1]
      index += match[0].length
      continue
    }
    result += character
    index += 1
  }
  return result
}

export function remapFieldMetadata(
  value: unknown,
  fieldMap: Map<string, string>
): unknown {
  if (typeof value === "string") {
    return rewriteExpressionIdentifiers(fieldMap.get(value) ?? value, fieldMap)
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapFieldMetadata(item, fieldMap))
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        fieldMap.get(key) ?? key,
        remapFieldMetadata(child, fieldMap),
      ])
    )
  }
  return value
}

export function eidosFileFieldTypeForLegacyField(
  field: LegacyField
): EidosFileFieldType {
  return EIDOS_FILE_FIELD_TYPES.has(field.type as EidosFileFieldType)
    ? (field.type as EidosFileFieldType)
    : "text"
}

function defaultStorageCodec(field: LegacyField): EidosFileStorageCodec {
  if (field.type === "multi-select" || field.type === "file") {
    return "json_array"
  }
  if (field.type === "link") return "relation"
  if (field.type === "formula" || field.type === "lookup") {
    return "materialized_text"
  }
  return "scalar"
}

function defaultValueKind(field: LegacyField): EidosFileValueKind {
  if (
    field.type === "row-id" ||
    EIDOS_FILE_SYSTEM_COLUMNS.has(field.columnName)
  ) {
    return "system"
  }
  if (field.type === "link") return "relation"
  if (field.type === "formula" || field.type === "lookup") {
    return "materialized"
  }
  return "source"
}

function normalizedDisplayType(value: unknown): EidosFileFormulaDisplayType {
  return typeof value === "string" &&
    FORMULA_DISPLAY_TYPES.has(value as EidosFileFormulaDisplayType)
    ? (value as EidosFileFormulaDisplayType)
    : "text"
}

function importedProperty(
  field: LegacyField,
  fieldMap: Map<string, string>
): Record<string, unknown> | null {
  if (field.type === "select" || field.type === "multi-select") {
    return eidosFileSelectPropertyFromLegacy(field.property)
  }
  const property = remapFieldMetadata(field.property, fieldMap) as Record<
    string,
    unknown
  > | null
  if (EIDOS_FILE_FIELD_TYPES.has(field.type as EidosFileFieldType))
    return property
  return {
    ...(property ?? {}),
    eidosMigration: { sourceFieldType: field.type },
  }
}

function findFormulaCycleMembers(
  dependencies: Map<string, string[]>,
  liveColumns: Set<string>
): Set<string> {
  const cycleMembers = new Set<string>()
  const state = new Map<string, "visiting" | "visited">()
  const stack: string[] = []
  const visit = (columnName: string) => {
    if (state.get(columnName) === "visited") return
    if (state.get(columnName) === "visiting") {
      const cycleStart = stack.lastIndexOf(columnName)
      for (const member of stack.slice(cycleStart)) cycleMembers.add(member)
      return
    }
    state.set(columnName, "visiting")
    stack.push(columnName)
    for (const dependency of dependencies.get(columnName) ?? []) {
      if (liveColumns.has(dependency)) visit(dependency)
    }
    stack.pop()
    state.set(columnName, "visited")
  }
  for (const columnName of liveColumns) visit(columnName)
  return cycleMembers
}

/**
 * Builds the exact import contract used by both the migration preview and the
 * exporter. Compatible Formula/Lookup fields become query-time Eidos File fields;
 * incompatible definitions retain their legacy materialized values.
 */
export function buildLegacyFieldImportStrategies(
  snapshot: LegacySpaceSnapshot,
  plannedTables: PlannedTable[]
): Map<string, LegacyFieldImportStrategy> {
  const plannedById = new Map(plannedTables.map((table) => [table.id, table]))
  const sourceById = new Map(snapshot.tables.map((table) => [table.id, table]))
  const sourceByRawName = new Map(
    snapshot.tables.map((table) => [table.rawTableName, table])
  )
  const strategies = new Map<string, LegacyFieldImportStrategy>()

  for (const table of snapshot.tables) {
    const planned = plannedById.get(table.id)
    if (!planned) continue
    const columnMap = fieldColumnMap(planned)
    for (const field of table.fields) {
      strategies.set(legacyFieldStrategyKey(table.id, field.columnName), {
        property: importedProperty(field, columnMap),
        storageCodec: defaultStorageCodec(field),
        valueKind: defaultValueKind(field),
        isDerived: field.type === "formula" || field.type === "lookup",
        dependsOn: remapFieldMetadata(field.property?.dependsOn, columnMap),
        omitSourceValue: false,
        ...(field.type === "formula" || field.type === "lookup"
          ? {
              fallbackReason:
                "the legacy definition is not Eidos File-compatible",
            }
          : {}),
      })
    }
  }

  // Normalize legacy links to the Eidos File relation contract. Lookup validation
  // below only promotes fields whose relation can be resolved unambiguously.
  for (const table of snapshot.tables) {
    const planned = plannedById.get(table.id)
    if (!planned) continue
    for (const field of table.fields.filter(
      (candidate) => candidate.type === "link"
    )) {
      const strategy = strategies.get(
        legacyFieldStrategyKey(table.id, field.columnName)
      )!
      const legacyTargetTable =
        typeof field.property?.linkTableName === "string"
          ? sourceByRawName.get(field.property.linkTableName)
          : undefined
      const targetPlan = legacyTargetTable
        ? plannedById.get(legacyTargetTable.id)
        : undefined
      const legacyTargetField = field.property?.linkColumnName
      const targetField =
        targetPlan && typeof legacyTargetField === "string"
          ? (fieldColumnMap(targetPlan).get(legacyTargetField) ??
            (EIDOS_FILE_SYSTEM_COLUMNS.has(legacyTargetField)
              ? legacyTargetField
              : undefined))
          : undefined
      if (legacyTargetTable && targetField) {
        strategy.property = {
          ...(strategy.property ?? {}),
          targetTableId: legacyTargetTable.id,
          targetField,
          multiple: true,
        }
      }
    }
  }

  interface LiveLookupCandidate {
    tableId: string
    columnName: string
    relationColumn: string
    targetColumn: string
    targetDisplayType: EidosFileFormulaDisplayType
    targetLookupKey?: string
  }

  const liveLookupColumnsByTable = new Map<string, Set<string>>()
  const lookupCandidates = new Map<string, LiveLookupCandidate>()
  for (const table of snapshot.tables) {
    const planned = plannedById.get(table.id)
    if (!planned) continue
    const columnMap = fieldColumnMap(planned)
    liveLookupColumnsByTable.set(table.id, new Set<string>())
    for (const field of table.fields.filter(
      (candidate) => candidate.type === "lookup"
    )) {
      const key = legacyFieldStrategyKey(table.id, field.columnName)
      const strategy = strategies.get(key)!
      const reference = table.references.find(
        (candidate) =>
          candidate.selfTableName === table.rawTableName &&
          candidate.selfColumnName === field.columnName
      )
      const legacyRelationColumn =
        typeof field.property?.linkFieldId === "string"
          ? field.property.linkFieldId
          : reference?.linkColumnName
      const relationField = table.fields.find(
        (candidate) => candidate.columnName === legacyRelationColumn
      )
      const relationStrategy = relationField
        ? strategies.get(
            legacyFieldStrategyKey(table.id, relationField.columnName)
          )
        : undefined
      const targetTableId = relationStrategy?.property?.targetTableId
      const targetTable =
        typeof targetTableId === "string"
          ? sourceById.get(targetTableId)
          : reference
            ? sourceByRawName.get(reference.refTableName)
            : undefined
      const targetPlan = targetTable
        ? plannedById.get(targetTable.id)
        : undefined
      const legacyTargetColumn =
        typeof field.property?.lookupTargetFieldId === "string"
          ? field.property.lookupTargetFieldId
          : reference?.refColumnName
      const targetLegacyField = targetTable?.fields.find(
        (candidate) => candidate.columnName === legacyTargetColumn
      )
      const targetFieldType =
        targetLegacyField?.type ??
        (typeof legacyTargetColumn === "string"
          ? EIDOS_FILE_SYSTEM_FIELD_TYPES.get(legacyTargetColumn)
          : undefined)
      const targetColumn =
        targetPlan && typeof legacyTargetColumn === "string"
          ? (fieldColumnMap(targetPlan).get(legacyTargetColumn) ??
            (EIDOS_FILE_SYSTEM_COLUMNS.has(legacyTargetColumn)
              ? legacyTargetColumn
              : undefined))
          : undefined
      if (!relationField || relationField.type !== "link") {
        strategy.fallbackReason = "its relation field is missing"
        continue
      }
      if (!targetTable || !targetFieldType || !targetColumn) {
        strategy.fallbackReason = "its lookup target is missing"
        continue
      }
      if (targetFieldType === "formula") {
        strategy.fallbackReason =
          "Eidos File lookups require a stored target field"
        continue
      }
      const relationColumn = columnMap.get(relationField.columnName)
      if (
        !relationColumn ||
        typeof relationStrategy?.property?.targetTableId !== "string"
      ) {
        strategy.fallbackReason = "its relation target cannot be resolved"
        continue
      }
      lookupCandidates.set(key, {
        tableId: table.id,
        columnName: columnMap.get(field.columnName)!,
        relationColumn,
        targetColumn,
        targetDisplayType:
          targetLegacyField?.type === "lookup"
            ? normalizedDisplayType(targetLegacyField.property?.displayType)
            : normalizedDisplayType(targetFieldType),
        ...(targetLegacyField?.type === "lookup" && targetTable
          ? {
              targetLookupKey: legacyFieldStrategyKey(
                targetTable.id,
                targetLegacyField.columnName
              ),
            }
          : {}),
      })
    }
  }

  const lookupState = new Map<string, "visiting" | "live" | "fallback">()
  const lookupStack: string[] = []
  const lookupFallbacks = new Map<string, string>()
  const resolveLookup = (key: string): boolean => {
    const state = lookupState.get(key)
    if (state === "live") return true
    if (state === "fallback") return false
    if (state === "visiting") {
      const cycleStart = lookupStack.lastIndexOf(key)
      for (const member of lookupStack.slice(cycleStart)) {
        lookupState.set(member, "fallback")
        lookupFallbacks.set(member, "its lookup dependency is circular")
      }
      return false
    }
    const candidate = lookupCandidates.get(key)
    if (!candidate) return false
    lookupState.set(key, "visiting")
    lookupStack.push(key)
    const targetIsLive = candidate.targetLookupKey
      ? resolveLookup(candidate.targetLookupKey)
      : true
    lookupStack.pop()
    if (!targetIsLive) {
      lookupState.set(key, "fallback")
      if (!lookupFallbacks.has(key)) {
        lookupFallbacks.set(
          key,
          "its nested lookup target is not Eidos File-compatible"
        )
      }
      return false
    }
    lookupState.set(key, "live")
    return true
  }

  for (const [key, candidate] of lookupCandidates) {
    const strategy = strategies.get(key)!
    if (!resolveLookup(key)) {
      strategy.fallbackReason = lookupFallbacks.get(key)
      continue
    }
    strategy.property = {
      ...(strategy.property ?? {}),
      relationField: candidate.relationColumn,
      targetField: candidate.targetColumn,
      aggregate: "values",
      displayType: candidate.targetDisplayType,
    }
    strategy.storageCodec = "json_array"
    strategy.valueKind = "derived"
    strategy.isDerived = true
    strategy.dependsOn = [candidate.relationColumn]
    strategy.omitSourceValue = true
    delete strategy.fallbackReason
    liveLookupColumnsByTable.get(candidate.tableId)!.add(candidate.columnName)
  }

  for (const table of snapshot.tables) {
    const planned = plannedById.get(table.id)
    if (!planned) continue
    const columnMap = fieldColumnMap(planned)
    const fieldsByTarget = new Map<string, LegacyField>()
    for (const field of table.fields) {
      const target = columnMap.get(field.columnName)
      if (target) fieldsByTarget.set(target, field)
    }
    const drafts = table.fields.map((field): EidosFileFieldInfo => {
      const strategy = strategies.get(
        legacyFieldStrategyKey(table.id, field.columnName)
      )!
      return {
        name: field.name,
        type: eidosFileFieldTypeForLegacyField(field),
        tableName: table.rawTableName,
        tableColumnName: columnMap.get(field.columnName)!,
        property: strategy.property,
        storageCodec: strategy.storageCodec,
        valueKind: strategy.valueKind,
        isHidden: field.columnName.startsWith("_"),
        isDerived: strategy.isDerived,
        sourceTableColumnName: null,
        dependsOn: strategy.dependsOn,
      }
    })
    for (const [columnName, type] of EIDOS_FILE_SYSTEM_FIELD_TYPES) {
      if (drafts.some((field) => field.tableColumnName === columnName)) continue
      drafts.push({
        name: columnName === "title" ? "Title" : columnName,
        type,
        tableName: table.rawTableName,
        tableColumnName: columnName,
        property: null,
        storageCodec: "scalar",
        valueKind: "system",
        isHidden: columnName !== "title",
        isDerived: false,
        sourceTableColumnName: null,
        dependsOn: null,
      })
    }
    const formulaDrafts = drafts.filter((field) => field.type === "formula")
    const dependencies = new Map<string, string[]>()
    const expressions = new Map<string, string>()
    const liveFormulaColumns = new Set<string>()
    for (const draft of formulaDrafts) {
      const legacyField = fieldsByTarget.get(draft.tableColumnName)!
      const strategy = strategies.get(
        legacyFieldStrategyKey(table.id, legacyField.columnName)
      )!
      const formula = strategy.property?.formula
      if (typeof formula !== "string" || formula.trim().length === 0) {
        strategy.fallbackReason = "its formula expression is missing"
        continue
      }
      draft.property = {
        ...(strategy.property ?? {}),
        formula,
        displayType: normalizedDisplayType(strategy.property?.displayType),
      }
      draft.storageCodec = "scalar"
      draft.valueKind = "derived"
      draft.isDerived = true
      try {
        const compiled = compileEidosFileFormula(draft, drafts)
        dependencies.set(draft.tableColumnName, compiled.dependencies)
        expressions.set(draft.tableColumnName, compiled.expression)
        liveFormulaColumns.add(draft.tableColumnName)
      } catch (error) {
        strategy.fallbackReason =
          error instanceof Error ? error.message : "its formula is invalid"
      }
    }

    const liveLookupColumns =
      liveLookupColumnsByTable.get(table.id) ?? new Set()
    let changed = true
    while (changed) {
      changed = false
      for (const columnName of [...liveFormulaColumns]) {
        const unavailableDependency = (dependencies.get(columnName) ?? []).find(
          (dependency) => {
            const dependencyField = fieldsByTarget.get(dependency)
            if (
              dependencyField?.type !== "formula" &&
              dependencyField?.type !== "lookup"
            ) {
              return false
            }
            return (
              !liveFormulaColumns.has(dependency) &&
              !liveLookupColumns.has(dependency)
            )
          }
        )
        if (!unavailableDependency) continue
        const legacyField = fieldsByTarget.get(columnName)!
        const dependencyField = fieldsByTarget.get(unavailableDependency)
        strategies.get(
          legacyFieldStrategyKey(table.id, legacyField.columnName)
        )!.fallbackReason =
          `it depends on non-live field ${dependencyField?.name ?? unavailableDependency}`
        liveFormulaColumns.delete(columnName)
        changed = true
      }
    }
    for (const columnName of findFormulaCycleMembers(
      dependencies,
      liveFormulaColumns
    )) {
      const legacyField = fieldsByTarget.get(columnName)!
      strategies.get(
        legacyFieldStrategyKey(table.id, legacyField.columnName)
      )!.fallbackReason = "it belongs to a circular formula dependency"
      liveFormulaColumns.delete(columnName)
    }
    // Formulas that depended on a removed cycle member must also fall back.
    changed = true
    while (changed) {
      changed = false
      for (const columnName of [...liveFormulaColumns]) {
        const unavailableDependency = (dependencies.get(columnName) ?? []).find(
          (dependency) => {
            const dependencyField = fieldsByTarget.get(dependency)
            return (
              dependencyField?.type === "formula" &&
              !liveFormulaColumns.has(dependency)
            )
          }
        )
        if (!unavailableDependency) continue
        const legacyField = fieldsByTarget.get(columnName)!
        strategies.get(
          legacyFieldStrategyKey(table.id, legacyField.columnName)
        )!.fallbackReason =
          `it depends on non-live field ${unavailableDependency}`
        liveFormulaColumns.delete(columnName)
        changed = true
      }
    }
    for (const columnName of liveFormulaColumns) {
      const legacyField = fieldsByTarget.get(columnName)!
      const strategy = strategies.get(
        legacyFieldStrategyKey(table.id, legacyField.columnName)
      )!
      strategy.property = {
        ...(strategy.property ?? {}),
        formula: strategy.property!.formula,
        displayType: normalizedDisplayType(strategy.property?.displayType),
        expression: expressions.get(columnName),
      }
      strategy.storageCodec = "scalar"
      strategy.valueKind = "derived"
      strategy.isDerived = true
      strategy.dependsOn = dependencies.get(columnName) ?? []
      strategy.omitSourceValue = true
      delete strategy.fallbackReason
    }
  }

  return strategies
}
