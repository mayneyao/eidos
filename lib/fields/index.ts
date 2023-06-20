import { CheckboxField } from "./checkbox"
import { DateField } from "./date"
import { FileField } from "./file"
import { MultiSelectField } from "./multi-select"
import { NumberField } from "./number"
import { RatingField } from "./rating"
import { SelectField } from "./select"
import { TextField } from "./text"
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
  URLField,
]

export const allFieldTypesMap = allFieldTypes.reduce((acc, fieldType) => {
  acc[fieldType.type] = fieldType
  return acc
}, {} as Record<string, typeof CheckboxField | typeof DateField | typeof FileField | typeof MultiSelectField | typeof NumberField | typeof RatingField | typeof SelectField | typeof TextField | typeof URLField>)
