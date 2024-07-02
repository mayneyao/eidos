import { FieldType } from "./const"

const computedFieldTypes = [FieldType.Formula, FieldType.Lookup, FieldType.Link]
export const isComputedField = (columnType: FieldType) => {
  return computedFieldTypes.includes(columnType)
}
