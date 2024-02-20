import { IField } from "../store/interface"
import { BaseField } from "./base"
import { CheckboxField } from "./checkbox"
import { FieldType } from "./const"
import { CreatedByField } from "./created-by"
import { CreatedTimeField } from "./created-time"
import { DateField } from "./date"
import { FileField } from "./file"
import { FormulaField } from "./formula"
import { LastEditedByField } from "./last-edited-by"
import { LastEditedTimeField } from "./last-edited-time"
import { LinkField } from "./link"
import { LookupField } from "./lookup"
import { MultiSelectField } from "./multi-select"
import { NumberField } from "./number"
import { RatingField } from "./rating"
import { SelectField } from "./select"
import { TextField } from "./text"
import { TitleField } from "./title"
import { URLField } from "./url"

const baseFieldTypes = [
  CheckboxField,
  DateField,
  FileField,
  MultiSelectField,
  NumberField,
  RatingField,
  SelectField,
  TextField,
  TitleField,
  URLField,
  FormulaField,
  LinkField,
  CreatedTimeField,
  LastEditedTimeField,
  CreatedByField,
  LastEditedByField,
]

type FieldTypeAndClsMap = {
  [key in FieldType]: (typeof baseFieldTypes)[number]
} & {
  [FieldType.Lookup]: typeof LookupField
}

export const allFieldTypesMap = baseFieldTypes.reduce(
  (acc, fieldType) => {
    acc[fieldType.type] = fieldType as any
    return acc
  },
  {
    [FieldType.Lookup]: LookupField,
  } as FieldTypeAndClsMap
)

export function getFieldInstance<T = BaseField<any, any, any, any, any>>(
  field: IField<any>,
  context?: any
): T {
  const FieldCls = allFieldTypesMap[field.type]
  return new (FieldCls as any)(field, context)
}
