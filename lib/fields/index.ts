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
import { MultiSelectField } from "./multi-select"
import { NumberField } from "./number"
import { RatingField } from "./rating"
import { SelectField } from "./select"
import { TextField } from "./text"
import { TitleField } from "./title"
import { URLField } from "./url"

export const allFieldTypes = [
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
  [key in FieldType]: (typeof allFieldTypes)[number]
}

export const allFieldTypesMap = allFieldTypes.reduce((acc, fieldType) => {
  acc[fieldType.type] = fieldType
  return acc
}, {} as FieldTypeAndClsMap)
