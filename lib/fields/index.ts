import { CheckboxField } from "./checkbox"
import { DateField } from "./date"
import { FileField } from "./file"
import { FormulaField } from "./formula"
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
]

type FieldTypes =
  | typeof CheckboxField
  | typeof DateField
  | typeof FileField
  | typeof MultiSelectField
  | typeof NumberField
  | typeof RatingField
  | typeof SelectField
  | typeof TextField
  | typeof TitleField
  | typeof URLField
  | typeof FormulaField
  | typeof LinkField

export const allFieldTypesMap = allFieldTypes.reduce((acc, fieldType) => {
  acc[fieldType.type] = fieldType
  return acc
}, {} as Record<string, FieldTypes>)
