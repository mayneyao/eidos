import type { BaseFieldInfo, BaseViewInfo } from "@eidos.space/base"

import {
  baseSelectOptions,
  type BaseSelectOption,
} from "./base-field-properties"
import { orderedBaseFields } from "./base-view-layout"

export interface BaseRecordCardFieldLayout {
  field: BaseFieldInfo
  optionById?: ReadonlyMap<string, BaseSelectOption>
}

export interface BaseRecordCardLayout {
  fields: BaseRecordCardFieldLayout[]
  coverField: BaseFieldInfo | null
  fieldLimit: number
  fitContent: boolean
  hideEmptyFields: boolean
}

export function isBaseRecordCoverField(field: BaseFieldInfo): boolean {
  return field.type === "file" || field.type === "url"
}

export function createBaseRecordCardLayout(
  fields: BaseFieldInfo[],
  view: BaseViewInfo,
  compact = false
): BaseRecordCardLayout {
  const coverFieldName =
    typeof view.properties?.coverPreview === "string"
      ? view.properties.coverPreview
      : null
  return {
    fields: orderedBaseFields(fields, view)
      .filter(
        (field) =>
          field.tableColumnName !== "title" && field.valueKind !== "system"
      )
      .map((field) => {
        const options =
          field.type === "select" || field.type === "multi-select"
            ? baseSelectOptions(field)
            : []
        return {
          field,
          optionById:
            options.length > 0
              ? new Map(options.map((option) => [option.id, option]))
              : undefined,
        }
      }),
    coverField:
      fields.find(
        (field) =>
          field.tableColumnName === coverFieldName &&
          isBaseRecordCoverField(field)
      ) ?? null,
    fieldLimit: compact ? 4 : 6,
    fitContent: view.properties?.fitContent !== false,
    hideEmptyFields: view.properties?.hideEmptyFields !== false,
  }
}
