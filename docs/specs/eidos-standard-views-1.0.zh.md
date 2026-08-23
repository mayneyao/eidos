# Eidos 标准视图 1.0（中文参考）

状态：Eidos 最终标准的参考翻译
版本：1.0
发布日期：2026-08-23
编辑与变更控制：Eidos Project
唯一规范语言：English

## 摘要

Eidos 标准视图 1.0 定义 Eidos UI 实现共享的五种内建 View：Grid、Gallery、
Kanban、Calendar 与 Form。本文拥有它们的持久化 layout 含义、默认值、
renderer 专用配置和 View 专用交互要求。

本文是 [Eidos UI 1.0](./eidos-ui-1.0.zh.md) 的 normative companion，不引入新的
产品层或 conformance label。Eidos UI 拥有通用 RuntimeClient、HostServices、state、
editing、accessibility 与 renderer isolation 契约；本文把这些契约具体化到内建 View。

## 1. 文档地位与规范性术语

英文正文是唯一 normative 文档；本中文文档是 informative 参考。

英文正文中大写的 **MUST**、**MUST NOT**、**REQUIRED**、**SHALL**、
**SHALL NOT**、**SHOULD**、**SHOULD NOT**、**RECOMMENDED**、
**NOT RECOMMENDED**、**MAY** 与 **OPTIONAL** 按 BCP 14 解释。本中文参考用
“必须/不得/应当/不应/可以”对应其强度；若翻译存在歧义，以英文为准。

标为 informative 的 example 与 rationale 不构成要求。JSON Schema、默认值、
适用性表、算法和 conformance vector 都是英文规范的 normative 内容。

## 2. 范围、ownership 与 conformance

**标准 View** 是 saved `type` 恰好为 `grid`、`gallery`、`kanban`、`calendar`
或 `form` 的 View。

下层 ownership 保持不变：

- Eidos File Format 拥有 `eidos__views` row 与 canonical JSON 存储；
- Eidos Runtime 拥有 stable Field ID、logical type、saved-query 语义、row/View
  mutation、revision check、group 与 aggregate；
- Eidos Adapter 拥有 platform、persistence、asset 与 publication 行为；
- Eidos UI 与本文拥有 layout 解释及 presentation-layer interaction。

本文不定义发布、公开 URL、鉴权、密码、远程 Form 提交、滥用防护、附件传输或响应
收集。服务可以把 View 当作 immutable input，但其网络与存储行为属于独立的服务契约。

不存在 `EU-Views` 或单个 View 的 conformance label。现有 Eidos UI label 按下表
包含本文：

| Label           | 标准 View 要求                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `EU-Viewer-1.0` | 渲染全部五种标准 View，包括只读 Form Preview，并实现通用无损保留、bounded read、accessibility 与 compatibility 行为     |
| `EU-Editor-1.0` | 全部 Viewer 要求，以及全部标准 View 配置、使用已有 eligible Field 的 Form Builder 编辑与 revision-checked View mutation |
| `EU-Schema-1.0` | 全部 Editor 要求，以及通过 schema preflight/mutation 新建 Form question                                                 |

Headless tool 可以创建符合本文的标准 View metadata 而不声明 UI label，但必须通过
符合 Runtime 规范且带 revision check 的 View mutation 写入。

## 3. 通用存储结构

### 3.1 Ownership 与无损保留

`ViewDescriptor` 暴露 `type`、canonical `query` 与 canonical `layout`。本文拥有
标准 View 已知 layout key 的含义；Runtime 把未知 layout member 当作 opaque
canonical metadata。

UI 更新一个 known key 时，必须保留所有 unknown member 和未更新的 known member。
它可以发送 Runtime 支持的 member patch，或在 `expectedRevision` 下 merge 到最新
object；不得 parse 后 rewrite stale copy。

五种标准 type 共用一个 layout envelope。对当前 type 不适用的已知 key 必须保留并
忽略。这样 explicit type change 及 reversal 不会丢失 layout intent。

View 配置有两个独立分类维度。`query.filter` 与 `query.sort` 是通用功能配置，其
row-set 语义归 Runtime；layout key 分为通用与 renderer 专用。Renderer 专用 key
可以选择 Runtime operation，但仍是 layout recipe；generated group、aggregate、row
与 resolved value 不得复制进 layout。

Core layout 绝不存 Row ID、cell/group value、resolved label、selection、scroll、
hover、open editor、transient collapsed group、Builder/Preview mode、draft answer、
validation error 或 completion state；它们属于 Runtime result 或 UI state。

### 3.2 通用 Field layout

| Key                   | 类型              | 读取默认值                             | 适用 View                       | 含义                                                |
| --------------------- | ----------------- | -------------------------------------- | ------------------------------- | --------------------------------------------------- |
| `fieldOrder`          | Field-ID 唯一数组 | metadata Field position，再按 Field ID | 全部标准 View                   | 从前到后的 Field 或 question 顺序                   |
| `hiddenFields`        | Field-ID 唯一数组 | `[]`                                   | 全部标准 View                   | 从 View 省略的普通 Field，不是删除                  |
| `visibleSystemFields` | Field-ID 唯一数组 | `[]`                                   | Grid、Gallery、Kanban、Calendar | 在当前 View 明确展示的 optional hidden system Field |

普通 Field 的可见性由 `hiddenFields` 控制；optional system Field 只由
`visibleSystemFields` 控制，同一个 system Field 即使也在 `hiddenFields` 中也没有
额外效果。Form 按第 9.2 节完全排除 system Field。

Unknown/deleted Field ID 保留在 layout JSON 中，rendering 时忽略；ID 再次有效时原
layout 恢复。Core array 中的 duplicate ID 不是 valid UI output。读取到 duplicate 时，
UI 以第一次出现为准进行渲染，保留原值直到 explicit layout edit，并报告 advisory
diagnostic。

每个 `EU-Editor-1.0` 实现都必须为每种标准 View 提供一个易发现的 Fields control。
它可以显示/隐藏所有当前 configurable Field 并更新 `fieldOrder`；编辑当前 Field 时
保留 unknown/deleted ID；即使 View 没有 visible Field 也必须保留恢复入口。Form 的
Fields 只列出 eligible input，并额外支持 **Show all** 与 **Hide all**。

### 3.3 Type change 与不可用 renderer

改变 `view.type` 是 explicit、revision-checked View mutation。对新 type 不适用的
layout member 仍须保留。UI 不得从 navigation 或 rendering fallback 推断 type change。

未知 `view.type` 仍是有效的 forward-compatible metadata。没有注册 renderer 的 UI
必须显示 View name、unknown type 与 accessible unsupported-renderer state。它可以
临时显示只读 Grid fallback，但不得修改 saved type/layout。无关 View edit 必须在逻辑
内容上完整保留 unknown type/layout。

当 `ViewDescriptor.queryStatus="unsupported"` 时，View 仍保留在所有 tab、menu 与
navigation surface 中。UI 显示 accessible update-required state，不得使用 `{}` query
placeholder 发起 `queryRows`、`groupRows`、aggregate 或 export。Filter/Sort 禁用。
Rename、reorder 与只修改 layout 的 patch 可以保留，但必须省略 `query`。替换 query
必须明确告知用户新版 query 将被删除并取得显式确认。

Unknown renderer 与 unsupported query 相互独立。UI 优先报告 query incompatibility，
否则 Grid fallback 会展示错误的 row set。

## 4. Grid

### 4.1 Layout

| Key             | 类型                             | 读取默认值              | 含义                                                        |
| --------------- | -------------------------------- | ----------------------- | ----------------------------------------------------------- |
| `fieldWidths`   | Field-ID → number map            | `{}`；缺失 entry 为 `1` | `0.25..8` 的 dimensionless preferred relative width         |
| `rowDensity`    | `compact\|standard\|comfortable` | `standard`              | semantic row-density hint                                   |
| `freezeColumns` | non-negative integer             | `1`                     | 冻结 leading visible Field 的数量，并按 visible count clamp |
| `columnStats`   | Field-ID → `{type}` map          | `{}`                    | 每列 aggregate footer 请求                                  |

Grid 按 `fieldOrder` 展示 visible Field，再按 metadata order 追加剩余 visible Field。
`freezeColumns` 在 visibility 与 ordering 之后计算。Width 与 density token 不规定
pixel、grid library、breakpoint 或 rendering engine。

### 4.2 Column statistics

`columnStats[*].type` 只能是 `count-all`、`count-non-null`、`count-distinct`、
`count-empty`、`percent-checked`、`percent-unchecked`、`sum`、`average`、`min`、
`max`、`relation-value-count`、`relation-row-count` 或
`relation-distinct-target-count`。

UI 只启用与 Field 兼容的 Runtime choice，发送相应 `AggregateRequest`，并只展示
revision 匹配的结果。Aggregate result 是 generated state，绝不持久化。

`percent-checked` 与 `percent-unchecked` 仅适用于 Checkbox Field，分母是 active
Runtime query 命中的全部 row。前者统计 canonical true，后者统计 false 与 SQL NULL。
空结果为 `0`；其他结果位于 `0..100`，展示最多两位小数。

## 5. 共享 Card layout

Gallery 与 Kanban 共用：

| Key               | 类型                   | 读取默认值 | 含义                                                               |
| ----------------- | ---------------------- | ---------- | ------------------------------------------------------------------ |
| `cardFields`      | Field-ID 唯一数组      | `[]`       | ordered secondary card Field；Record Label 始终为 title            |
| `coverField`      | Field ID 或 `null`     | `null`     | 用作 cover 的 File Field 或 image-display URL-capable scalar Field |
| `coverFit`        | `cover\|contain`       | `cover`    | semantic cover fitting hint                                        |
| `cardSize`        | `small\|medium\|large` | `medium`   | semantic card-size hint                                            |
| `hideEmptyFields` | boolean                | `true`     | logical value 为空时省略 configured secondary Field                |

`cardFields` 是 secondary content，Table Record Label 是 card title。同时存在于
`hiddenFields` 的 `cardFields` member 必须省略。

File Field，或 Field settings 声明 `display.kind="image"` 的 scalar URL Field / scalar
URL Formula/Lookup result，可以作为 `coverField`。Missing、hidden、ineligible、NULL、
empty、denied 或 unresolved cover 产生 non-persisted placeholder。Eligible URL cover
遵循 Eidos UI 1.0 的 image-display 规则，绝不能把 URL 转成 File entry。

Fields 与 Card 配置是前后两级 pipeline。Fields 负责通用可用性和 `fieldOrder`；Card
配置只负责 `cardFields`、cover、fit、size 与 empty-value handling。Card chooser 只
提供当前 visible Field。在 Fields 中隐藏始终优先。编辑 available member 时必须保留
unknown 或暂时 unavailable 的 `cardFields` member。

## 6. Gallery

Gallery 使用第 3.2 节的通用 Field layout 与第 5 节的共享 Card layout；version 1 没有
额外 layout key。Gallery 必须通过 bounded Runtime page 保持交互，不得 materialize
全部 row set。

## 7. Kanban

### 7.1 Layout

| Key               | 类型               | 读取默认值 | 含义                                                             |
| ----------------- | ------------------ | ---------- | ---------------------------------------------------------------- |
| `groupField`      | Field ID 或 `null` | `null`     | grouping Field；`null` 表示配置不完整                            |
| `showEmptyGroups` | boolean            | `true`     | 展示 grouping Field canonical option catalog 中的 zero-row group |

`groupField:null`、Field missing 或 Field 不可分组时，必须显示 accessible
configuration-required state。UI 不得虚构 Field 或 group value。

当 `showEmptyGroups:false` 时，只有 Runtime 已对 active revision 与 saved query
权威报告某 catalog group 为 zero row 后才能省略。该 option 仍是合法 move target；
成功 move 后重新可见。Count resolve 前的省略只是 provisional UI state，不持久化。

### 7.2 移动

只有 `groupField` 是 writable stored scalar 且 Runtime 提供 destination 的精确 logical
group value 时，Kanban 才能移动。移动是 `expectedRevision` 下的一次 sparse
`mutateRows` update；UI 绝不能把 display label 写成 group value。

Formula、Lookup、inverse Relation、list 与 read-only group 不能接受移动。Card 顺序
来自 Runtime query。Version 1 没有 manual row-order key，所以组内拖动只是 ephemeral。

## 8. Calendar

### 8.1 Layout 与读取

| Key         | 类型               | 读取默认值 | 含义                                                             |
| ----------- | ------------------ | ---------- | ---------------------------------------------------------------- |
| `dateField` | Field ID 或 `null` | `null`     | 用于把 Record 放到日期上的 temporal Field；`null` 表示配置不完整 |

Eligible Field 是 Date、Datetime、显示类型为两者之一的 Formula/Lookup，或 created/
updated system Field。Missing、deleted、non-temporal 或 `null` 的 `dateField` 必须产生
accessible configuration-required state。Date 为空的 Record 不进入 Calendar。

Date 直接使用 canonical `YYYY-MM-DD`；Datetime 按 Editor 当前 local time zone 分配。
Visible month、today、expanded day 与 scroll position 都是 transient UI state。
Calendar read 必须把 visible range 与 saved filter/search 组合，不能替换它们。

Host 可以提供 global first-weekday preference。Calendar 必须同时用它决定 weekday
column order 与 requested visible range；默认是 Monday。该 preference 不是 View
layout，绝不能写入 Eidos File。

### 8.2 新建 Record

当 `dateField` 是 writable stored Date/Datetime 时，每个 visible day 都提供 create
action。Runtime 创建 Record，并把该 Field 设为 selected canonical day；Datetime 使用
编码为 canonical instant 的 local midnight。

当 `dateField` 是 created/updated system Field 时，只有 today 提供创建，时间戳由
Runtime 生成。Formula/Lookup date Field 是 derived value，不提供 day creation。成功后，
Editor 打开新 Record 的标准 inspector。

## 9. Form

### 9.1 存储结构

Form View 使用 `type="form"`、空 Runtime `SavedViewQuery`，layout 由本节解释。
View type 与本文版本已经能够标识契约；Form 不增加 per-View profile marker。

| Key              | 类型                  | 读取默认值             | 含义                                 |
| ---------------- | --------------------- | ---------------------- | ------------------------------------ |
| `title`          | non-empty string      | saved View name        | 面向填写者的标题                     |
| `description`    | string 或 `null`      | `null`                 | 面向填写者的介绍                     |
| `submitLabel`    | non-empty string      | `"Submit"`             | 提交按钮文案                         |
| `successMessage` | non-empty string      | `"Response recorded."` | 支持真实提交的 host 所显示的成功信息 |
| `fields`         | Field-config 唯一数组 | `[]`                   | 每个问题的展示与校验覆盖项           |

Form 同时使用通用 `fieldOrder` 与 `hiddenFields`。`title` 上限为 512 UTF-8 bytes，
`description` 为 4,096，`submitLabel` 为 128，`successMessage` 为 1,024。Editor 去除
首尾空白，不写入空的 non-null string。

每个 `fields` item：

```ts
interface FormFieldConfig {
  fieldId: UUIDv7
  label?: string
  description?: string
  placeholder?: string
  multiline?: boolean
  required: boolean
}
```

`fieldId` 必须属于 Form 所在 Table，且数组内唯一。`label`/`placeholder` 上限为 512
UTF-8 bytes，question `description` 为 2,048。`multiline:true` 仅适用于 Text。缺失
optional string 表示使用 renderer 默认值，而不是展示空字符串。

### 9.2 Eligible input 与 effective question

Field 只有同时满足以下条件才 eligible：

1. 属于 Form View 所在 Table；
2. 是 writable stored source Field，而不是 system/derived Field；
3. 不是 metadata-hidden；
4. logical input type 是 Text、Number、Integer、Checkbox、Date、Datetime、File、
   Multi-select、Select 或 URL。

`settings.display.kind="rating"` 的 Integer 渲染为 Rating，但 canonical storage 与
Runtime mutation 中仍是 Integer。Version 1 不支持 JSON、Relation、Formula、Lookup、
row-ID、created-time 或 updated-time Field。

Effective questions 是当前 eligible 且不在 `hiddenFields` 中的 Fields。先按
`fieldOrder`，再按 Field metadata position、Field ID 排序。匹配的 `fields` item
提供 override；否则：

- label 使用当前 Field display name；
- description 与 placeholder 不存在；
- multiline 为 `false`；
- 除 File 与 Multi-select 外，non-null Field 的 required 为 `true`；其他为
  `false`。

`required:false` 不能放宽其他 non-null Field。File 与 Multi-select 仍可配置，因为它们
的 canonical empty value 是 `[]` 而不是 SQL `NULL`，即使 schema metadata 中
`nullable=0`。Unknown、deleted、ineligible 或 wrong-Table ID 在 rendering 时忽略，
并保留到 explicit edit 触及对应 collection。

### 9.3 Builder

可编辑 Form 默认以 Builder mode 打开。Builder 是 inline canvas，不是填写者提交页面，
也不是永久显示的 settings sidebar。

Builder 必须提供：

- 在 canvas 直接编辑 title 与 description；
- 支持 pointer 与 keyboard reorder 的 ordered question cards；
- 在问题之间和最后一个问题之后插入；
- 加入已有 eligible hidden Field，或通过 schema preflight/mutation 新建 eligible
  Table Field 的 chooser；
- contextual label、description、placeholder、required 与适用的 multiline 配置；
- 隐藏 question 而不删除 Table Field；
- Form-level submit-label 与 success-message options。

新建 Form 必须提供两个明确初始状态：

- **Include existing fields**：当前全部 eligible Field 按 metadata order 显示；
- **Start from scratch**：把当前全部 eligible Field ID 写入 `hiddenFields`，得到零个
  effective question。

创建或编辑 Form 使用普通 revision-checked View/schema mutation。UI 必须串行化保存、
展示冲突，不得直接写 SQLite，也不得静默重试 `stale-revision`。

### 9.4 Preview

Builder 与 Preview 使用 Form toolbar 中紧凑、稳定的 mode switch。Active mode 是
transient UI state。

Preview 使用 submission-capable renderer 相同的 control、required rule 与 presentation
渲染 effective questions。Draft value、validation error 与 completion state 都是
transient。

本地 Preview 提交只能校验 draft，不得调用 `mutateRows`、创建 Record、写 File value、
上传附件或改变 revision。支持真实 response submission 的 host 必须把它作为独立
capability 与 interaction context；该协议不属于本文。

### 9.5 Schema 演进

Form 引用 stable Field ID。Rename 会更新默认 label 而不破坏 question；custom label
保持不变。

Effective-question algorithm 始终基于当前 schema 重新计算：

- deleted 或新近 ineligible Field 消失，但不阻塞 Form；
- 同一 stable ID 再次 eligible 时，原有 order 与 presentation config 恢复；
- 新建 eligible Field 因尚未进入 `hiddenFields` 而默认 visible；
- 新建 ineligible Field 永不进入 Form Fields。

Text 改为其他 eligible type 后，`multiline` 不再生效。Editor 应在下一次 explicit
question edit 时移除该 member。Schema mutation safety 与 revision behavior 仍归 Runtime。

外部 immutable Form renderer 使用 artifact 创建时捕获的 schema。后续本地 schema
change 不会修改该 artifact，直到 explicit 生成新 artifact。

## 10. 可执行 JSON Schema

Conformance tool 使用 stored View `type` 与解析后的 `layout` 组装 envelope；envelope
本身不存储。第 9 节的 UTF-8 byte limit 与 `fields[*].fieldId` duplicate detection 是
额外 normative check。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://spec.eidos.space/ui/1.0/standard-view-layout.schema.json",
  "title": "Eidos Standard Views 1.0 layout envelope",
  "type": "object",
  "required": ["type", "layout"],
  "properties": {
    "type": { "enum": ["grid", "gallery", "kanban", "calendar", "form"] },
    "layout": {
      "type": "object",
      "properties": {
        "fieldOrder": { "$ref": "#/$defs/fieldIdArray" },
        "hiddenFields": { "$ref": "#/$defs/fieldIdArray", "default": [] },
        "visibleSystemFields": {
          "$ref": "#/$defs/fieldIdArray",
          "default": []
        },
        "fieldWidths": {
          "type": "object",
          "propertyNames": { "$ref": "#/$defs/fieldId" },
          "additionalProperties": {
            "type": "number",
            "minimum": 0.25,
            "maximum": 8
          },
          "default": {}
        },
        "rowDensity": {
          "enum": ["compact", "standard", "comfortable"],
          "default": "standard"
        },
        "freezeColumns": {
          "type": "integer",
          "minimum": 0,
          "maximum": 2147483647,
          "default": 1
        },
        "columnStats": {
          "type": "object",
          "propertyNames": { "$ref": "#/$defs/fieldId" },
          "additionalProperties": { "$ref": "#/$defs/columnStat" },
          "default": {}
        },
        "cardFields": { "$ref": "#/$defs/fieldIdArray", "default": [] },
        "coverField": {
          "oneOf": [{ "$ref": "#/$defs/fieldId" }, { "type": "null" }],
          "default": null
        },
        "coverFit": { "enum": ["cover", "contain"], "default": "cover" },
        "cardSize": {
          "enum": ["small", "medium", "large"],
          "default": "medium"
        },
        "hideEmptyFields": { "type": "boolean", "default": true },
        "groupField": {
          "oneOf": [{ "$ref": "#/$defs/fieldId" }, { "type": "null" }],
          "default": null
        },
        "showEmptyGroups": { "type": "boolean", "default": true },
        "dateField": {
          "oneOf": [{ "$ref": "#/$defs/fieldId" }, { "type": "null" }],
          "default": null
        },
        "title": { "type": "string", "minLength": 1 },
        "description": { "type": ["string", "null"] },
        "submitLabel": { "type": "string", "minLength": 1 },
        "successMessage": { "type": "string", "minLength": 1 },
        "fields": { "type": "array", "items": { "$ref": "#/$defs/formField" } }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": false,
  "$defs": {
    "fieldId": {
      "type": "string",
      "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    },
    "fieldIdArray": {
      "type": "array",
      "items": { "$ref": "#/$defs/fieldId" },
      "uniqueItems": true
    },
    "columnStat": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": {
          "enum": [
            "count-all",
            "count-non-null",
            "count-distinct",
            "count-empty",
            "percent-checked",
            "percent-unchecked",
            "sum",
            "average",
            "min",
            "max",
            "relation-value-count",
            "relation-row-count",
            "relation-distinct-target-count"
          ]
        }
      },
      "additionalProperties": false
    },
    "formField": {
      "type": "object",
      "required": ["fieldId", "required"],
      "properties": {
        "fieldId": { "$ref": "#/$defs/fieldId" },
        "label": { "type": "string", "minLength": 1 },
        "description": { "type": "string", "minLength": 1 },
        "placeholder": { "type": "string", "minLength": 1 },
        "multiline": { "type": "boolean" },
        "required": { "type": "boolean" }
      },
      "additionalProperties": true
    }
  }
}
```

`default` 等 Schema annotation 不会修改 instance。Key 缺失时使用第 3 至 9 节的读取
默认值。适用性也由这些章节决定；不适用 key 必须保留并忽略。

## 11. 可访问性与安全

全部标准 View 继承 Eidos UI 1.0 的 accessibility、localization、reduced motion、
untrusted-renderer 与 asset 规则。本文每个 View-specific configuration control/state
都必须有 accessible name 与 keyboard path。

Form question label、description、placeholder 与 message 都是不可信文本，不得获得
HTML、script、URL navigation、filesystem 或 network 权限。Form File control 只能
通过当前 Host capability 暴露 logical File value。

## 12. Conformance tests

每个 Eidos UI conformance suite 都必须运行本文中与其 label 对应的测试。

通用测试覆盖：

1. 五种 type registration 与稳定 navigation；
2. 通用 Field visibility/order，包括 zero-visible-Field recovery；
3. type change 时 non-applicable/unknown key 无损保留；
4. unknown type 与 unsupported-query 行为；
5. generated row/group/aggregate/resolved value 与 transient UI state 绝不进入 layout。

Viewer 与 Editor 测试还覆盖：

1. 第 4 至 9 节的每个 type-specific key 与默认值；
2. Grid、Gallery、Kanban、Calendar 的 bounded read；
3. eligible cover 与 lossless fallback；
4. Kanban group、empty group、writable move 与 read-only move 拒绝；
5. Calendar date mapping、range composition 与 eligible creation；
6. Form effective-question filtering、stable-ID rename、non-null scalar required、
   array-backed optional、Text-only multiline 与 read-only Preview。

Editor 测试覆盖 pointer/keyboard ordering、Form Fields 的 Show all/Hide all、默认
Builder mode、稳定的 Builder/Preview switch、本地 Preview 校验不产生 row mutation/
revision change，以及新建 Form 时带入全部 eligible Field或从零开始。

Schema 测试覆盖 Form Field 新建、删除、type conversion、Field 新近 eligible/ineligible、
invalid/duplicate question 拒绝，以及 stale revision 不产生修改。

## 13. 引用

- [Eidos File Format 1.0](./eidos-file-1.0.zh.md)
- [Eidos Runtime 1.0](./eidos-runtime-1.0.zh.md)
- [Eidos Adapter 1.0](./eidos-adapter-1.0.zh.md)
- [Eidos UI 1.0](./eidos-ui-1.0.zh.md)
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) 与
  [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)
- [JSON Schema Draft 2020-12 Core](https://json-schema.org/draft/2020-12/json-schema-core)
