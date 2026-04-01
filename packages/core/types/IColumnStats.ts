/**
 * Column stat types - support various summary stat methods
 */
export enum ColumnStatType {
  // No stats
  None = "none",

  // General count types
  CountAll = "countAll", // Count all (行数)
  CountValues = "countValues", // Count values (非空值)
  CountUnique = "countUnique", // Count unique values (去重)
  CountEmpty = "countEmpty", // Count empty (空值)
  CountNotEmpty = "countNotEmpty", // Count not empty (非空值)

  // Checkbox 专用计数
  Checked = "checked", // Checked count
  Unchecked = "unchecked", // Unchecked count

  // 百分比类
  PercentEmpty = "percentEmpty", // Percent empty
  PercentNotEmpty = "percentNotEmpty", // Percent not empty
  PercentChecked = "percentChecked", // Percent checked (checkbox)
  PercentUnchecked = "percentUnchecked", // Percent unchecked (checkbox)

  // 数值类
  Sum = "sum",
  Avg = "avg",
  Min = "min",
  Max = "max",
  Median = "median",
  StdDev = "stdDev",

  // 日期类
  Range = "range", // Date range
}

/**
 * Single column's stat config
 */
export interface ColumnStatConfig {
  type: ColumnStatType
  /** Custom display format (optional) */
  format?: string
  /** Decimal places (number types) */
  precision?: number
}

/**
 * View-level stat config mapping
 * key: column name (table_column_name)
 * value: stat config
 */
export type ViewColumnStatsConfig = Record<string, ColumnStatConfig>

/**
 * Stat calculation result
 */
export interface ColumnStatResult {
  type: ColumnStatType
  value: number | string | null
  /** Raw value (for sorting, etc.) */
  rawValue?: number | string
  /** Display text */
  displayText?: string
}

/**
 * Stat categories (for menu grouping)
 */
export const STAT_CATEGORIES = {
  count: {
    label: "Count",
    icon: "#",
    types: [
      ColumnStatType.CountAll,
      ColumnStatType.CountValues,
      ColumnStatType.CountUnique,
      ColumnStatType.CountEmpty,
      ColumnStatType.CountNotEmpty,
      ColumnStatType.Checked,
      ColumnStatType.Unchecked,
    ],
  },
  percent: {
    label: "Percent",
    icon: "%",
    types: [
      ColumnStatType.PercentEmpty,
      ColumnStatType.PercentNotEmpty,
      ColumnStatType.PercentChecked,
      ColumnStatType.PercentUnchecked,
    ],
  },
  more: {
    label: "More options",
    icon: "•••",
    types: [
      ColumnStatType.Sum,
      ColumnStatType.Avg,
      ColumnStatType.Min,
      ColumnStatType.Max,
      ColumnStatType.Median,
      ColumnStatType.StdDev,
      ColumnStatType.Range,
    ],
  },
}

/**
 * Field type to supported stat types mapping
 */
export const FIELD_TYPE_SUPPORTED_STATS: Record<string, ColumnStatType[]> = {
  // Number types - support all
  number: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountUnique,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
    ColumnStatType.Sum,
    ColumnStatType.Avg,
    ColumnStatType.Min,
    ColumnStatType.Max,
    ColumnStatType.Median,
    ColumnStatType.StdDev,
  ],
  rating: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
    ColumnStatType.Sum,
    ColumnStatType.Avg,
    ColumnStatType.Min,
    ColumnStatType.Max,
  ],

  // 日期类型
  date: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
    ColumnStatType.Min,
    ColumnStatType.Max,
    ColumnStatType.Range,
  ],
  datetime: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
    ColumnStatType.Min,
    ColumnStatType.Max,
    ColumnStatType.Range,
  ],
  "created-time": [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.Min,
    ColumnStatType.Max,
    ColumnStatType.Range,
  ],
  "last-edited-time": [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.Min,
    ColumnStatType.Max,
    ColumnStatType.Range,
  ],

  // Checkbox - special handling (has Checked/Unchecked/Percent checked/Percent unchecked)
  checkbox: [
    ColumnStatType.Checked,
    ColumnStatType.Unchecked,
    ColumnStatType.PercentChecked,
    ColumnStatType.PercentUnchecked,
  ],

  // Option types
  select: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountUnique,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],
  "multi-select": [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountUnique,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],

  // Relation types
  link: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],
  lookup: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],

  // Text types - basic stats
  text: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountUnique,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],
  title: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
  ],
  url: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],
  email: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],
  phone: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],
  file: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],
  formula: [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],

  // User types
  "created-by": [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountUnique,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],
  "last-edited-by": [
    ColumnStatType.CountAll,
    ColumnStatType.CountValues,
    ColumnStatType.CountUnique,
    ColumnStatType.CountEmpty,
    ColumnStatType.CountNotEmpty,
    ColumnStatType.PercentEmpty,
    ColumnStatType.PercentNotEmpty,
  ],
}

/**
 * Get supported stat types for field
 */
export function getSupportedStats(fieldType: string): ColumnStatType[] {
  return (
    FIELD_TYPE_SUPPORTED_STATS[fieldType] || [
      ColumnStatType.CountAll,
      ColumnStatType.CountValues,
      ColumnStatType.CountEmpty,
      ColumnStatType.CountNotEmpty,
      ColumnStatType.PercentEmpty,
      ColumnStatType.PercentNotEmpty,
    ]
  )
}

/**
 * Check if field supports certain stat type
 */
export function isStatSupported(
  fieldType: string,
  statType: ColumnStatType
): boolean {
  const supported = getSupportedStats(fieldType)
  return supported.includes(statType)
}

/**
 * Get stat type's default display name
 */
export function getStatTypeLabel(type: ColumnStatType): string {
  const labels: Record<ColumnStatType, string> = {
    [ColumnStatType.None]: "None",
    [ColumnStatType.CountAll]: "Count all",
    [ColumnStatType.CountValues]: "Count values",
    [ColumnStatType.CountUnique]: "Count unique values",
    [ColumnStatType.CountEmpty]: "Count empty",
    [ColumnStatType.CountNotEmpty]: "Count not empty",
    [ColumnStatType.Checked]: "Checked",
    [ColumnStatType.Unchecked]: "Unchecked",
    [ColumnStatType.PercentEmpty]: "Percent empty",
    [ColumnStatType.PercentNotEmpty]: "Percent not empty",
    [ColumnStatType.PercentChecked]: "Percent checked",
    [ColumnStatType.PercentUnchecked]: "Percent unchecked",
    [ColumnStatType.Sum]: "Sum",
    [ColumnStatType.Avg]: "Average",
    [ColumnStatType.Min]: "Min",
    [ColumnStatType.Max]: "Max",
    [ColumnStatType.Median]: "Median",
    [ColumnStatType.StdDev]: "Std deviation",
    [ColumnStatType.Range]: "Range",
  }
  return labels[type] || type
}

/**
 * Get stat type's icon/symbol
 */
export function getStatTypeSymbol(type: ColumnStatType): string {
  const symbols: Record<ColumnStatType, string> = {
    [ColumnStatType.None]: "—",
    [ColumnStatType.CountAll]: "#",
    [ColumnStatType.CountValues]: "#",
    [ColumnStatType.CountUnique]: "≠",
    [ColumnStatType.CountEmpty]: "∅",
    [ColumnStatType.CountNotEmpty]: "●",
    [ColumnStatType.Checked]: "☑",
    [ColumnStatType.Unchecked]: "☐",
    [ColumnStatType.PercentEmpty]: "%",
    [ColumnStatType.PercentNotEmpty]: "%",
    [ColumnStatType.PercentChecked]: "%",
    [ColumnStatType.PercentUnchecked]: "%",
    [ColumnStatType.Sum]: "Σ",
    [ColumnStatType.Avg]: "μ",
    [ColumnStatType.Min]: "↓",
    [ColumnStatType.Max]: "↑",
    [ColumnStatType.Median]: "~",
    [ColumnStatType.StdDev]: "σ",
    [ColumnStatType.Range]: "↔",
  }
  return symbols[type] || ""
}

/**
 * Get recommended default stat type by field type
 */
export function getDefaultStatType(fieldType: string): ColumnStatType | null {
  const defaults: Record<string, ColumnStatType> = {
    number: ColumnStatType.Sum,
    rating: ColumnStatType.Avg,
    checkbox: ColumnStatType.Checked, // Checkbox default shows Checked count
    date: ColumnStatType.Range,
  }
  return defaults[fieldType] || ColumnStatType.CountAll
}

/**
 * Get stat type's menu category
 */
export function getStatCategory(
  type: ColumnStatType
): keyof typeof STAT_CATEGORIES | null {
  if (type === ColumnStatType.None) return null

  for (const [category, config] of Object.entries(STAT_CATEGORIES)) {
    if (config.types.includes(type)) {
      return category as keyof typeof STAT_CATEGORIES
    }
  }
  return null
}
