export enum FieldType {
  Number = "number",
  Text = "text",
  Title = "title",
  Checkbox = "checkbox",
  Date = "date",
  File = "file",
  MultiSelect = "multi-select",
  Rating = "rating",
  Select = "select",
  URL = "url",
  Formula = "formula",
  Link = "link",
  Lookup = "lookup",
  // Rollup = "rollup",
  CreatedTime = "created-time",
  CreatedBy = "created-by",
  LastEditedTime = "last-edited-time",
  LastEditedBy = "last-edited-by",
}

export enum FieldValueType {
  String = "string",
  Number = "number",
  Boolean = "boolean",
}

export const FIELD_VALUE_TYPE_MAP = {
  [FieldType.Title]: {
    valueType: FieldValueType.String,
    example: "Hello World",
  },
  [FieldType.Text]: {
    valueType: FieldValueType.String,
    example: "Some text",
  },
  [FieldType.Number]: {
    valueType: FieldValueType.Number,
    example: 42,
  },
  [FieldType.Checkbox]: {
    valueType: FieldValueType.Boolean,
    example: true,
  },
  [FieldType.Date]: {
    valueType: FieldValueType.String,
    example: "2024-03-20",
  },
  [FieldType.File]: {
    valueType: FieldValueType.String,
    example: "/path/to/file or https://example.com/file",
  },
  [FieldType.MultiSelect]: {
    valueType: FieldValueType.String,
    example: "Option 1, Option 2",
  },
  [FieldType.Rating]: {
    valueType: FieldValueType.Number,
    example: 5,
  },
  [FieldType.Select]: {
    valueType: FieldValueType.String,
    example: "Selected Option",
  },
  [FieldType.URL]: {
    valueType: FieldValueType.String,
    example: "https://example.com",
  },
  [FieldType.Formula]: {
    valueType: FieldValueType.String,
    example: "value based on other fields",
  },
  [FieldType.Link]: {
    valueType: FieldValueType.String,
    example: "Record ID, split by comma if multiple",
  },
  [FieldType.Lookup]: {
    valueType: FieldValueType.String,
    example: "Lookup Value",
  },
  [FieldType.CreatedTime]: {
    valueType: FieldValueType.String,
    example: "2024-03-20 10:30:00",
  },
  [FieldType.CreatedBy]: {
    valueType: FieldValueType.String,
    example: "user id",
  },
  [FieldType.LastEditedTime]: {
    valueType: FieldValueType.String,
    example: "2024-03-20 10:30:00",
  },
  [FieldType.LastEditedBy]: {
    valueType: FieldValueType.String,
    example: "user id",
  },
}


// copy from glide-data-grid
export enum GridCellKind {
  Uri = "uri",
  Text = "text",
  Image = "image",
  RowID = "row-id",
  Number = "number",
  Bubble = "bubble",
  Boolean = "boolean",
  Loading = "loading",
  Markdown = "markdown",
  Drilldown = "drilldown",
  Protected = "protected",
  Custom = "custom",
}

export enum CompareOperator {
  // base
  IsEmpty = "IsEmpty",
  IsNotEmpty = "IsNotEmpty",
  Equal = "=",
  NotEqual = "!=",

  // string
  Contains = "Contains",
  NotContains = "NotContains",
  StartsWith = "StartsWith",
  EndsWith = "EndsWith",

  // number
  GreaterThan = ">",
  GreaterThanOrEqual = ">=",
  LessThan = "<",
  LessThanOrEqual = "<=",
}

export enum BinaryOperator {
  And = "AND",
  Or = "OR",
}

export const NUMBER_BASED_COMPARE_OPERATORS = [
  CompareOperator.Equal,
  CompareOperator.NotEqual,
  CompareOperator.GreaterThan,
  CompareOperator.GreaterThanOrEqual,
  CompareOperator.LessThan,
  CompareOperator.LessThanOrEqual,
  CompareOperator.IsEmpty,
  CompareOperator.IsNotEmpty,
]

export const TEXT_BASED_COMPARE_OPERATORS = [
  CompareOperator.Equal,
  CompareOperator.NotEqual,
  CompareOperator.Contains,
  CompareOperator.NotContains,
  CompareOperator.StartsWith,
  CompareOperator.EndsWith,
  CompareOperator.IsEmpty,
  CompareOperator.IsNotEmpty,
]

export function applyMixins(derivedCtor: any, constructors: any[]) {
  constructors.forEach((baseCtor) => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
      Object.defineProperty(
        derivedCtor.prototype,
        name,
        Object.getOwnPropertyDescriptor(baseCtor.prototype, name) ||
        Object.create(null)
      )
    })
  })
}
