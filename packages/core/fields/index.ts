import { z } from "zod"
import type { IField } from "../types/IField"
import type { BaseField } from "./base"
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

import type { FormulaProperty } from "./formula"
import type { ILinkProperty } from "./link"
import type { ILookupProperty } from "./lookup"
import type { NumberProperty } from "./number"
import type { SelectProperty } from "./select"
import type { TextProperty } from "./text"
import type { FileProperty } from "./file"

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

// ════════════════════════════════════════════════════════════════════════
// Zod schemas for field property validation (used by AI agent tools)
// ════════════════════════════════════════════════════════════════════════

const EmptyPropertySchema = z.object({}).passthrough()

export const FIELD_PROPERTY_SCHEMA_MAP: Record<string, z.ZodType> = {
  [FieldType.Text]: z
    .object({
      model: z.string().nullable().optional(),
      enableEmbedding: z.boolean().nullable().optional(),
      enableColorHint: z.boolean().nullable().optional(),
    })
    .passthrough(),
  [FieldType.Number]: z
    .object({
      format: z.enum(["number", "percent", "currency"]).optional(),
      showAs: z.enum(["number", "bar", "ring"]).optional(),
      color: z.string().optional(),
      divideBy: z.number().optional(),
      showNumber: z.boolean().optional(),
    })
    .passthrough(),
  [FieldType.Checkbox]: EmptyPropertySchema,
  [FieldType.Date]: EmptyPropertySchema,
  [FieldType.DateTime]: EmptyPropertySchema,
  [FieldType.File]: z
    .object({
      proxyUrl: z.string().optional(),
    })
    .passthrough(),
  [FieldType.MultiSelect]: z
    .object({
      options: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            color: z.string(),
          })
        )
        .optional(),
      defaultOption: z.string().optional(),
    })
    .passthrough(),
  [FieldType.Rating]: EmptyPropertySchema,
  [FieldType.Select]: z
    .object({
      options: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            color: z.string(),
          })
        )
        .optional(),
      defaultOption: z.string().optional(),
    })
    .passthrough(),
  [FieldType.URL]: EmptyPropertySchema,
  [FieldType.Formula]: z.object({
    formula: z.string(),
    displayType: z
      .enum([
        "text",
        "number",
        "date",
        "datetime",
        "checkbox",
        "select",
        "multi-select",
        "url",
        "rating",
        "file",
      ])
      .optional(),
    numberConfig: z
      .object({
        showAs: z.enum(["number", "bar", "ring"]).optional(),
        color: z.string().optional(),
        divideBy: z.number().optional(),
        showNumber: z.boolean().optional(),
      })
      .optional(),
    optionConfig: z
      .object({
        colorMap: z.array(
          z.object({
            value: z.string(),
            color: z.string(),
          })
        ),
      })
      .optional(),
  }),
  [FieldType.Link]: z.object({
    linkTableName: z.string(),
    linkColumnName: z.string(),
  }),
  [FieldType.Lookup]: z.object({
    linkFieldId: z.string(),
    lookupTargetFieldId: z.string(),
  }),
  [FieldType.CreatedTime]: EmptyPropertySchema,
  [FieldType.CreatedBy]: EmptyPropertySchema,
  [FieldType.LastEditedTime]: EmptyPropertySchema,
  [FieldType.LastEditedBy]: EmptyPropertySchema,
}

/** Get the human-readable property shape description for a given field type */
export function getPropertyHint(type: string): string {
  const hints: Record<string, string> = {
    [FieldType.Text]: "{} (model?, enableEmbedding?, enableColorHint?)",
    [FieldType.Number]:
      '{ format: "number"|"percent"|"currency", showAs: "number"|"bar"|"ring", color: string, divideBy: number, showNumber: boolean }',
    [FieldType.Checkbox]: "{} (no configurable properties)",
    [FieldType.Date]: "{} (no configurable properties)",
    [FieldType.DateTime]: "{} (no configurable properties)",
    [FieldType.File]: "{ proxyUrl?: string }",
    [FieldType.MultiSelect]:
      "{ options: [{ name: string, color: string }], defaultOption?: string }",
    [FieldType.Rating]: "{} (no configurable properties)",
    [FieldType.Select]:
      "{ options: [{ name: string, color: string }], defaultOption?: string }",
    [FieldType.URL]: "{} (no configurable properties)",
    [FieldType.Formula]:
      '{ formula: string, displayType?: "text"|"number"|..., numberConfig?: {...}, optionConfig?: { colorMap: [{ value, color }] } }',
    [FieldType.Link]: "{ linkTableName: string, linkColumnName: string }",
    [FieldType.Lookup]: "{ linkFieldId: string, lookupTargetFieldId: string }",
    [FieldType.CreatedTime]: "{} (read-only, no configurable properties)",
    [FieldType.CreatedBy]: "{} (read-only, no configurable properties)",
    [FieldType.LastEditedTime]: "{} (read-only, no configurable properties)",
    [FieldType.LastEditedBy]: "{} (read-only, no configurable properties)",
  }
  return hints[type] ?? "{} (unknown type)"
}
