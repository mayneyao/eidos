const t = (en, zh) => ({ en, zh })

function localize(value, locale) {
  if (Array.isArray(value)) return value.map((item) => localize(item, locale))
  if (value && typeof value === "object") {
    if (
      Object.keys(value).length === 2 &&
      typeof value.en === "string" &&
      typeof value.zh === "string"
    ) {
      return value[locale]
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, localize(item, locale)])
    )
  }
  return value
}

const layers = {
  fileRuntimeUi: [
    t("File Format", "文件格式"),
    t("Runtime", "运行时"),
    t("UI", "界面"),
  ],
  runtimeUi: [t("Runtime", "运行时"), t("UI", "界面")],
  runtime: [t("Runtime", "运行时")],
  all: [
    t("File Format", "文件格式"),
    t("Runtime", "运行时"),
    t("Adapter", "适配器"),
    t("UI", "界面"),
  ],
}

const capabilityRows = [
  {
    fieldKind: t("Row ID", "行 ID"),
    canonicalValue: t("UUIDv7 TEXT / row-id", "UUIDv7 TEXT / row-id"),
    mutation: t("Read-only", "只读"),
    filter: "eq / in",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t("Explicit UUID search only", "仅显式 UUID 搜索"),
    wholeCellAggregate: "count / distinct-count / min / max",
    semanticSummary: t(
      "Row count and distinct stable IDs",
      "行数与不同稳定 ID 数"
    ),
    formulaOperand: t("As text", "按 text"),
    lookupResult: "row-id atom",
    recordLabel: t("Special", "特殊"),
    csv: t(
      "Export; import only for explicit replay",
      "可导出；仅显式 replay 可导入"
    ),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t(
      "Hidden stable identity; never SQLite rowid",
      "默认隐藏的稳定身份；绝不是 SQLite rowid"
    ),
  },
  {
    fieldKind: t("Created Time", "创建时间"),
    canonicalValue: t(
      "UTC datetime TEXT / datetime",
      "UTC datetime TEXT / datetime"
    ),
    mutation: t("Read-only", "只读"),
    filter: "eq / in / range",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t(
      "Record Label canonical text only",
      "仅作为记录标签时搜索规范文本"
    ),
    wholeCellAggregate: "count / distinct-count / min / max",
    semanticSummary: t(
      "Earliest, latest, distinct and null rows",
      "最早、最晚、不同值与空值行"
    ),
    formulaOperand: t("Yes", "支持"),
    lookupResult: "datetime atom",
    recordLabel: t("Yes", "支持"),
    csv: t("Canonical UTC datetime", "规范 UTC datetime"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t("UI localizes display only", "UI 只本地化展示"),
  },
  {
    fieldKind: t("Updated Time", "更新时间"),
    canonicalValue: t(
      "UTC datetime TEXT / datetime",
      "UTC datetime TEXT / datetime"
    ),
    mutation: t("Read-only", "只读"),
    filter: "eq / in / range",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t(
      "Record Label canonical text only",
      "仅作为记录标签时搜索规范文本"
    ),
    wholeCellAggregate: "count / distinct-count / min / max",
    semanticSummary: t(
      "Earliest, latest, distinct and null rows",
      "最早、最晚、不同值与空值行"
    ),
    formulaOperand: t("Yes", "支持"),
    lookupResult: "datetime atom",
    recordLabel: t("Yes", "支持"),
    csv: t("Canonical UTC datetime", "规范 UTC datetime"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t("UI localizes display only", "UI 只本地化展示"),
  },
  {
    fieldKind: "Text",
    canonicalValue: t("TEXT / text", "TEXT / text"),
    mutation: t("Writable", "可写"),
    filter: "eq / in / contains / prefix / suffix",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t("Raw text", "原始文本"),
    wholeCellAggregate: "count / distinct-count / min / max",
    semanticSummary: t(
      "Null, blank, filled and distinct rows",
      "null、空串、非空与不同值行"
    ),
    formulaOperand: t("Yes", "支持"),
    lookupResult: "text atom",
    recordLabel: t("Yes", "支持"),
    csv: t("Text", "文本"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t("Text editor", "文本编辑器"),
  },
  {
    fieldKind: "Number",
    canonicalValue: t("Finite REAL / number", "finite REAL / number"),
    mutation: t("Writable", "可写"),
    filter: "eq / in / range",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t(
      "Record Label canonical text only",
      "仅作为记录标签时搜索规范文本"
    ),
    wholeCellAggregate: "count / distinct-count / min / max / sum / average",
    semanticSummary: t(
      "Null, distinct, min, max, sum and average",
      "null、不同值、最小、最大、总和与平均"
    ),
    formulaOperand: t("Yes", "支持"),
    lookupResult: "number atom",
    recordLabel: t("Yes", "支持"),
    csv: t("Canonical finite number", "规范 finite number"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t("Number formatting is UI state", "数字格式属于 UI state"),
  },
  {
    fieldKind: "Integer",
    canonicalValue: t(
      "INTEGER / int64 decimal string",
      "INTEGER / int64 十进制字符串"
    ),
    mutation: t("Writable", "可写"),
    filter: "eq / in / range",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t(
      "Record Label canonical text only",
      "仅作为记录标签时搜索规范文本"
    ),
    wholeCellAggregate: "count / distinct-count / min / max / sum / average",
    semanticSummary: t(
      "Null, distinct, min, max, sum and average",
      "null、不同值、最小、最大、总和与平均"
    ),
    formulaOperand: t("Yes", "支持"),
    lookupResult: "integer atom",
    recordLabel: t("Yes", "支持"),
    csv: t("Canonical int64 decimal", "规范 int64 十进制"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t(
      "Rating is an Integer display setting",
      "Rating 是 Integer 的 display setting"
    ),
  },
  {
    fieldKind: "Checkbox",
    canonicalValue: t("INTEGER 0/1 / boolean", "INTEGER 0/1 / boolean"),
    mutation: t("Writable", "可写"),
    filter: "eq / in",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t(
      "Record Label canonical text only",
      "仅作为记录标签时搜索规范文本"
    ),
    wholeCellAggregate: "count / distinct-count / min / max",
    semanticSummary: t(
      "Null, true, false and percentages",
      "null、true、false 与比例"
    ),
    formulaOperand: t("Yes", "支持"),
    lookupResult: "checkbox atom",
    recordLabel: t("Yes", "支持"),
    csv: "true / false",
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: "Checkbox",
  },
  {
    fieldKind: "Date",
    canonicalValue: "YYYY-MM-DD TEXT / date",
    mutation: t("Writable", "可写"),
    filter: "eq / in / range",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t(
      "Record Label canonical text only",
      "仅作为记录标签时搜索规范文本"
    ),
    wholeCellAggregate: "count / distinct-count / min / max",
    semanticSummary: t(
      "Earliest, latest, distinct; explicit buckets",
      "最早、最晚、不同值；显式分桶"
    ),
    formulaOperand: t("Yes", "支持"),
    lookupResult: "date atom",
    recordLabel: t("Yes", "支持"),
    csv: "YYYY-MM-DD",
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t("Calendar display; no timezone", "日历展示；不应用时区"),
  },
  {
    fieldKind: "Datetime",
    canonicalValue: "YYYY-MM-DDTHH:MM:SS.sssZ TEXT / datetime",
    mutation: t("Writable", "可写"),
    filter: "eq / in / range",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t(
      "Record Label canonical text only",
      "仅作为记录标签时搜索规范文本"
    ),
    wholeCellAggregate: "count / distinct-count / min / max",
    semanticSummary: t(
      "Earliest, latest, distinct; UTC buckets",
      "最早、最晚、不同值；UTC 分桶"
    ),
    formulaOperand: t("Yes", "支持"),
    lookupResult: "datetime atom",
    recordLabel: t("Yes", "支持"),
    csv: t("Canonical UTC datetime", "规范 UTC datetime"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t(
      "UI localizes; import normalizes before mutation",
      "UI 本地化；导入在 mutation 前归一化"
    ),
  },
  {
    fieldKind: "URL",
    canonicalValue: t("URI-reference TEXT / url", "URI-reference TEXT / url"),
    mutation: t("Writable", "可写"),
    filter: "eq / in / contains / prefix / suffix",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t("Raw URI-reference", "原始 URI-reference"),
    wholeCellAggregate: "count / distinct-count / min / max",
    semanticSummary: t(
      "Null, blank, filled, distinct; optional scheme",
      "null、空串、非空、不同值；可选 scheme"
    ),
    formulaOperand: t("Yes", "支持"),
    lookupResult: "url atom",
    recordLabel: t("Yes", "支持"),
    csv: t("Raw URI-reference", "原始 URI-reference"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t(
      "UI link, copy and text fallback; no automatic fetch",
      "UI 链接、复制与文本回退；不自动 fetch"
    ),
  },
  {
    fieldKind: "Select",
    canonicalValue: t("Option name TEXT / select", "Option name TEXT / select"),
    mutation: t("Writable", "可写"),
    filter: "eq / in / contains",
    sort: t("Yes", "支持"),
    group: t("Yes", "支持"),
    search: t("Option name", "Option name"),
    wholeCellAggregate: "count / distinct-count / min / max",
    semanticSummary: t(
      "Option facets, null and uncatalogued values",
      "Option facets、null 与 catalog 外原值"
    ),
    formulaOperand: t("As text", "按 text"),
    lookupResult: "select atom",
    recordLabel: t("Yes", "支持"),
    csv: t("Option name", "Option name"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t(
      "Catalog color and icon are UI state",
      "Catalog 颜色与图标属于 UI state"
    ),
  },
  {
    fieldKind: "Multi-select",
    canonicalValue: t(
      "Unique option-name JSON array / multi-select",
      "唯一 option-name JSON array / multi-select"
    ),
    mutation: t("Writable", "可写"),
    filter: "whole eq / in / any / all",
    sort: t("No", "不支持"),
    group: t("No", "不支持"),
    search: t("Each Option name", "每个 Option name"),
    wholeCellAggregate: t(
      "count / distinct-count on complete arrays",
      "对完整数组 count / distinct-count"
    ),
    semanticSummary: t(
      "Empty rows, selections, distinct options and facets",
      "空行、选择总数、不同 Option 与 facets"
    ),
    formulaOperand: t("No", "不支持"),
    lookupResult: "list<select>",
    recordLabel: t("No", "不支持"),
    csv: "JCS string array",
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t(
      "Chips; UI adds zero-use catalog options",
      "Chips；UI 补充零使用量 catalog Option"
    ),
  },
  {
    fieldKind: "File",
    canonicalValue: t(
      "FileEntry JSON array / file",
      "FileEntry JSON array / file"
    ),
    mutation: t("Writable", "可写"),
    filter: t(
      "Whole-cell typed equality / in",
      "完整单元格 typed equality / in"
    ),
    sort: t("No", "不支持"),
    group: t("No", "不支持"),
    search: t(
      "name, non-data URI and mediaType",
      "name、非 data URI 与 mediaType"
    ),
    wholeCellAggregate: t(
      "count / distinct-count on complete arrays",
      "对完整数组 count / distinct-count"
    ),
    semanticSummary: t(
      "File rows, entries, bytes, MIME, URI kind and per-row count",
      "文件行、条目、字节、MIME、URI kind 与每行数量"
    ),
    formulaOperand: t("No", "不支持"),
    lookupResult: "list<file-entry>",
    recordLabel: t("No", "不支持"),
    csv: "JCS FileEntry array",
    layerOwners: layers.all,
    uiAdapter: t(
      "UI preview/icon/URL fallback; Adapter resolves relative assets and optional content",
      "UI 预览/icon/URL 回退；Adapter 解析相对资产与可选内容"
    ),
  },
  {
    fieldKind: t("Forward Relation", "正向 Relation"),
    canonicalValue: t(
      "Unique Row-ID JSON array / relation",
      "唯一 Row-ID JSON array / relation"
    ),
    mutation: t("Writable", "可写"),
    filter: "whole eq / in / target any / all",
    sort: t("No", "不支持"),
    group: t("No", "不支持"),
    search: t(
      "Current target Record Labels; unresolved Row IDs",
      "当前目标 Record Label；unresolved Row ID"
    ),
    wholeCellAggregate: t(
      "count / distinct-count on complete arrays",
      "对完整数组 count / distinct-count"
    ),
    semanticSummary: t(
      "Rows, edges, targets, unresolved, fan-out and target facets",
      "行、边、目标、unresolved、fan-out 与目标 facets"
    ),
    formulaOperand: t("No", "不支持"),
    lookupResult: "list<row-id>",
    recordLabel: t("No", "不支持"),
    csv: "JCS Row-ID array",
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t(
      "Runtime resolves labels; UI renders chooser and chips",
      "Runtime 解析标签；UI 渲染选择器与 chips"
    ),
  },
  {
    fieldKind: t("Inverse Relation", "反向 Relation"),
    canonicalValue: t(
      "Definition / virtual relation",
      "定义 / virtual relation"
    ),
    mutation: t("Read-only", "只读"),
    filter: "whole eq / in / source any / all",
    sort: t("No", "不支持"),
    group: t("No", "不支持"),
    search: t("Current source Record Labels", "当前来源 Record Label"),
    wholeCellAggregate: t(
      "count / distinct-count on evaluated arrays",
      "对求值数组 count / distinct-count"
    ),
    semanticSummary: t(
      "Same edge and target metrics as forward Relation",
      "与正向 Relation 相同的边和目标统计"
    ),
    formulaOperand: t("No", "不支持"),
    lookupResult: "list<row-id>",
    recordLabel: t("No", "不支持"),
    csv: t("Evaluated Row-ID array export only", "仅导出求值后的 Row-ID array"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t(
      "Runtime reverse projection; UI read-only",
      "Runtime 反向投影；UI 只读"
    ),
  },
  {
    fieldKind: "Formula",
    canonicalValue: t(
      "Definition / declared result TypeRef",
      "定义 / declared result TypeRef"
    ),
    mutation: t("Read-only", "只读"),
    filter: t("By result type", "按结果类型"),
    sort: t("By result type", "按结果类型"),
    group: t("By result type", "按结果类型"),
    search: t("By result Search Fragments", "按结果 Search Fragments"),
    wholeCellAggregate: t("By result type", "按结果类型"),
    semanticSummary: t(
      "By result type; row-value failures become null",
      "按结果类型；行值求值失败成为 null"
    ),
    formulaOperand: t("Yes", "支持"),
    lookupResult: t("Result atom", "结果 atom"),
    recordLabel: t("Special", "特殊"),
    csv: t("Evaluated export only", "仅导出求值结果"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t(
      "Read-only computed value; UI shows definition separately",
      "只读计算值；UI 分开展示定义"
    ),
  },
  {
    fieldKind: t("Lookup Scalar", "Lookup 标量"),
    canonicalValue: t(
      "Definition / inferred scalar TypeRef",
      "定义 / inferred scalar TypeRef"
    ),
    mutation: t("Read-only", "只读"),
    filter: t("By result type", "按结果类型"),
    sort: t("By result type", "按结果类型"),
    group: t("By result type", "按结果类型"),
    search: t("By result Search Fragments", "按结果 Search Fragments"),
    wholeCellAggregate: t("By result type", "按结果类型"),
    semanticSummary: t("By result type", "按结果类型"),
    formulaOperand: t("Special", "特殊"),
    lookupResult: t(
      "Result atom; nested Lookup allowed",
      "结果 atom；允许嵌套 Lookup"
    ),
    recordLabel: t("No", "不支持"),
    csv: t("Evaluated export only", "仅导出求值结果"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t(
      "Read-only; UI shows the source path",
      "只读；UI 展示来源路径"
    ),
  },
  {
    fieldKind: t("Lookup List", "Lookup 列表"),
    canonicalValue: t(
      "Definition / flattened list TypeRef",
      "定义 / flattened list TypeRef"
    ),
    mutation: t("Read-only", "只读"),
    filter: "whole eq / in / element any / all",
    sort: t("No", "不支持"),
    group: t("No", "不支持"),
    search: t(
      "Each flattened atom's Search Fragments",
      "每个展平 atom 的 Search Fragments"
    ),
    wholeCellAggregate: t(
      "count / distinct-count on complete lists",
      "对完整列表 count / distinct-count"
    ),
    semanticSummary: t(
      "Empty rows, elements, distinct atoms and typed facets",
      "空行、元素、不同 atom 与 typed facets"
    ),
    formulaOperand: t("No", "不支持"),
    lookupResult: t(
      "Flattened list; no nested public list",
      "展平列表；public boundary 无嵌套列表"
    ),
    recordLabel: t("No", "不支持"),
    csv: t("Evaluated JCS array export only", "仅导出求值后的 JCS array"),
    layerOwners: layers.fileRuntimeUi,
    uiAdapter: t("Read-only typed list rendering", "只读 typed list 渲染"),
  },
]

const statisticsRows = [
  {
    metric: "rowCount",
    meaning: t(
      "Rows selected by the same RowQuery and revision",
      "由同一 RowQuery 与 revision 选中的行数"
    ),
    scalar: t("All selected rows", "全部选中行"),
    multiValue: t("All selected rows", "全部选中行"),
  },
  {
    metric: "nullRowCount",
    meaning: t(
      "Rows whose scalar logical value is null",
      "scalar logical value 为 null 的行"
    ),
    scalar: t("Counts null", "统计 null"),
    multiValue: t("Normally zero; lists use []", "通常为零；列表使用 []"),
  },
  {
    metric: "emptyRowCount",
    meaning: t(
      "Rows with an empty string or empty list by Field rules",
      "按 Field 规则为空串或空列表的行"
    ),
    scalar: t("String-like empty value only", "仅 string-like 空值"),
    multiValue: t("List length is zero", "列表长度为零"),
  },
  {
    metric: "nonEmptyRowCount",
    meaning: t(
      "Rows with at least one user-visible value",
      "至少有一个用户可见值的行"
    ),
    scalar: t("Non-null and not empty", "非 null 且非空"),
    multiValue: t("List length is greater than zero", "列表长度大于零"),
  },
  {
    metric: "valueCount",
    meaning: t(
      "Non-null scalar values or exploded list elements",
      "非 null scalar 值或展开后的列表元素"
    ),
    scalar: t("At most one per row", "每行最多一个"),
    multiValue: t("Sum of list lengths", "列表长度之和"),
  },
  {
    metric: "distinctValueCount",
    meaning: t(
      "Distinct values under the Field's typed identity",
      "按 Field typed identity 去重后的值数"
    ),
    scalar: t("Typed scalar equality", "Typed scalar equality"),
    multiValue: t("Distinct exploded atoms", "不同的展开 atom"),
  },
  {
    metric: "facet.rows",
    meaning: t("Rows containing a facet value", "包含某个 facet value 的行数"),
    scalar: t("Rows equal to the value", "等于该值的行"),
    multiValue: t(
      "Rows containing the atom at least once",
      "至少包含一次该 atom 的行"
    ),
  },
  {
    metric: "facet.occurrences",
    meaning: t(
      "Total occurrences of a facet value",
      "某个 facet value 的出现总次数"
    ),
    scalar: t("Same as facet.rows", "与 facet.rows 相同"),
    multiValue: t(
      "May exceed facet.rows, especially File MIME",
      "可以大于 facet.rows，尤其是 File MIME"
    ),
  },
  {
    metric: "elementCountMin / Max / Average",
    meaning: t(
      "Per-row list length statistics, including zero-length rows",
      "每行列表长度统计，包括 zero-length row"
    ),
    scalar: t("Not applicable", "不适用"),
    multiValue: t(
      "Null only when no rows are selected",
      "仅在未选中任何行时为 null"
    ),
  },
  {
    metric: "totalBytes",
    meaning: t(
      "Exact decimal sum of canonical FileEntry size metadata",
      "canonical FileEntry size metadata 的精确十进制总和"
    ),
    scalar: t("Only FileEntry result types", "仅 FileEntry result type"),
    multiValue: t(
      "File and list<file-entry>; never reads asset bytes",
      "File 与 list<file-entry>；绝不读取资产字节"
    ),
  },
]

const glossaryRows = [
  {
    term: t("Canonical state", "Canonical state"),
    definition: t(
      "Authoritative user data required to interpret the published .eidos file",
      "解释已发布 .eidos 文件所必需的权威用户数据"
    ),
    owner: t("File Format", "文件格式"),
  },
  {
    term: t("Logical value", "Logical value"),
    definition: t(
      "Typed value exposed by Runtime after decoding or derived evaluation",
      "Runtime 解码或派生求值后暴露的 typed value"
    ),
    owner: t("Runtime", "运行时"),
  },
  {
    term: t("Search Fragment", "Search Fragment"),
    definition: t(
      "Deterministic user-visible string matched by portable Runtime search",
      "portable Runtime search 匹配的确定性用户可见字符串"
    ),
    owner: t("Runtime", "运行时"),
  },
  {
    term: t("Whole-cell aggregate", "Whole-cell aggregate"),
    definition: t(
      "Aggregate over the complete typed logical cell, including complete ordered lists",
      "对完整 typed logical cell 聚合，包括完整有序列表"
    ),
    owner: t("Runtime", "运行时"),
  },
  {
    term: t("Semantic summary", "Semantic summary"),
    definition: t(
      "Field-aware overview that explodes options, Relation edges or File entries",
      "按字段语义展开 Option、Relation edge 或 File entry 的汇总"
    ),
    owner: t("Runtime", "运行时"),
  },
  {
    term: t("Generated state", "Generated state"),
    definition: t(
      "Disposable index, cache, compiled plan or resolved projection rebuilt from canonical state",
      "可从 canonical state 重建的可丢弃索引、cache、compiled plan 或 resolved projection"
    ),
    owner: t("Runtime", "运行时"),
  },
  {
    term: t("Host-private state", "Host-private state"),
    definition: t(
      "Permissioned asset cache, content index or platform handle that is never required from the file",
      "文件不依赖的授权资产 cache、内容索引或平台 handle"
    ),
    owner: t("Adapter", "适配器"),
  },
  {
    term: t("UI state", "UI state"),
    definition: t(
      "Formatting, icons, localized aliases, preview selection and other presentation choices",
      "格式、图标、本地化别名、预览选择与其他展示决策"
    ),
    owner: t("UI", "界面"),
  },
  {
    term: "By result type / →T",
    definition: t(
      "Formula or Lookup inherits the capability from its exact result TypeRef",
      "Formula 或 Lookup 从准确 result TypeRef 继承该能力"
    ),
    owner: t("Runtime", "运行时"),
  },
]

const localizedSchema = {
  en: {
    fileTitle: "Eidos Field Capability Matrix 1.0",
    fileDescription:
      "A self-contained, executable overview of every Eidos Field kind and its cross-layer capabilities.",
    matrixTable: "Field capabilities",
    matrixDescription:
      "One row per stored, system, Relation, Formula, or Lookup Field kind.",
    statisticsTable: "Statistics glossary",
    statisticsDescription:
      "Portable row-domain and exploded value-domain summary metrics.",
    glossaryTable: "Capability glossary",
    glossaryDescription:
      "The state and ownership terms used by the capability matrix.",
    grid: "Grid",
    fields: {
      fieldKind: "Field kind",
      canonicalValue: "Canonical / Runtime value",
      mutation: "Mutation",
      filter: "Filter",
      sort: "Sort",
      group: "Group",
      search: "Search Fragment",
      wholeCellAggregate: "Whole-cell aggregate",
      semanticSummary: "Semantic summary",
      formulaOperand: "Formula operand",
      lookupResult: "Lookup result",
      recordLabel: "Record Label",
      csv: "CSV",
      layerOwners: "Layer owners",
      uiAdapter: "UI / Adapter behavior",
      metric: "Metric",
      meaning: "Meaning",
      scalar: "Scalar Fields",
      multiValue: "Multi-value Fields",
      term: "Term",
      definition: "Definition",
      owner: "Normative owner",
    },
  },
  zh: {
    fileTitle: "Eidos 字段能力矩阵 1.0",
    fileDescription: "自包含、可执行的 Eidos Field kind 与跨层能力总览。",
    matrixTable: "字段能力",
    matrixDescription:
      "每行对应一种 stored、system、Relation、Formula 或 Lookup Field kind。",
    statisticsTable: "统计口径",
    statisticsDescription: "portable row-domain 与展开 value-domain 汇总指标。",
    glossaryTable: "能力词汇表",
    glossaryDescription: "能力矩阵使用的状态与 ownership 术语。",
    grid: "表格",
    fields: {
      fieldKind: "字段类型",
      canonicalValue: "Canonical / Runtime 值",
      mutation: "写入",
      filter: "筛选",
      sort: "排序",
      group: "分组",
      search: "搜索片段",
      wholeCellAggregate: "整格聚合",
      semanticSummary: "语义汇总",
      formulaOperand: "公式引用",
      lookupResult: "Lookup 结果",
      recordLabel: "记录标签",
      csv: "CSV",
      layerOwners: "负责层",
      uiAdapter: "UI / Adapter 行为",
      metric: "指标",
      meaning: "含义",
      scalar: "标量字段",
      multiValue: "多值字段",
      term: "术语",
      definition: "定义",
      owner: "规范负责层",
    },
  },
}

export function getFieldCapabilityMatrixData(locale) {
  return {
    ...localizedSchema[locale],
    capabilityRows: localize(capabilityRows, locale),
    glossaryRows: localize(glossaryRows, locale),
    statisticsRows: localize(statisticsRows, locale),
    statuses: {
      mutation: localize(
        [t("Writable", "可写"), t("Read-only", "只读")],
        locale
      ),
      support: localize(
        [
          t("Yes", "支持"),
          t("Special", "特殊"),
          t("By result type", "按结果类型"),
          t("No", "不支持"),
        ],
        locale
      ),
      formula: localize(
        [
          t("Yes", "支持"),
          t("As text", "按 text"),
          t("Special", "特殊"),
          t("No", "不支持"),
        ],
        locale
      ),
      layers: localize(
        [
          t("File Format", "文件格式"),
          t("Runtime", "运行时"),
          t("Adapter", "适配器"),
          t("UI", "界面"),
        ],
        locale
      ),
    },
  }
}
