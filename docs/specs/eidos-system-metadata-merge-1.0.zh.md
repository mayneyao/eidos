# Eidos 系统元数据合并 1.0

状态：Eidos 标准草案
版本：1.0
发布日期：2026-08-13
编辑与变更控制：Eidos Project
唯一规范语言：English

## 摘要

本规范为 [Eidos File Format 1.0](./eidos-file-1.0.zh.md) 数据库中的八张
canonical `eidos__*` 元数据表定义确定性的三方合并语义。它是名为
`ER-System-Merge-1.0` 的可选 Eidos Runtime profile。

这个 profile 消除 `eidos__meta.revision` singleton conflict 等实现细节冲突，保留
彼此独立的元数据编辑，只在存在 canonical object clock 与安全 atomic group 时使用
last-write-wins，并把剩余失败报告成 Eidos Table、Field、View、Feature 或依赖冲突，
而不是原始 SQLite row conflict。

本 profile 不定义同步、历史存储、remote publication、物理文件替换或用户行合并。
Version manager 可以提供 immutable Base/Ours/Theirs snapshots 与稳定 version keys，
但 logical result 与 post-merge validation 归 Eidos Runtime 所有。

## 本文档的状态

只有在大写时，**MUST**、**MUST NOT**、**REQUIRED**、**SHALL**、**SHALL NOT**、
**SHOULD**、**SHOULD NOT**、**RECOMMENDED**、**NOT RECOMMENDED**、**MAY** 与
**OPTIONAL** 才按 BCP 14 解释。

英文是 normative。本文是逐节对齐的 informative 中文参考。本文仍是 draft：在状态
变为 Final 且 required vectors 发布前，实现不得声明 `ER-System-Merge-1.0`。

## 1. 位置、范围与 Ownership

本 profile 补充 [Eidos Runtime 1.0](./eidos-runtime-1.0.zh.md)：

```text
Version manager / Sync host
        |
        | immutable Base, Ours, Theirs + stable version keys
        v
Eidos Runtime system merge    logical metadata merge and validation
        |
        v
Eidos File Format             canonical schema, IDs, references, raw values
        |
        v
Eidos Adapter                 handles, candidate publication, recovery
```

Ownership 保持不变：

- Eidos File Format 拥有 persisted metadata schema 与 validity rules；
- 本 Runtime profile 拥有 logical merge identity、automatic resolution、冲突分类与
  semantic post-merge validation；
- Eidos Adapter 拥有 snapshot 打开、lease、candidate durability、替换、取消与恢复；
- version manager 拥有 commit graph、immutable version key、传输与 remote ref
  publication。它不得自行从表名推断 Eidos 语义。

本 profile 只覆盖：

1. `eidos__meta`；
2. `eidos__tables`；
3. `eidos__fields`；
4. `eidos__features`；
5. `eidos__relation_fields`；
6. `eidos__formula_fields`；
7. `eidos__lookup_fields`；
8. `eidos__views`；
9. 仅为证明元数据结果可执行且有效而必须检查的物理 Table/Field schema 与 generated
   objects。

它不定义用户表 row、attachment file、ordinary file、未知 extension state 或
host-private index 的合并语义。这些输入仍可独立阻止外围 whole-file merge 完成。

System merge 分为 analysis stage 与 finalization stage。Analysis 固定 system metadata
decisions 与 final schema。Finalization 还要求一个 resolved non-system content
projection：要么 non-system state 相同，要么单独的 row/file merge 已在该准确 final
schema 下解决它。本 profile 不定义该 projection 的 merge policy；只要它还未解决，就
不得返回 publishable candidate。

## 2. 术语与输入契约

- **Base**、**Ours** 与 **Theirs**：三个 immutable Eidos File snapshot。
- **side key**：Ours 或 Theirs 的稳定 version-manager identity，例如 commit object
  ID。Side key 为 1..128 个匹配 `[a-z0-9._~-]+` 的小写 ASCII 字符。
- **metadata object**：由一张系统表 row 表示，或由 owner `eidos__fields` row 与其
  subtype row 共同表示的 stable-ID object。
- **Field aggregate**：一条 `eidos__fields` row、它的零或一条 Relation、Formula 或
  Lookup subtype row，以及所需 physical schema effects。
- **atomic group**：必须一起选择并验证的 columns 与 dependent effects。
- **object clock**：用于 last-write ordering 的 metadata object canonical
  `updated_at`。
- **write rank**：有序 pair `(object clock, side key)`。
- **domain conflict**：用 Eidos object 表达、而不是用 raw SQLite row/page 表达的
  unresolved logical conflict。
- **automatic resolution record**：解释一个自动选择的 atomic group 的 non-blocking
  audit data。

合并请求在逻辑上是：

```ts
interface EidosSystemMergeInput {
  base: EidosSnapshot
  ours: EidosSnapshot
  theirs: EidosSnapshot
  oursKey: string
  theirsKey: string
  operationInstant: string
}
```

`oursKey` 与 `theirsKey` 必须不同，并且在另一设备重试合并时仍标识同一 snapshots。
`operationInstant` 必须是 Runtime 从注入的 `clock.nowInstant()` 得到、并在第一次
canonical mutation 前冻结进 merge plan 的唯一 canonical instant。`ours` 与
`theirs` 只是本次调用中的角色；任何 tie-break rule 都不能偏好角色名。

分析前，三个 snapshot 都必须通过 Eidos File identity 与 structural validation。它们
必须具有相同 `file_id`、`format_major` 与 `format_minor`。`operationInstant` 必须晚于
三个输入 system metadata sets 中每个 `updated_at`。Malformed snapshot 属于
`invalid-merge-input`；Runtime clock 未向前推进属于 `clock-not-after-input`。两者都不是
可由用户解决的 domain conflict。

## 3. 确定性与 Last-Write Ordering

### 3.1 Write rank

Canonical instant 按其标准化 24-octet UTC 拼写比较。更晚 instant 具有更大 rank。
Instant 相等时，side key 按 unsigned ASCII byte order 比较，较大的 side key 胜出。
这个 tie-break 保证确定性，并不声称反映真实世界时间。

交换 Ours 与 Theirs、同时保留每个 snapshot 的 side key 与冻结的 operation instant，
必须得到相同 logical merged state、conflict set 与 automatic-resolution set。

### 3.2 Object clocks

| Object          | Object clock                     |
| --------------- | -------------------------------- |
| File metadata   | `eidos__meta.updated_at`         |
| Table           | `eidos__tables.updated_at`       |
| Field aggregate | owner `eidos__fields.updated_at` |
| View            | `eidos__views.updated_at`        |
| Feature         | 无                               |

Relation、Formula 与 Lookup subtype row 不得独立排序。它们完整的 Field aggregate 由
owner Field clock 控制。Conforming Writer 在 subtype definition 改变时已经会更新 owner
Field clock。

`eidos__features` 没有 canonical object clock。因此本 profile 不会对同一 Feature 的
并发变更使用 last-write-wins。

### 3.3 Last-write-wins 的含义

只有双方都把同一 atomic group 从 Base 改成不同值时才应用 LWW。单边变更必须保留。
同一 object 的不同 atomic group 变更要组合。不能仅因某一侧 clock 更晚就替换整个
object。

实现不得通过只把 `updated_at` 设为最大值、总是选择 Ours、使用 remote arrival order，
或使用本地设备角色作为 tie-break 来模拟 LWW。

`revision` 与 `updated_at` 本身不构成 substantive object update；它们是 merge-control
columns。输入 object clock 用于选择并发值；选择完成后，每个被 insert 或 substantive
update 的 Table、Field aggregate 或 View 都接收同一个 `operationInstant`。只有 clock
不同的相等 object 会直接折叠，不产生冲突。

## 4. 通用三方变更矩阵

除后续章节给出更严格规则外，这个矩阵适用于每个 stable-identity metadata object。

| Base    | Ours                                 | Theirs                               | 必须得到的结果          |
| ------- | ------------------------------------ | ------------------------------------ | ----------------------- |
| absent  | absent                               | absent                               | absent                  |
| absent  | inserted                             | absent                               | 在验证通过时包含 Ours   |
| absent  | absent                               | inserted                             | 在验证通过时包含 Theirs |
| absent  | identical insert                     | identical insert                     | 包含一个相等 object     |
| absent  | different insert with same stable ID | different insert with same stable ID | `identity-collision`    |
| present | unchanged                            | unchanged                            | 保留 Base               |
| present | updated                              | unchanged                            | 应用 Ours               |
| present | unchanged                            | updated                              | 应用 Theirs             |
| present | identical update                     | identical update                     | 应用相等 update         |
| present | disjoint atomic-group updates        | disjoint atomic-group updates        | 组合 groups             |
| present | different update to one LWW group    | different update to one LWW group    | 选择更大 write rank     |
| present | deleted                              | unchanged                            | 在依赖验证通过时删除    |
| present | unchanged                            | deleted                              | 在依赖验证通过时删除    |
| present | deleted                              | deleted                              | 删除                    |
| present | deleted                              | updated                              | `delete-update`         |
| present | updated                              | deleted                              | `delete-update`         |

本 profile 没有 deletion tombstone 或 deletion clock。它不能使用幸存 row 的 timestamp、
commit arrival order 或 side-role preference 来静默解决 delete/update。

完全由单边 Table 或 Field deletion 引起的 cascade 归因于该 parent deletion，不能再次
报告成独立 child-row deletes。如果另一侧 substantively change 了任何 cascaded child，
或仍有 surviving object 引用它，parent operation 变成 `delete-update` 或
`dependency-conflict`。

不同 stable ID 如果违反最终 uniqueness rule，包括 Table、Field 或 View 的
case-insensitive name 在 File-defined uniqueness scope 内发生冲突，产生
`name-collision`；因为 object identity 不同，LWW 不适用。

## 5. `eidos__meta`

### 5.1 目的

`eidos__meta` 是必须存在的技术性 File state。这个 singleton 的普通 divergence 不得
表现成 blocking conflict。尤其是，只要两台设备都做过有效修改，`revision` 与
`updated_at` 不同就是预期行为。

### 5.2 Column rules

| Columns                                                              | 规则                                                                             |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `singleton`、`format_major`、`format_minor`、`file_id`、`created_at` | immutable；所有 snapshots 必须一致                                               |
| `title`                                                              | 使用 File metadata write rank 的独立 LWW group                                   |
| `default_table_id`                                                   | 使用 File metadata write rank 的独立 LWW group；最终 reference 必须存在或为 NULL |
| `revision`                                                           | merge finalization，永不成为冲突                                                 |
| `updated_at`                                                         | merge finalization，永不成为冲突                                                 |

其他所有系统合并决策成功后：

1. `revision = max(base.revision, ours.revision, theirs.revision) + 1`；
2. `updated_at = operationInstant`；
3. integer overflow 产生 `revision-exhausted`；
4. 每个被 logical merge substantive insert 或 update 的 Table、Field aggregate 与 View
   都使用同一个 `operationInstant`。

自动 `title`、`default_table_id`、revision 或 timestamp 决策可以出现在 audit/history
details 中，但不得进入 domain conflict array，也不得要求用户确认。

## 6. `eidos__tables`

### 6.1 Identity 与 groups

一个 Table object 由 `id` 标识。

| Atomic group      | Columns/effects                                     | 并发规则                                                          |
| ----------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| identity          | `id`、`created_at`                                  | immutable                                                         |
| physical identity | `name`、`physical_name`、physical SQLite table name | 相同结果折叠；不同并发 rename 冲突                                |
| record label      | `label_field_id`                                    | LWW，之后进行 reference/type validation                           |
| order             | `position`                                          | LWW                                                               |
| settings          | `settings_json`                                     | 对完整 JCS object 使用 LWW                                        |
| clock             | `updated_at`                                        | 只用于输入排序；merged substantive change 使用 `operationInstant` |

### 6.2 枚举变更

- **Create Table**：单边创建只有在 name、physical schema、required system Fields 与
  label Field 保持有效时才自动处理。
- **并发创建相同 ID**：不相等 insert 是 `identity-collision`。
- **并发创建不同 ID 但同名**：`name-collision`。
- **单边 rename**：只有 physical table rename 与所有 metadata references 都可投影且
  不产生新 collision 时才自动处理。
- **同一 Table 的不同并发 rename**：`table-rename-conflict`；timestamp 不得静默选择
  physical DDL。
- **Record Label 变更**：不同的有效 target 使用 LWW。缺失、Lookup 或属于错误 Table
  的 target 是 `dependency-conflict`。
- **Reorder 或 settings edit**：同 group 差异使用 LWW；独立 groups 组合。
- **单边删除、另一边未改**：只有 cascade effects 与 surviving references 通过验证时
  才自动处理。
- **删除与任何 edit/use 并发**：`delete-update` 或 `dependency-conflict`。

Physical SQLite table 是最终 Table 与 Field aggregates 的投影。合并不得分别选择一个
metadata name 和一个无关 physical table name。

## 7. `eidos__fields` 与 Field Aggregates

### 7.1 Aggregate boundary

一个 Field aggregate 由 `eidos__fields.id` 标识，包含：

- owner `eidos__fields` row；
- 其 type 要求的恰好零或一条 subtype row；
- physical column 或明确不存在 physical column 的状态；
- required Formula rewrite、Relation trigger 与 generated index；
- 可归因于受支持 option operation 的 option-catalog row 与 View rewrite。

Subtype row 不得脱离 owner Field 独立合并。

### 7.2 Atomic groups

| Atomic group   | Columns/effects                                                              | 并发规则                                                        |
| -------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| identity/owner | `id`、`table_id`、`created_at`                                               | immutable；不支持移动 Field                                     |
| name/mapping   | `name`、`physical_name`、physical-column rename、受影响 Formula source       | 相同结果折叠；不同并发 rename 冲突                              |
| shape          | `type`、`system_role`、`nullable`、subtype kind、physical storage/conversion | 相同结果折叠；不兼容并发 conversion 冲突                        |
| definition     | `settings_json` 与语义耦合时的 subtype row                                   | 第 7.3–7.7 节                                                   |
| order          | `position`                                                                   | LWW                                                             |
| clock          | `updated_at`                                                                 | 控制输入排序；merged substantive change 使用 `operationInstant` |

### 7.3 常见 Field 变更

- **Create Field**：只有 metadata、physical storage 与 subtype definition 完整有效时，
  单边创建才自动处理。
- **同 Table 中不同 ID 具有相同 case-insensitive name 或 physical name**：
  `name-collision`。
- **单边 rename**：只有 physical column 与每个受影响 Formula 都能重写并验证时才自动
  处理。
- **不同并发 rename**：`field-rename-conflict`。
- **Reorder**：LWW。
- **Non-Select settings**：Field shape 未改变时，对完整 object 使用 LWW。
- **相同 target type conversion 且 canonical result 相同**：折叠。
- **不同 target type、不同 conversion parameter，或 conversion 与无法证明可无损重放的
  edit 并发**：`field-conversion-conflict`。
- **删除与 edit、row use、label use、View use、Formula use、Relation use 或 Lookup use
  并发**：`delete-update` 或 `dependency-conflict`。

`system_role` 以及 required `_id`、`_created_at`、`_updated_at` Fields 在合并后必须满足
File invariants。它们的 identity 或 role 不得由 LWW 选择。

### 7.4 Select 与 Multi-select catalogs

Option name 是 canonical value，不是 stable option ID。因此：

- 相同 catalog 变更折叠；
- 单边 catalog 变更只有在所有可归因的 source-row 与 View rewrite 都存在且 semantic
  validation 成功时才可以合并；
- 不同并发 option catalog 变更是 `option-catalog-conflict`，除非 Runtime 能证明它们影响
  不相交 option names，并且不会产生合并丢失或 reference ambiguity；
- 对完整 `settings_json` 使用 LWW 不得静默丢弃或凭空制造 cell-value rewrite。

### 7.5 `eidos__relation_fields`

完整 subtype row 是由 owner Field clock 控制的一个 definition group。对 direction、
target Table、cardinality、inverse Field 或 delete policy 的并发编辑，只有 owner Field
shape 未变且胜出 definition 通过所有 forward/inverse、target、cardinality 与 cycle
checks 时才使用 LWW；否则结果是 `dependency-conflict`。

Generated Relation triggers 从胜出 definition 重建，永不作为 canonical conflict。

### 7.6 `eidos__formula_fields`

`source_text` 与 `result_type` 是由 owner Field clock 控制的一个 definition group。
并发 definition 差异使用 LWW；之后胜出的 Formula 必须能够 parse、每个 reference 恰好
解析一次、与 declared type 一致且保持 acyclic。

Field rename 引起的 Formula source rewrite 属于被 rename Field 的 name/mapping
operation。它不能独立覆盖用户 Formula edit。如果两者无法重放成一个有效 source，
结果是 `dependency-conflict` 或 `field-rename-conflict`。

### 7.7 `eidos__lookup_fields`

`relation_field_id`、`target_field_id`、`aggregate` 与 `distinct_values` 是由 owner Field
clock 控制的一个 definition group。只有最终 Relation owner、target Table、target Field、
aggregate/type rules 与 file-wide dependency graph 全部有效时，并发 definition 差异才
使用 LWW；否则结果是 `dependency-conflict`。

## 8. `eidos__views`

一个 View 由 `id` 标识。

| Atomic group   | Columns                        | 并发规则                                                          |
| -------------- | ------------------------------ | ----------------------------------------------------------------- |
| identity/owner | `id`、`table_id`、`created_at` | immutable                                                         |
| name           | `name`                         | LWW，之后进行 case-insensitive per-Table uniqueness validation    |
| query          | `query_json`                   | 对完整 Query document 使用 LWW                                    |
| presentation   | `type`、`layout_json`          | 把完整 presentation definition 作为一个 LWW group                 |
| order          | `position`                     | LWW                                                               |
| clock          | `updated_at`                   | 只用于输入排序；merged substantive change 使用 `operationInstant` |

单边 create、edit、reorder 与 delete 遵循第 4 节。并发 Query edit 与 presentation edit
会组合。属于同一 Table 的不同 ID 具有同一最终 name 时产生 `name-collision`。由于没有
View deletion clock，delete/update 仍是 domain conflict。

胜出 definition 必须按 File Format 保留未知 View type 与未知 JSON member。Runtime 必须
验证 stable Field reference 与 Query meaning；UI profile 可以在 publication 前进一步
验证 standard layout meaning。

## 9. `eidos__features`

一个 Feature 由 `name` 标识。其 `version`、`required` 与 `config_json` 构成一个 atomic
capability declaration。

- 单边 insert、update 或 removal 在 whole-file validation 通过时应用；
- 相同并发 declaration 折叠；
- 同名 Feature 的不同并发 declaration 产生 `feature-conflict`；
- delete/update 产生 `delete-update`；
- 不能仅因为 Boolean one 数值更大就让 `required=1` 胜出；
- 除非未来 Feature-specific contract 明确要求，否则不能按 SemVer 排序 version；
- `config_json` 不能用通用 JSON 规则 deep-merge。

缺少 `updated_at` 正是本表不能使用通用 LWW 的明确证据。

## 10. Physical Schema、Generated State 与 User Data

Runtime 必须从最终 logical Table 与 Field aggregates 派生 candidate physical schema。
以下 candidate 必须拒绝：

- registered Table 或 stored Field 缺少 required physical object；
- physical name 与 canonical metadata 不一致；
- virtual Field 存在禁止的 physical storage；
- type conversion 缺少 required canonical value conversion；
- Table/Field uniqueness、CHECK、foreign-key 或 system-role invariant 失败；
- Formula、Lookup 或 Relation dependency 未解析或成环；
- user-row value 在所选最终 Field shape 下无效。

Generated trigger、index、compiled Formula SQL、dependency cache 与 statistics 必须重建，
不能作为用户冲突。

本 profile 不合并普通 user-row conflict。如果组合 user-row merge 与 system merge，
system analysis 必须先固定 final schema，row merge 必须在该准确 schema 下解释 values，
system finalization 必须验证组合后的 private candidate。如果 system decision 使 pending
row change 有歧义，必须产生 `field-conversion-conflict` 或
`dependency-conflict`，不能静默丢弃 row change。

## 11. Candidate Construction 与 Validation

所有自动决策都必须应用到 private candidate。在全部 required checks 成功前，candidate
不得替换 worktree 或 source。

必须按以下顺序执行：

1. 验证三个 input identity 与 structure；
2. 从 Base 计算 stable-object 与 atomic-group diff；
3. 为不能自动处理的情况产生 domain conflict；
4. 如果存在 conflict，则返回且不构造可 publication 的结果；
5. 把 automatic logical decisions 应用到 private candidate；
6. 重建 required physical schema 与 generated state；
7. 把冻结的 `operationInstant` 应用到每个 substantively changed clocked metadata
   object，并按第 5 节 finalise `eidos__meta`；
8. 运行完整 Eidos File validation；
9. 运行 Eidos Runtime semantic validation；
10. 返回 candidate、automatic-resolution records 与 validation proof。

如果自动决策产生 invalid candidate，Runtime 必须返回 `validation-failed`，并指向范围
最窄的可归因 Eidos objects。它不得退化成 raw `eidos__meta` revision conflict，不得把
invalid candidate 暴露为已解决，也不得修改任何 input snapshot。

## 12. Result 与 Conflict Vocabulary

Analysis 与必要的 finalization 完成后的 logical outcome 是以下之一。实现可以把 analysis
与 finalization 暴露为两个独立 bounded operations，但不能改变这些语义。

```ts
type EidosSystemMergeResult =
  | {
      outcome: "merged"
      candidate: EidosSnapshot
      automaticResolutions: AutomaticResolution[]
      validation: ValidationProof
    }
  | {
      outcome: "conflict"
      conflicts: DomainConflict[]
      automaticResolutions: AutomaticResolution[]
    }
  | {
      outcome: "invalid-input"
      issues: MergeInputIssue[]
    }
  | {
      outcome: "failed"
      code: "clock-not-after-input" | "revision-exhausted"
    }
```

Required domain conflict codes：

| Code                        | 含义                                                       |
| --------------------------- | ---------------------------------------------------------- |
| `identity-collision`        | 相同 stable ID 被独立创建成不相等内容                      |
| `name-collision`            | 不同 stable ID 违反最终 name/physical-name uniqueness      |
| `delete-update`             | 一侧删除了另一侧修改的 object                              |
| `table-rename-conflict`     | 同一 Table 得到不兼容的并发 physical name                  |
| `field-rename-conflict`     | 同一 Field 得到不兼容的并发 name 或 Formula rewrite        |
| `field-conversion-conflict` | 无法证明并发 shape/conversion 或 row replay 安全           |
| `option-catalog-conflict`   | 无法无损组合并发 option 变更                               |
| `dependency-conflict`       | 最终 reference、subtype rule 或 dependency graph 无效      |
| `feature-conflict`          | 同一 Feature 得到不相等的并发 declaration                  |
| `unsupported-schema-change` | 有效 input 使用本 profile 不支持的 structural change       |
| `validation-failed`         | automatic logical result 未通过 File 或 Runtime validation |

Conflict 在可用时必须标出 Eidos object kind 与 stable ID、atomic group、
Base/Ours/Theirs summaries 以及 allowed resolution scope。Primary user-facing text 必须
描述 File、Table、Field、View、Feature 或 dependency meaning。Raw system table name 只能
出现在可展开的技术诊断中。

Automatic `eidos__meta` resolution 不得转换成 conflict badge、conflict count 或 required
review step。

## 13. Host 与 Version-Manager Requirements

组合本 profile 的 Host 必须：

- materialize candidate 前关闭或 quiesce writable Runtime handles；
- 在 merge completion 或 explicit abort 前保留 Base、Ours 与 Theirs；
- 在重试和跨设备时原样传递 stable snapshot keys，并为一个 merge plan 冻结
  Runtime-supplied operation instant；
- 只 publication 带有成功 validation proof 的 candidate；
- 使用 Adapter conditional publication，并把 source-token change 表示成 publication
  conflict，而不是 logical metadata conflict；
- publication 或 remote push 失败时保留 recovery data。

Version manager 可以预先合并 ordinary file 或 user row，但不能只基于通用 SQLite row
conflict selection 就声称完成 system metadata resolution。它可以把 Runtime 的
automatic-resolution 与 domain-conflict records 存入 history，但不能把它们持久化进
`.eidos` 文件。

## 14. Conformance Requirements

`ER-System-Merge-1.0` 实现还必须符合 `EF-Reader-1.0`、`EF-Writer-1.0`、
`ER-Reader-1.0` 与 `ER-Writer-1.0`。

Required vector families：

1. 通用 change matrix 的每一行；
2. `eidos__meta` title/default-Table LWW、revision finalization、shared operation
   instant、immutable mismatch、clock non-advancement 与 overflow；
3. Table create/delete/rename/label/order/settings 与同名 collision；
4. Field create/delete/rename/reorder/settings/type conversion 与 required system Fields；
5. Select/Multi-select catalog rewrite 与 collision/loss case；
6. Relation forward/inverse/cardinality/delete-policy validation；
7. Formula source/type/rename rewrite 与 dependency-cycle validation；
8. Lookup Relation/target/aggregate/distinct 与 dependency validation；
9. View name/type/query/layout/order 与 unknown-member preservation；
10. Feature insert/remove/equal declaration/concurrent declaration；
11. physical DDL reconstruction、generated-object rebuild、user-row/schema incompatibility、
    full File validation 与 semantic validation；
12. 保留 stable side keys 与 operation instant 的 Ours/Theirs role reversal 得到相同
    logical output；
13. object clock 相等时由 side key 决胜；
14. validation 失败保留所有 input snapshot，且不返回 publishable candidate；
15. conflict output 包含 domain identity，且不包含 blocking
    `eidos__meta.revision` conflict。

Conformance 比较 logical canonical state 与 reported records，不得要求 SQLite page layout
逐 byte 相同。

## 15. Security 与 Data-Loss Considerations

Automatic merge 是一种写权限。实现必须使用 Runtime resource limits 限制 snapshot、
diff、JSON、Formula、dependency、conflict 与 validation work，并且必须在 publication 前
遵守 cancellation。

LWW 会丢弃同一 atomic group 中的一项并发值。因此，每个 LWW decision 即使
non-blocking，也要记录用于 audit。以下情况禁止 LWW：schema 缺少可信 object clock、
删除没有 tombstone、不同 stable identity 冲突，或无法证明 physical/data conversion
有效。

Wall clock 可能不正确。如果 merge operation instant 不晚于每个输入 system object
clock，Runtime 必须拒绝而不是回填一个更早时间。Host 可以在 trusted clock 向前推进后
重试，但不得绕过 Runtime ClockPort contract 伪造更晚 timestamp。

Access token、remote credential、local path、host-private recovery token 或
version-manager secret 都不能持久化进 candidate，也不能包含在 conflict summary 中。
