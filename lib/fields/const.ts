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
  CreatedTime = "created-time",
  CreatedBy = "created-by",
  LastEditedTime = "last-edited-time",
  LastEditedBy = "last-edited-by",
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
