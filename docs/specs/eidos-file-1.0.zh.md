# Eidos File Format 1.0 — 中文参考译本

状态：Final Eidos Standard  
版本：1.0  
发布日期：2026-07-21  
维护者：Eidos Project  
唯一规范语言：English

> 本文是 [Eidos File Format 1.0](./eidos-file-1.0.md) 的中文参考译本。
> 英文文档是唯一 normative text；如 SQL、约束、关键词强度或细节存在差异，以英文为准。

## 摘要

Eidos File 是开放、本地优先的持久格式：一个 `.eidos` 文件就是一个 SQLite 3
主数据库。用户编辑的 stored Field 是真实 SQLite column；正常情况下 physical
table/column name 就是用户名称。稳定 ID 用来跨 rename/reorder 保存身份与引用，
而不是把表列名变成不透明编码。

本规范只定义 bytes、SQLite schema、canonical raw value、持久定义、revision
后置条件与格式有效性。逻辑值、Relation/Formula/Lookup 求值、query/mutation API
由 [Eidos Runtime 1.0](./eidos-runtime-1.0.zh.md) 定义；SQLite driver、文件权限、
Worker/process 与安全发布由 [Eidos Adapter 1.0](./eidos-adapter-1.0.zh.md) 定义；
显示、编辑和 accessibility 由 [Eidos UI 1.0](./eidos-ui-1.0.zh.md) 定义。

## 本文状态

本文是 Final Eidos File Format 1.0 的中文参考译本，也是
[Eidos 1.0 规范套件](./README.zh.md)的 persistence layer。唯一 normative text 是英文
规范；design RFC、implementation source、package API report、产品文档、fixture 与译本
都不能覆盖英文规范。发布只定义 conformance target，不声称现有实现已经 conform。
标为 informative 的 example、note、rationale 与 appendix 不具规范性；其余章节对应英文
规范的 normative contract。

## 1. Conformance

大写 **MUST**、**MUST NOT**、**REQUIRED**、**SHALL**、**SHALL NOT**、
**SHOULD**、**SHOULD NOT**、**RECOMMENDED**、**NOT RECOMMENDED**、**MAY** 与
**OPTIONAL** 仅在大写时按 BCP 14 解释。

格式层只有两个标签：

1. **EF-Reader-1.0**：读取并校验 canonical state，不修改文件；重写时保留未知
   optional extension。
2. **EF-Writer-1.0**：满足 Reader，并以原子事务创建或修改 canonical state，
   每次 commit 后维持全部格式 invariant。

产品必须声明其 conformance labels。File conformance 不自动包含 Runtime、Adapter 或
UI；反之，每个 ER-Reader-1.0/ER-Writer-1.0 都按 Runtime 规范依赖相应的
EF-Reader-1.0/EF-Writer-1.0。本文中的 Reader/Writer 分别是这两个 EF label 的简称。
遇到未知 `required=1`
feature，Reader 必须在返回 canonical data 前拒绝；未知 optional state 必须 lossless
保留，否则 Writer 必须拒绝写。只返回 raw SQLite rows、而不应用 Reference Policy
与格式校验，不是 EF-Reader conformance。

## 2. 术语

核心术语：

- **canonical state**：本规范定义的唯一权威 metadata、definition 与 user raw data。
- **canonical value**：stored Field 唯一权威的序列化值；不能同时维护第二份 raw value。
- **generated state**：可以只由 canonical state 重建的 index、AST、dependency edge、
  compiled plan、reverse edge、label、thumbnail 或 projection；只有本规范明确允许时，
  它才能出现在 SQLite file 内。
- **Host-private state**：published `.eidos` 主数据库之外的状态，归 Adapter 管理，
  不属于本格式。
- **UI state**：focus、selection、scroll、draft、placeholder 等交互状态；saved View
  definition 是 canonical，当前 View 不是。
- **stored Field**：由 user table 真实 column 保存的 source Field。
- **virtual Field**：Formula、Lookup 或 inverse Relation definition，没有 canonical
  result column。
- **display name**：面向用户的 Table/Field name。
- **physical name**：quoted SQLite table/column name。
- **Record Label Field**：Table 持久保存的唯一默认 row-label source Field ID；
  求值归 Runtime。
- **forward Relation**：raw value 是有序 target Row-ID list 的 stored Field。
- **inverse Relation**：只引用一个 forward Relation、没有 mirror column 的 definition。
- **Formula source**：用 quoted Field name 编写的人类可读持久表达式。
- **Lookup definition**：持久保存 Relation Field ID、target Field ID 与 aggregate options。
- **unresolved Relation**：stored target Row ID 所指 target row 不存在。

`NULL`、空 string、0、false 和空 list 彼此不同。

## 3. 固定原则

1. `.eidos` 内的 canonical state 是唯一权威状态；UI model、generated index 与
   cache 不是。
2. source field 必须是真实 SQLite column。
3. 物理表名和列名默认等于用户 display name。
4. Table/Field/Row/View 继续使用稳定 UUIDv7，但 ID 不参与正常物理命名。
5. 每行的唯一 Eidos 身份是 UUIDv7 `_id`；SQLite hidden `rowid` 不是 Row identity。
6. 每张 Table 恰好一个 Record Label Field，但不要求固定 `Title` 或 `Name` Field。
7. Single Select 直接存 option name TEXT。
8. Multi-select 直接存 option name JSON array，不存在 Option ID 或独立 Option 表。
9. forward Relation 是真实 Row-ID JSON column；inverse Relation definition 不保存
   mirror。
10. Formula、Lookup 与 inverse Relation definition 是 canonical；AST、DAG、compiled
    SQL 和 result 都是 generated state，不能物化成第二份 canonical column。
11. 多值 reverse index 是可重建 generated state，source column 永远优先。
12. 每个改变 canonical state 的 transaction 必须 atomic；真正 no-op 不改 revision。
13. 第三方无需 Eidos application code，仅凭本规范可以恢复 persisted meaning，并凭完整
    规范套件恢复 logical meaning。
14. canonical、generated、Host-private 与 UI state 不能相互静默替代。

## 4. 文件身份

Eidos File 必须是以 `SQLite format 3\0` 开头、编码为 UTF-8 的 SQLite 3 数据库。
EF-Reader 与 EF-Writer 必须使用 SQLite 3.45.0+，或对本规范全部 schema、SQL、JSON、
date/time 与 transaction operation 提供 observably equivalent behavior 的实现。
每个连接必须启用：

```sql
PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;
```

身份常量为：

```text
extension:       .eidos
media type:      application/vnd.eidos+sqlite3
application ID:  0x45494453 (ASCII EIDS)
schema revision: 1
format version:  1.0
```

```sql
PRAGMA application_id = 1162429523;
PRAGMA user_version = 1;
```

Reader 必须校验 SQLite header、application ID、user version 与 singleton
`eidos__meta` row；只有扩展名不足以识别 Eidos File。

WAL、rollback journal、shared-memory、lock 与 recovery copy 都不是格式成员。交换或
发布的 Eidos File 只有一个 self-contained SQLite 主数据库；quiesce、checkpoint 与
publication 机制由 Adapter 规范定义。

## 5. ID、时间与 JSON

### 5.1 UUID

所有持久 ID 都是 RFC 9562 UUIDv7。SQLite、API、JSON 与 CSV 使用完全相同的小写、
带连字符、36-octet TEXT：

```text
0198c0f4-7b10-7e2e-8bc9-f28a3e11a621
```

准确 shape 是 `xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx`，其中 `x` 是小写 hex，`y` 是
`8/9/a/b`。uppercase、braced、URN、32-character unhyphenated 和 BLOB 都不是
canonical Eidos File ID。ID column 使用 `TEXT COLLATE BINARY`。

case 与 hyphen position 固定，因此 TEXT bytewise order 与 RFC UUID unsigned byte order
相同，UUIDv7 仍有 timestamp-prefix locality。同一毫秒生成多个 ID 时 Writer 应使用
monotonic UUIDv7 method。rename/reorder 不改变 ID。

File/Table/Field/Row/View ID 一旦 commit 就不可原地修改；重新赋 ID 表示删除旧 identity
并创建新 identity。赋予新 File ID 的 clone/fork 创建的是新 File identity，不能原地修改
`eidos__meta.file_id`。

格式只保留这一种持久表示：第三方可以直接查看、复制、校验、bind 和 join，不需要处理
byte order 或 BLOB conversion。implementation 可以在 memory/private cache 派生 binary UUID，但
不能持久化为第二份 canonical ID。SQL/JSON validator 必须按 UTF-8 bytes 测量 36
octets、拒绝 U+0000、确认删除四个固定 hyphen 后恰好 32 个 hex digits，并完整校验
lowercase、version 与 variant；SQLite `length(TEXT)` 遇 U+0000 会提前停止，不能单独使用。

### 5.2 Time and date

date 直接存精确 `YYYY-MM-DD` TEXT，不带时间或时区。instant（包括 `datetime`）直接
存下列精确的 24-octet UTC TEXT：

```text
YYYY-MM-DDTHH:MM:SS.sssZ
```

它是 RFC 3339 的 UTC、毫秒精度、固定长度子集，year 为 `0001..9999`，不接受
leap-second spelling。

EF-Writer 只接受和 commit 上述 canonical date/instant spelling。offset input、precision
conversion、rounding/carry、confirmation 与 preflight report 都是 Runtime conversion
contract；格式层不定义 non-canonical Writer input，也不允许隐式精度损失。Runtime 与
CSV binding 输出同一 canonical string，不输出 epoch integer。

canonical value 使用 SQLite 默认 `BINARY` collation。因为 date/instant 都是 normalized
fixed-width string，bytewise order 就是 chronological order，普通 SQLite index 可以直接
支持 filter、sort 和 range query，不需要对列调用转换函数。SQLite date/time functions
也能直接读取这些值。duration-heavy workload 可以使用 Host-private generated numeric
projection 或 expression index，但它必须位于 published SQLite main database 之外，
只是 cache，不能成为第二份 canonical value。

### 5.3 JSON

JSON 必须符合 RFC 8259 与 I-JSON constraints：object key 唯一、Unicode 有效、number
兼容 binary64；更大的 integer 与 exact decimal 使用 string。canonical JSON 使用
RFC 8785 JCS：object key 排序、array 保序、无无意义空白；string 不做 Unicode
normalization。

## 6. Reference Policy、用户名称与物理名称

### 6.1 General rule

三种引用只有以下用途：

| 引用            | 必须用于                                                                     | 禁止用于                                               |
| --------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| stable ID       | metadata FK、API、View/query、Relation raw value、Lookup、DAG、cursor、merge | 拼成不透明 SQLite object name                          |
| display `name`  | UI、Formula source、CSV display header                                       | 所属名称空间之外的持久结构引用                         |
| `physical_name` | 当前文件内经过双引号引用的 DDL/SQL                                           | API identity、Relation、Formula source、merge identity |

Table/Field/Row/View/File ID 在 rename 时均不变。Formula 是唯一用 display Field name
保存 canonical 结构引用的地方；Field rename 必须对其 AST reference nodes 原子改写。
其他 canonical structural references 全部使用 stable ID。执行 SQL 前先由 ID 查当前
`physical_name`，再正确 quote。

`eidos__tables.name` / `eidos__fields.name` 是 display name，`physical_name` 是真正
SQLite identifier。Writer 必须 quote identifier。
规则精确为：外层加 `"`，名称内每个 `"` 写成 `""`。value 必须 parameter bind，不能
当 identifier quote。

同一 File 内 Table name 必须按 SQLite `NOCASE` 唯一。同一 Table 内 Field name 也必须
按该规则唯一；三个 system Field 在这个 namespace 中占用 `_id`、`_created_at`、
`_updated_at`。不同 Tables 可以拥有同名 Fields。View name 按第 13 节在所属 Table 内
唯一。

SQLite `NOCASE` 只折叠 ASCII A–Z。1.0 对 identifier collision 使用这一可移植规则；
非 ASCII 按 UTF-8 code units 比较，不做 NFC/NFKC、locale case conversion 或转写。
Writer 必须保留用户输入的 Unicode spelling。

每个 Table 与 stored Field 的 canonical mapping 必须严格为：

```text
physical_name = display name
```

这里要求 byte-for-byte BINARY 相等。Formula、Lookup 与 inverse Relation Field 没有
stored column，因此 `physical_name = NULL`。中文、空格、标点、SQL keyword 与 `x__`
前缀都可以被 SQLite quote，不能因此修改名称。

### 6.2 名称有效性与冲突

Table、Field 与 View name 必须包含 1–1,024 UTF-8 bytes，只包含 Unicode scalar value，
且不含 U+0000。Table name 按 ASCII case-insensitive 比较时不得以 `sqlite_` 或
`eidos__` 开头；`sqlite_` namespace 属于 SQLite，`eidos__` 属于本格式。

Writer 必须在执行 DDL 前拒绝 invalid、reserved 或 `NOCASE` duplicate name，不得截断、
decorate、追加 suffix、转写或映射为另一 persistent identifier。rename conflict 检查
不包括被重命名对象本身。

```text
display name       physical name
Tasks              Tasks
项目               项目
Project Status     Project Status
Order              Order
Status             Status
x__vendor__Tasks    x__vendor__Tasks
```

Field ID 继续用于 Field/Formula identity、Lookup、inverse Relation、View、rename
detection、dependency diagnostics 和 logical diff，但不再是 column name，也不写入
Formula source。

### 6.3 Rename

rename 在同一事务中把 `name` 与 `physical_name` 更新为同一个新名称，并通过
`ALTER TABLE RENAME` 或 `ALTER TABLE RENAME COLUMN` 修改真实物理对象。仅改变 ASCII
case 的 Table rename 必须在同一事务中经过一个未占用的 transient internal identifier；
该 identifier 永远不是 canonical state。Field ID 不变；Formula source 是唯一
name-based exception，其 AST
rewrite 属于 Runtime operation。stored-Field rename 所在 Table 存在 Formula 时，EF-only
Writer 必须委托 ER-Writer 或拒绝，不能做文本替换。Table rename 本身不改变同表 Formula
Field name，不需要 Formula rewrite。
Writer 必须设置 `legacy_alter_table=OFF`、启用 foreign keys，并在 structural rename 后
从 metadata 重建 Relation triggers；任何 parse、ambiguity 或 dependency 失败都整笔
rollback。

## 7. Canonical metadata schema

`eidos__meta` 是 typed singleton，不是 key/value bag。名称 `meta` 是规范性的：这一行
描述整个格式与文件；`manifest` 会错误暗示对象清单，`file` 则会掩盖这些值是 metadata。
typed row 让 SQLite 与第三方工具可以直接发现 columns、foreign keys 与 constraints。
Writer 不得在此表放任意 application preferences。

以下是 Eidos File Format 1.0 创建事务中完整的 metadata DDL。它与后面的 singleton
continuation 已用 SQLite 3.53.1 原样执行，并且只使用最低 SQLite 3.45 已有的行为；
第 5 节和第 18 节的 Writer/validator 要求仍然是规范性约束。

```sql
PRAGMA encoding = 'UTF-8';
PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;

BEGIN IMMEDIATE;

PRAGMA application_id = 1162429523;
PRAGMA user_version = 1;

CREATE TABLE eidos__tables(
  id TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(id AS BLOB))=36 AND instr(id,char(0))=0
      AND substr(id,9,1)='-' AND substr(id,14,1)='-'
      AND substr(id,15,1)='7' AND substr(id,19,1)='-'
      AND substr(id,20,1) IN ('8','9','a','b') AND substr(id,24,1)='-'
      AND lower(id)=id AND length(CAST(replace(id,'-','') AS BLOB))=32
      AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 1024
      AND instr(name,char(0))=0
      AND lower(substr(name,1,7)) NOT IN ('sqlite_','eidos__')),
  physical_name TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK(length(CAST(physical_name AS BLOB)) BETWEEN 1 AND 1024
      AND instr(physical_name,char(0))=0
      AND physical_name COLLATE BINARY = name COLLATE BINARY),
  label_field_id TEXT NOT NULL COLLATE BINARY,
  position INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(settings_json) AND json_type(settings_json)='object'),
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0)),
  FOREIGN KEY(label_field_id) REFERENCES eidos__fields(id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__fields(
  id TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(id AS BLOB))=36 AND instr(id,char(0))=0
      AND substr(id,9,1)='-' AND substr(id,14,1)='-'
      AND substr(id,15,1)='7' AND substr(id,19,1)='-'
      AND substr(id,20,1) IN ('8','9','a','b') AND substr(id,24,1)='-'
      AND lower(id)=id AND length(CAST(replace(id,'-','') AS BLOB))=32
      AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  table_id TEXT NOT NULL COLLATE BINARY
    REFERENCES eidos__tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 1024 AND instr(name,char(0))=0),
  physical_name TEXT COLLATE NOCASE
    CHECK(physical_name IS NULL OR
      (length(CAST(physical_name AS BLOB)) BETWEEN 1 AND 1024
       AND instr(physical_name,char(0))=0
       AND physical_name COLLATE BINARY = name COLLATE BINARY)),
  type TEXT NOT NULL CHECK(type IN (
    'text','number','integer','checkbox','date','datetime','url',
    'select','multi-select','file','relation','formula','lookup'
  )),
  system_role TEXT CHECK(system_role IN ('row-id','created-time','updated-time')),
  nullable INTEGER NOT NULL DEFAULT 1 CHECK(nullable IN (0,1)),
  position INTEGER NOT NULL DEFAULT 0,
  settings_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(settings_json) AND json_type(settings_json)='object'),
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0)),
  UNIQUE(table_id,name COLLATE NOCASE),
  UNIQUE(table_id,physical_name COLLATE NOCASE),
  CHECK(physical_name IS NOT NULL OR type IN ('relation','formula','lookup')),
  CHECK(system_role IS NULL OR
    (system_role='row-id' AND type='text' AND physical_name='_id' AND nullable=0) OR
    (system_role='created-time' AND type='datetime'
      AND physical_name='_created_at' AND nullable=0) OR
    (system_role='updated-time' AND type='datetime'
      AND physical_name='_updated_at' AND nullable=0))
) STRICT, WITHOUT ROWID;

CREATE UNIQUE INDEX eidos__fields_one_system_role
  ON eidos__fields(table_id,system_role) WHERE system_role IS NOT NULL;

CREATE TABLE eidos__meta(
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  format_major INTEGER NOT NULL CHECK(format_major=1),
  format_minor INTEGER NOT NULL CHECK(format_minor=0),
  file_id TEXT NOT NULL UNIQUE COLLATE BINARY
    CHECK(length(CAST(file_id AS BLOB))=36 AND instr(file_id,char(0))=0
      AND substr(file_id,9,1)='-' AND substr(file_id,14,1)='-'
      AND substr(file_id,15,1)='7' AND substr(file_id,19,1)='-'
      AND substr(file_id,20,1) IN ('8','9','a','b') AND substr(file_id,24,1)='-'
      AND lower(file_id)=file_id
      AND length(CAST(replace(file_id,'-','') AS BLOB))=32
      AND replace(file_id,'-','') NOT GLOB '*[^0-9a-f]*'),
  title TEXT NOT NULL
    CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 1024 AND instr(title,char(0))=0),
  default_table_id TEXT COLLATE BINARY
    REFERENCES eidos__tables(id) DEFERRABLE INITIALLY DEFERRED,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0))
) STRICT, WITHOUT ROWID;

CREATE TRIGGER eidos__meta_no_delete BEFORE DELETE ON eidos__meta
BEGIN SELECT RAISE(ABORT,'eidos_meta_required'); END;

CREATE TRIGGER eidos__meta_no_key_update BEFORE UPDATE OF singleton ON eidos__meta
BEGIN SELECT RAISE(ABORT,'eidos_meta_singleton'); END;

CREATE TABLE eidos__features(
  name TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 255 AND instr(name,char(0))=0),
  version TEXT NOT NULL
    CHECK(length(CAST(version AS BLOB)) BETWEEN 1 AND 64 AND instr(version,char(0))=0),
  required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
  config_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(config_json) AND json_type(config_json)='object')
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__relation_fields(
  field_id TEXT PRIMARY KEY COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK(direction IN ('forward','inverse')),
  target_table_id TEXT NOT NULL COLLATE BINARY REFERENCES eidos__tables(id),
  cardinality TEXT NOT NULL CHECK(cardinality IN ('one','many')),
  inverse_of_field_id TEXT COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE RESTRICT,
  on_delete TEXT DEFAULT 'restrict'
    CHECK(on_delete IN ('restrict','detach','preserve')),
  CHECK((direction='forward' AND inverse_of_field_id IS NULL AND on_delete IS NOT NULL)
     OR (direction='inverse' AND inverse_of_field_id IS NOT NULL
         AND cardinality='many' AND on_delete IS NULL))
) STRICT, WITHOUT ROWID;

CREATE UNIQUE INDEX eidos__relation_one_inverse
  ON eidos__relation_fields(inverse_of_field_id)
  WHERE inverse_of_field_id IS NOT NULL;

CREATE TABLE eidos__formula_fields(
  field_id TEXT PRIMARY KEY COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE CASCADE,
  source_text TEXT NOT NULL
    CHECK(length(CAST(source_text AS BLOB)) BETWEEN 1 AND 4096),
  result_type TEXT NOT NULL
    CHECK(result_type IN ('text','number','integer','checkbox','date','datetime','url'))
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__lookup_fields(
  field_id TEXT PRIMARY KEY COLLATE BINARY
    REFERENCES eidos__fields(id) ON DELETE CASCADE,
  relation_field_id TEXT NOT NULL COLLATE BINARY REFERENCES eidos__fields(id),
  target_field_id TEXT NOT NULL COLLATE BINARY REFERENCES eidos__fields(id),
  aggregate TEXT NOT NULL
    CHECK(aggregate IN ('values','first','count','sum','average','min','max')),
  distinct_values INTEGER NOT NULL DEFAULT 0 CHECK(distinct_values IN (0,1))
) STRICT, WITHOUT ROWID;

CREATE TABLE eidos__views(
  id TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST(id AS BLOB))=36 AND instr(id,char(0))=0
      AND substr(id,9,1)='-' AND substr(id,14,1)='-'
      AND substr(id,15,1)='7' AND substr(id,19,1)='-'
      AND substr(id,20,1) IN ('8','9','a','b') AND substr(id,24,1)='-'
      AND lower(id)=id AND length(CAST(replace(id,'-','') AS BLOB))=32
      AND replace(id,'-','') NOT GLOB '*[^0-9a-f]*'),
  table_id TEXT NOT NULL COLLATE BINARY
    REFERENCES eidos__tables(id) ON DELETE CASCADE,
  name TEXT NOT NULL
    CHECK(length(CAST(name AS BLOB)) BETWEEN 1 AND 1024 AND instr(name,char(0))=0),
  type TEXT NOT NULL
    CHECK(length(CAST(type AS BLOB)) BETWEEN 1 AND 64 AND instr(type,char(0))=0),
  query_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(query_json) AND json_type(query_json)='object'),
  layout_json TEXT NOT NULL DEFAULT '{}'
    CHECK(json_valid(layout_json) AND json_type(layout_json)='object'),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
    CHECK(length(CAST(created_at AS BLOB))=24
      AND created_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(created_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',created_at,'+0 seconds')=created_at,0)),
  updated_at TEXT NOT NULL
    CHECK(length(CAST(updated_at AS BLOB))=24
      AND updated_at GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr(updated_at,1,4)<>'0000'
      AND coalesce(
        strftime('%Y-%m-%dT%H:%M:%fZ',updated_at,'+0 seconds')=updated_at,0)),
  UNIQUE(table_id,name COLLATE NOCASE)
) STRICT, WITHOUT ROWID;
```

在仍未 commit 的创建事务中，Writer 必须插入唯一 meta row，且
`(singleton,format_major,format_minor)=(1,1,0)`。有效文件始终必须包含该 row；因此
application ID、user version、schema 与 singleton 要么一起 commit，要么一起 rollback。
Table → label Field 与 Field → Table 的循环引用刻意采用 deferred constraints，使 Table
与其 required Fields 可以原子创建。

可执行的空文件 continuation 是：

```sql
INSERT INTO eidos__meta(
  singleton,format_major,format_minor,file_id,title,revision,created_at,updated_at
) VALUES(
  1,1,0,'01890f43-5c7e-7000-8000-000000000001','Untitled',0,
  '2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'
);
COMMIT;
```

`settings_json`、`config_json`、`query_json` 与 `layout_json` 即使有 SQLite
`json_valid` guard，也仍必须是 JCS object。关键 identity/dependency 数据经过
normalized；presentation settings 与 option catalog 是 canonical metadata，但绝不复制
cell value。Table、Field 与 View 按 `(position,id COLLATE BINARY)` 排序；position 可以
重复，ID 是 deterministic tiebreaker。Writer 可以原子 renumber position，而不改变
identity 或 value semantics。

Option value、Multi-select value 与 forward Relation value 都只存在于 user table 的
真实 columns。canonical schema 没有 global edge-value table；
`eidos__relation_fields` 只定义 endpoint 与 policy，不复制 cell value。

## 8. User table 与 Field type

下例展示人类可读 shape，并保留完整 UUID/date guard（所有 identifier 均正确双引号
引用）；其他 stored Field CHECK 与 trigger 必须采用本规范第 8、10 节模板：

```sql
CREATE TABLE "项目 表"(
  "_id" TEXT PRIMARY KEY COLLATE BINARY
    CHECK(length(CAST("_id" AS BLOB))=36 AND instr("_id",char(0))=0
      AND substr("_id",9,1)='-'
      AND substr("_id",14,1)='-' AND substr("_id",15,1)='7'
      AND substr("_id",19,1)='-' AND substr("_id",20,1) IN ('8','9','a','b')
      AND substr("_id",24,1)='-' AND lower("_id")="_id"
      AND length(CAST(replace("_id",'-','') AS BLOB))=32
      AND replace("_id",'-','') NOT GLOB '*[^0-9a-f]*'),
  "_created_at" TEXT NOT NULL
    CHECK(length(CAST("_created_at" AS BLOB))=24
      AND "_created_at" GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr("_created_at",1,4)<>'0000'
      AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ',
        "_created_at",'+0 seconds')="_created_at",0)),
  "_updated_at" TEXT NOT NULL
    CHECK(length(CAST("_updated_at" AS BLOB))=24
      AND "_updated_at" GLOB
        '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
      AND substr("_updated_at",1,4)<>'0000'
      AND coalesce(strftime('%Y-%m-%dT%H:%M:%fZ',
        "_updated_at",'+0 seconds')="_updated_at",0)),
  "名称" TEXT NOT NULL,
  "评分" INTEGER,
  "标签" TEXT NOT NULL DEFAULT '[]'
    CHECK(json_valid("标签") AND json_type("标签")='array')
) STRICT, WITHOUT ROWID;

CREATE TRIGGER eidos__row_id_immutable__01890f435c7e70008000000000000010
BEFORE UPDATE OF "_id" ON "项目 表"
WHEN NEW."_id" IS NOT OLD."_id"
BEGIN SELECT RAISE(ABORT,'EIDOS_ROW_ID_IMMUTABLE'); END;
```

每张表注册一个 `row-id`、一个 `created-time` 和一个 `updated-time` system role，
分别映射 `_id`、`_created_at`、`_updated_at`；它们的基础 type 仍是 text/datetime。
`_id` value change 必须由
`eidos__row_id_immutable__<table-id-hex>` trigger 拒绝并报告
`EIDOS_ROW_ID_IMMUTABLE`；赋同一值是 no-op。格式不要求固定 `Title`、`Name` 或其他
用户 Field。

| Field              | 物理存储        | canonical raw value 或 definition   |
| ------------------ | --------------- | ----------------------------------- |
| `text`             | named TEXT      | string/NULL                         |
| `number`           | named REAL      | finite binary64/NULL                |
| `integer`          | named INTEGER   | int64/NULL                          |
| `checkbox`         | named INTEGER   | false/true/NULL                     |
| `date`             | named TEXT      | canonical `YYYY-MM-DD`/NULL         |
| `datetime`         | named TEXT      | canonical UTC instant/NULL          |
| `url`              | named TEXT      | URI-reference/NULL                  |
| `file`             | named JSON TEXT | ordered file list                   |
| `select`           | named TEXT      | option name/NULL                    |
| `multi-select`     | named JSON TEXT | option-name list                    |
| forward `relation` | named JSON TEXT | Row-ID list                         |
| inverse `relation` | 无列            | `eidos__relation_fields` definition |
| `formula`          | 无列            | `eidos__formula_fields` definition  |
| `lookup`           | 无列            | `eidos__lookup_fields` definition   |

本表只定义 File storage。mutation、filter、sort、group、search、whole-cell
aggregate、semantic summary、Formula/Lookup、Record Label、CSV 与 UI/Adapter
ownership 的唯一规范性跨层总览，是 Eidos Runtime 1.0 第 5.2 节 Field capability
matrix。`.eidos` matrix 样本或文档中的 rendered embed 只是说明性材料，MUST NOT
替代任一规范性表格。

`created-time`、`updated-time`、所有 metadata `created_at`/`updated_at` 以及 user
table `_created_at`/`_updated_at` 都使用 canonical instant TEXT。portable Writer 使用
`strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`；实现也可以从 Runtime Clock port bind 等价的
canonical value。

stored Field 与 forward Relation 的 `physical_name` 必须非 NULL。Formula、Lookup、
inverse Relation 的 `physical_name` 必须为 NULL。

structural validator 必须双向执行以下完整、互斥的 subtype matrix：

| `eidos__fields` kind     | Required auxiliary row                           | Forbidden auxiliary rows  |
| ------------------------ | ------------------------------------------------ | ------------------------- |
| stored non-Relation type | none                                             | Relation, Formula, Lookup |
| forward `relation`       | exactly one forward `eidos__relation_fields` row | Formula, Lookup           |
| inverse `relation`       | exactly one inverse `eidos__relation_fields` row | Formula, Lookup           |
| `formula`                | exactly one `eidos__formula_fields` row          | Relation, Lookup          |
| `lookup`                 | exactly one `eidos__lookup_fields` row           | Relation, Formula         |

因此每个 auxiliary `field_id` 都必须标识匹配的 Field type；unreferenced、mismatched、
额外或缺失 auxiliary row 都是 structural error。forward/inverse direction 决定上述
physical-name rule。删除带 inverse 的 forward Relation 前，必须先删除或 retarget
inverse Field；删除 definition row 不会授权留下没有 required definition 的
`type='relation'` Field。

准确的 STRICT declarations 是：

```text
text, select, url,
date, datetime             -> TEXT
number                     -> REAL
integer                    -> INTEGER
checkbox                   -> INTEGER CHECK(value IS NULL OR value IN (0, 1))
file, multi-select,
forward relation           -> TEXT NOT NULL DEFAULT '[]' with JSON-array CHECK
```

stored scalar Field 的 `nullable=0` 必须对应 physical `NOT NULL`，`nullable=1`
必须对应省略 `NOT NULL`，不能用额外 constraint 静默缩小 raw domain。File、
Multi-select、forward/inverse Relation 固定 `nullable=0`；Formula/Lookup 在 core 1.0
固定 `nullable=1`，因为 EF 不能证明 derived result non-NULL；三个 system roles 固定为 0。

checkbox 只允许 `0/1/NULL`；number 不允许 NaN/Infinity，写入前把 negative zero
normalize 为 positive zero；integer 使用完整 signed
SQLite int64；lossless public binding 由 Runtime 定义。`rating` 不是基础 Field
type，而是 Integer 的纯 display setting：

```json
{ "display": { "kind": "rating", "max": 5, "min": 0 } }
```

display bounds 不能缩小 Integer raw domain，也不能使已有 int64 失效。URL 保存用户的
RFC 3986 URI-reference，不在写入时 resolve、fetch 或 normalize。

image URL 同样不是 Field type。URL Field 可以声明
`{ "display": { "kind": "image" } }` presentation setting，表示支持图片的 UI
surface 可以为 eligible absolute `https:` value 请求 Host-authorized thumbnail。
该 setting 不改变 URL raw domain、不授予 network authority、不创建 File entry，也不把
remote bytes 加入 canonical File state；`display` 的 unknown member 与其他 Field setting
一样保留。

date 与 datetime column 还必须执行下列 template，或由 Writer 提供等价校验；其中
`<column>` 替换为正确 quoted 的 physical column name：

```sql
-- date
CHECK (
  <column> IS NULL OR (
    length(CAST(<column> AS BLOB)) = 10
    AND <column> GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND substr(<column>, 1, 4) <> '0000'
    AND coalesce(strftime('%Y-%m-%d', <column>, '+0 days') = <column>, 0)
  )
)

-- datetime / instant
CHECK (
  <column> IS NULL OR (
    length(CAST(<column> AS BLOB)) = 24
    AND <column> GLOB
      '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
    AND substr(<column>, 1, 4) <> '0000'
    AND coalesce(
      strftime('%Y-%m-%dT%H:%M:%fZ', <column>, '+0 seconds') = <column>,
      0
    )
  )
)
```

Reader 不能把其他 SQLite 支持的 date/time spelling 当成合法 Eidos File value。

### 8.1 User-table organization

User table 必须是 STRICT。EF-Reader 与 EF-Writer 必须同时支持普通 SQLite rowid
table 和 `WITHOUT ROWID` table。新建 table 应默认 `STRICT, WITHOUT ROWID`，因为 UUID
TEXT 已是真正 primary key，可避免第二个 hidden integer key 和重复 B-tree；Writer 必须
保留已有组织方式，除非执行明确、原子的 table optimization。

无论采用哪种组织，UUIDv7 `_id` 都是唯一 Eidos Row identity。hidden SQLite `rowid`、
`oid`、`_rowid_` 只是物理实现：不能进入 API、Relation、cursor、merge 或 metadata，
也不能假定它在 `VACUUM` 或 table rebuild 后保持不变。第 7 节的 metadata tables 使用
该节 DDL 声明的 exact organization。

### 8.2 Record Label Field

每张 Table 的 `eidos__tables.label_field_id` 在每个有效 revision 必须引用本 Table
恰好一个 Record Label Field；它不是固定 `Title/Name`，也不放进 `settings_json`。

Record Label Field 可以是以下 primitive scalar：

```text
text number integer checkbox date datetime url select
```

stored Field 可以按上述类型成为 Record Label。Formula 只有在持久 `result_type` 属于
上述 scalar 时才可以。core 1.0 的 Lookup 不能成为 Record Label，因为其 exact
scalar/list result shape 没有持久化到 `eidos__lookup_fields`；未来 required feature 只有
在持久声明 exact scalar result 后才能放宽。Relation、inverse Relation、Multi-select、
File 与 list value 不能成为 Record Label。低层 Writer 可以选择 `_id`；产品可以
默认创建普通 `Name` text Field，但名称和该 Field 的存在都不是格式要求。

同一 Table 的所有引用观察同一个 Record Label Field ID。View 不能改变 table-level
role。切换或删除当前 Record Label 必须在
同一事务选择合法 replacement；deferred reference 可在事务中暂时未解析，commit 前
必须恢复恰好一个。
Field value 或 virtual definition 是 canonical；解析和格式化后的 label 是 generated
state，具体求值与 placeholder 分别归 Runtime、UI。

### 8.3 File values

File value 是有序的 canonical JSON array：

```json
[
  {
    "id": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45e",
    "mediaType": "image/png",
    "name": "diagram.png",
    "size": "18234",
    "uri": "assets/diagram.png"
  }
]
```

每个 object 必须有 UUIDv7 `id`、非空 `name`、RFC 6838 `mediaType`、`uri`，以及唯一
表示为 non-negative int64 canonical decimal string 的 `size`。size string 只能是
`"0"`，或从 `1..9` 开始后接零个或多个 ASCII digits，数值最多
`9223372036854775807`；JSON number 不合法。未知 object member 必须保留。这五个必需
member 是 metadata 加一个资源引用，不会在 SQLite 中建立 attachment object store。

core 1.0 的 File-entry URI 只允许以下三类：

1. `assets/diagram.png` 这样的 relative URI-reference；
2. absolute `https:` URI；
3. canonical inline image Data URL。

relative reference 使用 `/`，没有 scheme/authority，以 `.eidos` 所在目录为基准；经过
percent-decode 和 dot-segment removal 后也不能是 absolute 或越出该目录。Reader/Writer
不得把它改为相对 process working directory、application origin、web-page base URL 或
另一份 File 解析。`.eidos` 与 relative assets 一起移动时 reference 保持有效；只移动
`.eidos` 可能使资源 unresolved，但不会让 canonical value 本身失效。

inline image URI 的 exact form 是：

```text
data:<mediaType>;base64,<payload>
```

例如，以下 entry 自包含一个 68-octet PNG，不存在 separate asset：

```json
{
  "id": "0198c6b9-c9a3-7cb9-82d0-dfb39d51c45f",
  "mediaType": "image/png",
  "name": "dot.png",
  "size": "68",
  "uri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
}
```

scheme 与 `base64` marker 为 lowercase。`<mediaType>` 是与 entry `mediaType` member
完全相同的 ASCII-lowercase `image/*` type，不允许 Data-URL media-type parameter。
`<payload>` 使用 standard alphabet 的 canonical padded RFC 4648 Base64，不能有 whitespace
或 non-alphabet character。decode 后长度必须等于 decimal `size`，至少一个 octet，最多
1,048,576 octets；完整 JSON cell 仍受第 19 节 16 MiB limit 约束。`image/svg+xml` 可以
作为 stored data，但不授权 unsandboxed inline rendering。

relative/`https:` entry 的 referenced bytes 在 SQLite 外，不能再复制到 SQLite BLOB、
hidden attachment table 或第二份 canonical value。Data URL 是刻意收窄的唯一例外：
decoded image bytes 只在 canonical `uri` string 中嵌入一次，也不能在 File 内另存副本。
存在性、授权、上传、下载、解析、preview generation 与 external-asset garbage collection
归 Adapter；rendering 归 UI。
对于 `https:` entry，`name`、`mediaType` 与 `size` 描述 Host 在 acquisition 时验证的
bytes。之后 remote resource 发生变化或不可用会使 resolution unavailable/conflicting，
但不授权静默重写 canonical entry。

### 8.4 Stored type change

格式层只定义 type change commit 后的状态，不定义用户操作策略。commit 后 Field ID
保持不变，metadata type、physical column declaration 与全部 non-NULL raw cells 必须符合
destination encoding；table organization 默认保持，全部 dependency 有效，revision
只增加一次。

完整 conversion matrix、M/V/R/L/X 分类、preflight report、lossless/lossy algorithm、
confirmation token、dependency revalidation 与 public error 只由 Runtime 规范定义。
低层 EF-Writer 不能把 SQLite affinity 或宽松 `CAST` 宣称为 Eidos conversion；
它只能在一个 transaction 中验证 destination raw state，并且不能产生第二份 canonical
column。

## 9. Select 与 Multi-select

Option name 就是 raw value，没有 Option ID。

Single Select：

```text
In Progress
```

Multi-select：

```json
["Backend", "Urgent"]
```

展示 catalog 放在 Field `settings_json`：

```json
{
  "defaultOption": "Todo",
  "options": [
    { "color": "gray", "name": "Todo" },
    { "color": "blue", "name": "In Progress" },
    { "color": "green", "name": "Done" }
  ]
}
```

对 Select/Multi-select Field，core 1.0 只在 `options` 是 JSON object 数组时识别它。
每个 entry 必须有 string `name`，可以有 string `color`；其他成员属于 presentation
data，经过 JCS parse/serialize 必须保留。数组顺序就是 presentation order。`name` 是
任意有效 Select value（包括 empty string），同一 catalog 中必须按 exact Unicode
string unique。`color` 与额外成员没有 raw-value 或 identity 语义；不认识它们的 UI
使用 fallback decoration。其他 Field type 上的 `options` 只是未知但需保留的 settings
data，不是 option catalog。

Select Field 还可以包含 string member `defaultOption`。若存在，它必须按 exact
Unicode string 等于同一 Field `options` array 中某一 entry 的 `name`。core 1.0
禁止在 Multi-select 上使用 `defaultOption`；在其他 Field type 上，它只是没有
default semantics 的 unknown preserved settings data。缺少该 member 表示未声明
Select create-time default。它是 canonical Field metadata，不会填充或改写任何
existing cell；create-time mutation 行为由 Eidos Runtime 1.0 定义。

cell value 即使不在 catalog 里仍然是有效 canonical data，必须原样保留；如何呈现
unconfigured value 归 UI 规范。删除 catalog metadata 不能静默删除 cell data。

只修改 catalog 不会 rename 或 invalidate cell。atomic option rename/merge 对 cell、
View query 与 `defaultOption` 的 rewrite 由 Runtime 规范定义；Formula string literal
不是结构化 option reference。
Select 普通 SQLite index 可以作为 in-file generated access state；Multi-select reverse
index 必须可由 JSON column 重建，且不能引入 Option ID。

## 10. Relation

### 10.1 Forward storage

forward Relation 是真实 JSON column：

```json
["0198c72d-82b5-7968-b163-98be4b747702"]
```

cardinality-one 数组最多一个元素；many 可有多个。数组按用户顺序保存，Row ID 不能
重复。resolved Record Label 是 generated display data，不能写入 Relation cell。

Writer 校验 JSON array、UUID syntax、uniqueness 与 cardinality。target existence 不是
raw-value constraint；missing target 是 unresolved Relation，其 ID 仍为 canonical。
哪些 Runtime operation 可以创建它、如何报告，由 Runtime 规范定义；Writer 不能静默
detach 来伪造 resolved state。

cold direct join 不需要 ID 转换：

```sql
SELECT source."_id", CAST(item.key AS INTEGER) AS position, target."_id"
FROM "<source-table>" AS source
JOIN json_each(source."<relation-column>") AS item
JOIN "<target-table>" AS target ON target."_id" = item.value
ORDER BY source."_id" COLLATE BINARY, position;
```

### 10.2 Record-label reference

Relation cell 只保存 Row IDs，不能保存 label、resolved object 或 placeholder。target
Table 的 `label_field_id` 是唯一持久 label-role reference；batched resolution 与 error
归 Runtime，display fallback 归 UI。

### 10.3 Inverse Relation

若 forward Field `F` 属于 Table `S` 并指向 `T`，inverse Field `I` 只有在以下条件全部
满足时才 structurally valid：

- `I` 属于 `T`；
- `I.inverse_of_field_id = F`；
- `I.target_table_id = S`；
- `I.cardinality = 'many'`；
- `I.physical_name = NULL`；并且
- 它的 `eidos__relation_fields.on_delete` 显式为 `NULL`，而不是 column 的 forward
  Relation default。

inverse definition 不创建 mirror column 或 edge table。value、order、dependency 与
query evaluation 由 Runtime 从 forward JSON 派生。1.0 不定义 target-unique one-to-one。

### 10.4 Deletion

logical delete operation 必须在写任何 row 前声明各 Table 的完整 Row-ID delete set。
delete set 中 source row 自己拥有的 Relation value 随 row 消失，不算 surviving incoming
reference。target delete policy 只作用于不在 source delete set 的 surviving rows：

| policy     | 行为                                                                  |
| ---------- | --------------------------------------------------------------------- |
| `restrict` | surviving source array 含任一 target-delete-set ID 就 abort           |
| `detach`   | 同一事务从全部 surviving source arrays 删除所有 target-delete-set IDs |
| `preserve` | surviving source arrays 不变，形成 unresolved value                   |

Writer 必须对完整 delete set 做 set-based preflight；`restrict` 失败则整笔 abort。
`detach` 先保序批量更新 surviving arrays，并用同一个 bound operation instant 更新受影响
rows 的 `_updated_at`。必要时可在同一未 commit 事务内先清空即将删除 rows 的 outgoing
arrays，再执行 physical delete，从而使 self/cycle/multi-row delete 不依赖 SQLite row
visitation order。`restrict` 也是 Writer 与省略 forward `on_delete` 时的 SQL default。

删除 referenced Table/Field 前必须在同一 structural transaction 删除或 retarget
Relation/Lookup dependency。Formula source 与 View document 需要上层 parser；若 owner
Table 中存在可能引用该 Field 的 Formula/View，EF-only Writer 必须委托 semantic Writer
或拒绝 Field delete/type change。删除带 inverse 的 forward Relation 前还必须先删除或
retarget inverse Field。

portable `restrict` trigger 可以扫描 `json_each(source.column)`；portable `detach`
trigger 可以用 `json_group_array` 保持 `json_each.key` 顺序重建数组。实现可以改用经过
验证的 derived reverse index，但它与 JSON source column 不一致时永远以后者为准。

user table 必须拒绝 `_id` value change，同时允许赋同一值。portable trigger 是：

```sql
CREATE TRIGGER "eidos__row_id_immutable__<table-id-hex>"
BEFORE UPDATE OF "_id" ON "<physical-table-name>"
WHEN NEW."_id" IS NOT OLD."_id"
BEGIN
  SELECT RAISE(ABORT, 'EIDOS_ROW_ID_IMMUTABLE');
END;
```

generated object name 中，`<table-id-hex>` 与 `<field-id-hex>` 表示去掉 hyphens 的
canonical UUID；它只作为 identifier suffix。以下 templates 中 `<target-uuid>` 就是
`OLD."_id"`。source/target 不同表时，`<source-survives-in-scan>` 与
`<source-survives-in-update>` 都是 literal `1`；self Relation 时分别是
`source."_id"<>OLD."_id"` 与 `"<source-table>"."_id"<>OLD."_id"`。无需 UUID
conversion。

每个 incoming forward Relation 的 portable `restrict` trigger 是：

```sql
CREATE TRIGGER "eidos__relation_restrict__<field-id-hex>"
BEFORE DELETE ON "<target-table>"
WHEN EXISTS (
  SELECT 1
  FROM "<source-table>" AS source,
       json_each(CASE WHEN json_valid(source."<relation-column>")
                      THEN source."<relation-column>" ELSE '[]' END) AS item
  WHERE item.value = <target-uuid>
    AND <source-survives-in-scan>
)
BEGIN
  SELECT RAISE(ABORT, 'EIDOS_RELATION_RESTRICT');
END;
```

portable `detach` trigger 是：

```sql
CREATE TRIGGER "eidos__relation_detach__<field-id-hex>"
BEFORE DELETE ON "<target-table>"
WHEN EXISTS (
  SELECT 1
  FROM "<source-table>" AS source,
       json_each(CASE WHEN json_valid(source."<relation-column>")
                      THEN source."<relation-column>" ELSE '[]' END) AS item
  WHERE item.value = <target-uuid>
    AND <source-survives-in-scan>
)
BEGIN
  UPDATE "<source-table>"
  SET "<relation-column>" = (
        SELECT coalesce(
          json_group_array(item.value ORDER BY CAST(item.key AS INTEGER)), '[]')
        FROM json_each(CASE
          WHEN json_valid("<source-table>"."<relation-column>")
          THEN "<source-table>"."<relation-column>" ELSE '[]' END) AS item
        WHERE item.value <> <target-uuid>
      ),
      "_updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE <source-survives-in-update>
  AND EXISTS (
    SELECT 1
    FROM json_each(CASE
      WHEN json_valid("<source-table>"."<relation-column>")
      THEN "<source-table>"."<relation-column>" ELSE '[]' END) AS item
    WHERE item.value = <target-uuid>
  );
END;
```

`preserve` 不安装 target-delete trigger。这些 row triggers 是未专门化 SQLite mutation
的 single-target safety net，不定义 conforming Runtime/Writer delete operation 的 set
semantics。尤其 detach template 的 SQLite `now` 只是 statement time；conforming Writer
必须先用其 bound operation instant 完成 set-based detach，再删除 targets，因而安全
trigger 不会执行 canonical detach。一般 writable connection 必须拒绝未经 set-based
preflight 的 multi-row target delete。

Relation create/retarget、column rename、table rename 与 `on_delete` change 必须在同一
structural transaction 创建、重建或移除受影响 triggers。Table rename 不改变 Table ID
或 stored Relation arrays。EF-Writer 可以使用基于 generated reverse index、行为等价的
triggers；validator 校验 trigger 行为，不能只看名称。

forward Relation column 的 insert/update behavior 还必须校验：

- value 是 JSON array；
- 每个 element 是 lowercase hyphenated UUID string；
- target ID 不重复；
- cardinality `one` 最多一个 element。

下列是具体 INSERT trigger shape。UPDATE trigger 使用不同名称
`eidos__relation_validate_update__<field-id-hex>`，并把 `BEFORE INSERT` 替换为
`BEFORE UPDATE OF "<relation-column>"`；两者都使用 `NEW`。cardinality `many` 时省略
最后的 `json_array_length` clause。

```sql
CREATE TRIGGER "eidos__relation_validate_insert__<field-id-hex>"
BEFORE INSERT ON "<source-table>"
WHEN NOT json_valid(NEW."<relation-column>")
  OR json_type(CASE WHEN json_valid(NEW."<relation-column>")
                    THEN NEW."<relation-column>" ELSE '[]' END)<>'array'
  OR EXISTS (
    SELECT 1
    FROM json_each(CASE WHEN json_valid(NEW."<relation-column>")
                        THEN NEW."<relation-column>" ELSE '[]' END) AS item
    WHERE item.type<>'text' OR length(CAST(item.value AS BLOB))<>36
      OR instr(item.value,char(0))<>0
      OR substr(item.value,9,1)<>'-' OR substr(item.value,14,1)<>'-'
      OR substr(item.value,15,1)<>'7' OR substr(item.value,19,1)<>'-'
      OR substr(item.value,20,1) NOT IN ('8','9','a','b')
      OR substr(item.value,24,1)<>'-' OR lower(item.value)<>item.value
      OR length(CAST(replace(item.value,'-','') AS BLOB))<>32
      OR replace(item.value,'-','') GLOB '*[^0-9a-f]*'
  )
  OR (SELECT count(*) FROM json_each(
        CASE WHEN json_valid(NEW."<relation-column>")
             THEN NEW."<relation-column>" ELSE '[]' END))
     <> (SELECT count(DISTINCT value COLLATE BINARY) FROM json_each(
        CASE WHEN json_valid(NEW."<relation-column>")
             THEN NEW."<relation-column>" ELSE '[]' END))
  OR json_array_length(CASE WHEN json_valid(NEW."<relation-column>")
                            THEN NEW."<relation-column>" ELSE '[]' END)>1
BEGIN
  SELECT RAISE(ABORT,'EIDOS_RELATION_INVALID');
END;
```

这些 triggers 强制 raw shape。JCS spelling 仍由 Writer 校验；target existence 单独报告，
因为 unresolved ID 是合法 raw Relation value。若 Writer 使 raw table mutation 不可能，
可改用 behaviorally equivalent pre-commit validation；但一般 writable `.eidos` SQLite
connection 必须安装这些 triggers。

### 10.5 Generated reverse state

reverse edge、resolved label 与 materialized inverse 都是 generated state，不能替代或
修正 forward JSON 与 canonical metadata。1.0 不包含 in-file reverse edge table；
planning 与 Host-private index 分别归 Runtime、Adapter。

## 11. Formula definition storage

Formula Field 必须 `type='formula'`、`physical_name=NULL`，并在
`eidos__formula_fields` 恰有一行，只保存 Field ID、1–4096 UTF-8 bytes 的
`source_text` 与 declared scalar `result_type`。

source 是唯一 canonical expression。它用 exact current display Field name，并用双引号
作为 identifier；名称内的 `"` 写作 `""`。grammar、serializer、function signature、
type/NULL/error 与 evaluation 只由 Runtime 规范定义。EF 只校验和保留 storage shape；
ER 还要求 source 可解析、同表 name 精确解析一次、result type 相容。

AST、resolved Field-ID refs、dependency edges、compiled SQL、sample 和 result 都是
generated state。Field rename 的 AST rewrite 与 atomic postcondition 由 Runtime 定义；
EF-only Writer 必须 byte-for-byte 保留 `source_text`，遇到受影响 rename 就拒绝，不能猜测。

## 12. Lookup 与 dependency definition storage

Lookup Field 必须 `type='lookup'`、`physical_name=NULL`，并在
`eidos__lookup_fields` 恰有一行。四项 canonical parameter 是 Relation Field ID、
target Field ID、aggregate name 与 `distinct_values`。

Relation Field 必须属于 Lookup owner Table；target Field 必须属于该 Relation 的 target
Table。Runtime type rules 允许时，Lookup 可以指向 stored Field、system Field、Relation、
Formula 或 Lookup。Runtime-usable File 必须有 acyclic 的 file-wide derived dependency
graph；graph nodes、edge construction、nested flatten、ordering、typed distinct、aggregate、
cycle diagnostics 与 evaluation 全部归 Runtime。Formula/Lookup/inverse Relation result
都不能成为 user-table materialized column；definition row 中的 stable Field IDs 是
canonical，parsed edge/topological plan 只是 generated state。

## 13. Saved View definition storage

View 是 `eidos__views` 中以 stable View ID 标识的 row。`query_json` 与
`layout_json` 必须是 JCS object；其中结构化 Field reference 只用 Field ID。它们不能
保存 copied cell、resolved label、generated SQL、cursor/page、current selection/focus/
scroll、draft 或 open-panel state。

Runtime 判断 core `query_json` 是否是可用 Query Document并拥有其含义；UI 对
`grid`、`gallery`、`kanban` 的 `layout_json` 做同样工作。empty query object
表示 Runtime default query。EF 层只负责 JCS storage、stable-ID reference 和 unknown
member/type preservation，不重复上层 JSON schema。selected View 是 UI state，不保存在
`eidos__meta`。Reader 必须保留 unknown View type 与 unknown JSON members。改变 query
meaning 的 extension
必须在 `eidos__features` 声明 `required=1`；不支持该 exact feature tuple 的 Reader/
Writer 不能进行 semantic access 或 canonical write。

## 14. Canonical write 与 revision

只要 transaction 实际改变 canonical state，就必须在 commit 前：

1. 在第一项 canonical mutation 前选择一个 canonical operation instant，并将它 bind 给
   全部受影响的 `updated_at`；
2. 使全部 File invariant 有效；
3. 在 commit 前立即使 `eidos__meta.revision` 恰好加一；
4. 设置 meta `updated_at` 为同一个 operation instant；
5. 使 metadata、physical schema、rows、definitions 与 required triggers 一起 commit，
   或全部 rollback。

真正 no-op 不得改 revision 或任何 timestamp。纯 generated index/trigger repair 不加
revision，除非同时改 canonical metadata。Row create 时 `_created_at=_updated_at`；
以后改变该 row 任一 source cell 才更新 `_updated_at`，另一 row 导致 derived result
变化不更新它。committed row/metadata 的 `created_at` 以及 File/Table/Field/Row/View ID
永不原地修改；schema-object `updated_at` 同样使用 operation instant。revision 是
non-negative signed int64 counter，不是 wall time、digest、
SQLite `data_version` 或 merge clock；达到 `9223372036854775807` 后拒绝 canonical
change，不得 wrap。

request order、expected revision、conversion 与 public result 归 Runtime；lock、
publication、external change 与 recovery 归 Adapter。

## 15. State placement

| state                                                                                                               | 格式地位                              |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| required metadata、user source columns、Select catalog、Relation/Formula/Lookup definitions、saved View documents   | canonical                             |
| required Eidos triggers、由 canonical metadata 派生的普通 scalar SQLite indexes                                     | 允许的 in-file generated/access state |
| AST/DAG/SQL、reverse multi-value indexes、FTS、embedding、thumbnail、derived value、resolved label、page/group/stat | 非 canonical，published file 不能依赖 |
| permission、recovery/working copy、source handle、writer lease、numeric projection/expression index                 | Adapter state                         |
| focus、selection、scroll、draft、optimistic placeholder、current View                                               | UI state                              |

canonical 与 generated 不一致时以前者为准并重建后者。1.0 不允许 in-file
multi-value reverse index 或 materialized virtual result。

EF-Reader 必须在不依赖任何 generated object 的情况下解释 canonical state；唯一例外是
safe write 所需的 required trigger behavior。允许的 in-file generated state 与 canonical
metadata/source column 不一致时，必须丢弃或重建 generated state。

optional scalar access index 的准确名称是
`eidos__index__<field-id-hex>`，suffix 为去掉 hyphen 的 stored Field UUID。它只能是
该 Field quoted physical column 上的 non-unique、non-partial 单列 index，并使用该列
declared collation；reserved namespace 中禁止 expression/additional columns。non-reserved
generated index 可以覆盖一个或多个 direct stored scalar columns（`text`、`number`、
`integer`、`checkbox`、`date`、`datetime`、`url`、`select`），但必须 non-unique、
non-partial、没有 expression，并使用各列 declared collation；Reader 可以丢弃它。
required metadata index 与 trigger name 只包括第 7、10 节声明/template 的对象；其他
undeclared `eidos__*` object 不允许。

## 16. CSV boundary（informative）

CSV 不是 Eidos File canonical state，不能单独重建 stable ID、NULL 与 empty Text、
Formula/Lookup definition、Relation endpoint、timestamp、settings 或 View。精确
round-trip 使用 `.eidos`。RFC 4180 display export 与 typed import binding 由 Runtime
定义；本格式不指定第二份 canonical CSV。

## 17. External version-management boundary

Graft 或其他 version manager 只看到一个 published、self-contained `.eidos` 主数据库。
它可以按以下 canonical objects 分类 change：

| Object                                          | Meaning                                                    |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `eidos__tables`, `eidos__fields`                | Table/Field schema、Record Label role 与 physical mapping  |
| `eidos__relation_fields`                        | Relation definitions 与 deletion policies                  |
| `eidos__formula_fields`, `eidos__lookup_fields` | virtual-field definitions                                  |
| `eidos__views`                                  | query 与 layout metadata                                   |
| user-named tables                               | source rows、Select text、Multi-select JSON、Relation JSON |

本格式不定义 checkout、merge、lock 或 replacement。whole-file restore 与 durable
publication 是 Adapter operation；logical merge 与 post-merge validation 是 Runtime
operation。stable IDs 与 canonical/raw distinction 是 version manager 可以依赖的完整
边界。1.0 没有 Graft-specific table 或 sidecar。

可选的 [Eidos 系统元数据合并 1.0](./eidos-system-metadata-merge-1.0.zh.md) Runtime
profile 为 canonical `eidos__*` metadata objects 定义 draft 三方语义。它不改变本格式的
validity rules 或 base conformance labels。

## 18. File validation

格式层有三级：

1. **identity**：SQLite header、UTF-8、application ID、`user_version`、typed singleton
   meta、format version 与每个 required `(name,version)` tuple 及其 version-selected
   config schema；返回 canonical rows 前完成。
2. **structural**：第 7 节 metadata objects、FK、physical mapping、user columns、
   affinity/collation、STRICT/row organization、exact subtype/`nullable` matrix、system
   role、Record Label eligibility、required trigger behavior 与第 15 节 index restrictions。
3. **content**：流式检查全部 canonical raw cells/JCS documents、稳定结构引用与
   Sections 5、8–10，并运行 SQLite integrity checks。

unresolved Relation target 是 warning，不是 format error。Formula grammar、Lookup
DAG/type、Query Document 与 standard layout 由 Runtime/UI validator 报告，不改变
EF storage shape。
EF 只校验 normalized metadata column 与本规范明确给出 reference location 的 File-owned
JSON；Query/layout document 内的 Field IDs 由所属 Runtime/UI validator 校验，EF 不猜测。

diagnostic 必须含 stable code、`fatal/error/warning/info` severity，并在可知时附
File/Table/Field/Row/View ID 与 metadata/JSON path。caller 提供 positive diagnostic
limit；超出时 `truncated=true`。排序依次是 severity、code、stable IDs、path，均按
BINARY ascending。fatal 表示不能继续安全 inspection；error 禁止 Writer commit。
warning 不会禁止 commit。

Core 1.0 code/severity 固定如下：

| Stage      | Code                                                                                                 | Severity / condition                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| identity   | `file-not-sqlite`                                                                                    | fatal：不能安全打开为 SQLite 3                                               |
| identity   | `file-identity-invalid`                                                                              | error：application ID、user version、meta singleton 或 File ID identity 无效 |
| identity   | `file-format-unsupported` / `file-feature-unsupported`                                               | error：version 或 required feature 不支持                                    |
| structural | `file-core-object-invalid` / `file-metadata-invalid`                                                 | error：core object 或 typed metadata/JSON shape 无效                         |
| structural | `file-foreign-key-invalid` / `file-physical-schema-invalid`                                          | error：reference 或 user-table/column/STRICT/row organization 无效           |
| structural | `file-definition-invalid` / `file-trigger-invalid` / `file-index-invalid` / `file-extension-invalid` | error：对应 definition/object rule 无效                                      |
| content    | `file-cell-invalid` / `file-json-invalid` / `file-reference-invalid`                                 | error：对应 canonical raw value/reference 无效                               |
| content    | `file-unresolved-relation`                                                                           | warning：canonical Relation target unresolved                                |
| content    | `file-integrity-invalid`                                                                             | `quick_check` 非 `ok` 为 fatal；`foreign_key_check` 有 row 为 error          |

Table/Field/Row/View finding 必须带上所有可安全确定的 stable ID；identity 本身损坏时改用
metadata/JSON path。content cell 与 unresolved Relation 都必须带 Table、Field、Row ID。
optional sort key 是 absent 在前、present 在后。supported required extension 只能增加
`x.<vendor>.<code>`，token 服从第 20 节 grammar；core validator 不能输出其他 code。

discovery 把 `sqlite_schema` 当数据读取，不能 select 任意 file-defined view、执行
virtual table 或触发 undeclared trigger。content validation 必须得到：

```sql
PRAGMA foreign_key_check;
PRAGMA quick_check;
```

Writer commit 前运行受影响 structural/content checks；新建或 published File 通过全部
三级。public semantic/full validation operation 归 Runtime；safe-open sequence 归
Adapter。

## 19. Security

每个 Eidos File 都是不可信输入。Reader/Writer 必须关闭 trusted schema 与 extension
loading，bind value、quote physical identifier，在格式操作中拒绝 `ATTACH` 与
`writable_schema`，并且不执行 undeclared schema object。required trigger 必须从
canonical metadata 重建；挂在 core/user table 上的 unknown trigger 使文件不可写。

format hard limits 是：Table/Field/View/File title 为 1,024 UTF-8 octets；Formula
source 为 4,096 UTF-8 octets；单个 Multi-select、Relation 或 File array 为 10,000
elements；一个 canonical JSON cell 为 16 MiB。

第 7 节更小的 DDL limits 同时生效。1.0 不规定 total file/row limit；Adapter/Runtime
advertise 可更低的 operational limits，超限必须 bounded error，不能 partial read。
URI validation 不授予 fetch/reveal/decode-for-display/write 权限；relative File URI
不能逃逸 File 的 scoped asset root。Data URL 即使没有 network location 也仍是
untrusted active input；media type、Base64、decoded size、decoder cost 与 presentation
isolation 都必须受限。authorizer、defensive mode、busy/deadline、Worker isolation、
permission 与 asset authorization 归 Adapter。

## 20. Extension 与 versioning

`format_major/minor` 定义 persisted semantics，`user_version=1` 标识本 physical
schema。feature `version` 是 case-sensitive BINARY opaque token，不能自行推断 SemVer
compatibility；support 表示识别 exact `(name,version)` 并按该 version 的 schema 校验
`config_json`。unknown tuple、unsupported version，或 unsupported/invalid required config
使 EF conformance 不可用；工具只能明确提供 uninterpreted byte copy，不能称其为
canonical Eidos data。

`required=0` feature 必须能被未知实现 semantic-ignore，并由 Writer byte-semantically
preserve，否则拒绝写。改变 core raw value、query result、mutation postcondition 或其他
不可忽略 meaning 的 feature 必须 `required=1`。

未注册的 extension object 使用 `x__<vendor>__*`；vendor 是 letter 开头、仅 lowercase
ASCII letter/digit/underscore 的非空 token。注册在 `eidos__tables` 中的 `x__*` table 是
user Table，不是 extension object。第三方 feature name 必须是
`x__<vendor>__<feature>`，feature 使用同一 token grammar；每个未注册 vendor object 至少
有一条同 vendor-prefix feature row，否则是 structural error。extension 不能创建
`eidos__*`、给 core/user table 挂 trigger、shadow user physical name 或重新解释 core raw
value。extension table/index 只有对 declared extension 才是 canonical。compatible
clarification 可以增加
example/test，但不能改变已有 valid byte/value interpretation；任何 persisted meaning
change 都必须升级 File Format version。Runtime/Adapter/UI version 相互独立。

## 21. Media type registration template

这是 registration template，不表示 vendor media type 已经完成 IANA registration：

```text
Type name: application
Subtype name: vnd.eidos+sqlite3
Required parameters: N/A
Optional parameters: N/A
Encoding considerations: binary
Security considerations: Section 19 and +sqlite3 considerations apply.
Interoperability considerations: SQLite 3 database with application ID
  0x45494453 and Eidos File Format 1.0 schema.
Published specification: this document
Applications: local-first multidimensional table editors and data tools
Fragment identifier considerations: N/A
Magic numbers: "SQLite format 3\\0" at offset 0; 0x45494453 at offset 68
File extension: .eidos
Intended usage: COMMON
Change controller: Eidos Project
```

## 22. File conformance tests

EF manifest 记录 implementation/SQLite version、label、optional features 与 vector IDs。
shared fixtures/executable SQL 至少覆盖：

- exact metadata DDL、atomic empty-file create/rollback、identity/version 与 exact
  required feature tuple/config negatives；
- 所有位置的 lowercase hyphenated UUIDv7 TEXT、extra-hyphen/U+0000 negatives 与 direct
  Relation join；
- date/instant malformed-24-octet/year-0000 negatives、BINARY order、SQLite function
  round-trip；
- JCS object/array、Unicode、duplicate-key、non-finite 与 size negatives；
- 中文、空格、keyword、quote、physical/display 精确相等、ASCII-NOCASE duplicate rejection、
  system-column collision rejection、1,024-octet rejection、reserved Table prefix rejection、
  `x__` user Table 与 case-only Table rename；
- ordinary STRICT rowid 与 `STRICT, WITHOUT ROWID`；
- exact subtype/`nullable` matrix 与每个 stored Field 的 boundary raw value，包括
  int64/binary64 extrema、negative-zero normalization、NULL/empty 与 File objects；File
  vectors 必须覆盖 valid/unresolved relative 与 `https:` reference、canonical inline
  image、Base64 alphabet/padding/size/media-type mismatch negative、percent-decode 后
  traversal，以及 1 MiB inline-image boundary；
- Select 无 Option ID、unconfigured value、Multi-select ordered unique strings；
- Relation shape/cardinality、distinct INSERT/UPDATE validator names、inverse lifecycle、
  immutable Row ID 与 self/cycle/multi-row set-based restrict/detach/preserve；
- Formula/Lookup/View definition 没有 materialized results；
- EF-decidable Record Label（包括拒绝 core Lookup label）、immutable ID/`created_at`、
  canonical change/no-op/rollback/one-operation-instant/revision overflow；
- scalar index allowlist，以及 unique/partial/expression/multi-value/undeclared reserved
  index rejection；
- unknown optional preservation、orphan extension-object rejection、unknown/unsupported
  required tuple rejection、undeclared core object、hostile view/trigger、malformed schema
  与 bounded diagnostics；
- `foreign_key_check`、`quick_check`、reopen 与 semantic byte round-trip。

EF vectors 不要求 Runtime evaluation，也不要求相同 SQLite page layout/DB bytes。
Runtime、Adapter、UI vectors分别归各自规范。

## Appendix A. 示例（informative）

SQLite source table 可以直接理解：

```sql
CREATE TABLE "Tasks" (
  "_id" TEXT COLLATE BINARY PRIMARY KEY,
  "_created_at" TEXT NOT NULL,
  "_updated_at" TEXT NOT NULL,
  "Title" TEXT,
  "Status" TEXT,
  "Tags" TEXT NOT NULL DEFAULT '[]',
  "Project" TEXT NOT NULL DEFAULT '[]',
  "Estimate" REAL
) STRICT;
```

一行可以包含：

```text
Title    = "Ship format"
Status   = "In Progress"
Tags     = ["Backend","Urgent"]
Project  = ["0198c72d-82b5-7968-b163-98be4b747702"]
Estimate = 8.5
```

metadata 可以另外加入 persisted virtual-field definitions：

```text
Projects.Budget with tax = Formula("Budget" * 1.2)
Tasks.Project budget     = Lookup(Project, Budget with tax, first)
Tasks.Label              = Formula("Title" || "Project budget")
```

`Tasks.Title` 与 `Projects.Name` 是各自 Table 中普通的用户 Field，由各 Table 的
`label_field_id` 选择；它们不是固定 system Field。Relation cell 始终只保存 Row-ID
array；definition 的 evaluation/resolution 归 Runtime。

只有 stored Fields 与 forward Relation 出现在 `PRAGMA table_xinfo("Tasks")`；Formula
与 Lookup 只出现在 Eidos metadata，没有 canonical materialized result column。

把 `Status` 改名为 `State` 会 rename 真实 SQLite column，但 Field ID 保持不变，并原子
改写 parsed Formula reference nodes。option rename 是 Runtime operation，不是
catalog-only 第二编码。

## Appendix B. 为什么保留 Field ID（informative）

人类可读 physical name 优化 inspectability，但它仍是可变 location：用户会 rename，
name conflict 必须在 commit 前解决，两个 branches 也可能把同一 Field 改成不同名称。
Lookup、inverse Relation、View、Formula identity、dependency diagnostics 与 logical
diff 都需要在这些操作后仍稳定的 identity。

Field ID 提供该 identity，却不让 storage 变得不透明。SQLite column 就是 display name；
metadata 把它连接到 stable Field ID。人类编写的 Formula source 刻意使用 quoted Field
name。rename 保持 ID，并只原子改写 parsed Formula reference nodes；merge 先决定最终
Field name，再重新 serialize 受影响 Formula source。

## Appendix C. 可复现 SQLite 验证（informative）

最终 storage 选择和全部完整或替换 placeholder 后的 SQL template，在 2026-07-21 用系统
SQLite 3.53.1 重新实际执行。本文所有 schema、quoted 中文、identifier、temporal、
Relation、rename、trigger、STRICT、rowid 与 `WITHOUT ROWID` 示例均成功执行；
`PRAGMA foreign_key_check` 无 rows，`PRAGMA quick_check` 返回 `ok`。duplicate Relation
input 与 `restrict` delete 返回 required errors；`detach` 保持 array order；SQLite rename
重写测试过的 trigger references。SQL 没有使用高于最低 SQLite 3.45 的能力。以下
performance measurements 记录于 2026-07-20。

row-organization measurement 使用 4,096-byte pages；两个数据库都插入相同的 200,000
个 monotonic UUIDv7-like canonical TEXT keys，以及 Text、Number、Datetime columns。
唯一 DDL 差异是：

```sql
CREATE TABLE rows(_id TEXT PRIMARY KEY COLLATE BINARY,
  label TEXT, score REAL, created TEXT) STRICT;
-- versus
CREATE TABLE rows(_id TEXT PRIMARY KEY COLLATE BINARY,
  label TEXT, score REAL, created TEXT) STRICT, WITHOUT ROWID;

WITH RECURSIVE seq(i) AS (
  SELECT 1 UNION ALL SELECT i+1 FROM seq WHERE i<200000
)
INSERT INTO rows
SELECT printf('%08x-%04x-7%03x-8%03x-%012x',
              i>>28,(i>>12)&65535,i&4095,(i>>8)&4095,i),
       'Record '||i, i/10.0, '2025-01-01T00:00:00.000Z'
FROM seq;
```

完成相同 inserts、`ANALYZE` 与 `VACUUM` 后，用以下命令复现 size/plans：

```sh
sqlite3 ordinary.db "SELECT name,sum(pgsize) FROM dbstat GROUP BY name"
sqlite3 without.db  "SELECT name,sum(pgsize) FROM dbstat GROUP BY name"
sqlite3 ordinary.db "EXPLAIN QUERY PLAN SELECT label FROM rows WHERE _id=?"
sqlite3 without.db  "EXPLAIN QUERY PLAN SELECT label FROM rows WHERE _id=?"
```

ordinary file 是 27,541,504 bytes：row table 18,444,288，UUID unique index
9,084,928。`WITHOUT ROWID` 是 17,829,888 bytes，直接使用 PRIMARY KEY，总体减少
35.3%。两者 point lookup 都使用 UUID index/PRIMARY KEY。这支持第 8.1 节的 default；
它不是 universal performance claim，因此两种 organization 都 conforming。

Relation access 使用 100,000 source rows，每行三个 canonical Row IDs，共 300,000
edges。cold 与 warm queries 是：

```sql
CREATE TABLE sources(_id TEXT PRIMARY KEY COLLATE BINARY,
  rel TEXT NOT NULL CHECK(json_valid(rel) AND json_type(rel)='array'))
  STRICT, WITHOUT ROWID;

WITH RECURSIVE seq(i) AS (
  SELECT 1 UNION ALL SELECT i+1 FROM seq WHERE i<100000
)
INSERT INTO sources
SELECT printf('%08x-%04x-7%03x-8%03x-%012x',
              i>>28,(i>>12)&65535,i&4095,(i>>8)&4095,i),
       json_array(
         printf('00000000-0000-7000-8000-%012x',i%10000),
         printf('00000000-0000-7000-8000-%012x',(i+1)%10000),
         printf('00000000-0000-7000-8000-%012x',(i+2)%10000))
FROM seq;

SELECT count(*)
FROM sources AS s, json_each(s.rel) AS j
WHERE j.value=:target;

CREATE TABLE reverse_edges(source_id TEXT,target_id TEXT,position INTEGER,
  PRIMARY KEY(target_id,source_id,position)) STRICT, WITHOUT ROWID;
INSERT INTO reverse_edges
SELECT s._id,j.value,CAST(j.key AS INTEGER)
FROM sources AS s,json_each(s.rel) AS j;

SELECT count(*) FROM reverse_edges WHERE target_id=:target;
```

两者都返回 30。cold plan 扫描 sources 与 `json_each`，同一次 run 约 32.4 ms；
Host-private `(target_id,source_id,position)` PRIMARY KEY lookup 约 0.064 ms。
300,000-edge cache 建立约 236 ms。因此 readable JSON array 保持 canonical，而 warm
reverse index 被推荐且可随时丢弃。

## 规范性参考

- [BCP 14](https://www.rfc-editor.org/info/bcp14)
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339)
- [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986)
- [RFC 2397：`data` URL scheme](https://www.rfc-editor.org/rfc/rfc2397)
- [RFC 4648：Base-N encodings](https://www.rfc-editor.org/rfc/rfc4648)
- [RFC 6838](https://www.rfc-editor.org/rfc/rfc6838)
- [RFC 7493 — I-JSON](https://www.rfc-editor.org/rfc/rfc7493)
- [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259)
- [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785)
- [RFC 9562](https://www.rfc-editor.org/rfc/rfc9562)
- [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html)
- [SQLite Date And Time Functions](https://www.sqlite.org/lang_datefunc.html)
- [SQLite Datatypes](https://www.sqlite.org/datatype3.html)
- [SQLite Database File Format](https://www.sqlite.org/fileformat.html)
- [SQLite Foreign Keys](https://www.sqlite.org/foreignkeys.html)
- [SQLite JSON Functions](https://www.sqlite.org/json1.html)
- [SQLite Keywords and Identifier Quoting](https://www.sqlite.org/lang_keywords.html)
- [SQLite Built-in Aggregate Functions](https://www.sqlite.org/lang_aggfunc.html)
- [SQLite PRAGMA Statements](https://www.sqlite.org/pragma.html)
- [SQLite Rowid Tables](https://www.sqlite.org/rowidtable.html)
- [SQLite STRICT Tables](https://www.sqlite.org/stricttables.html)
- [SQLite WITHOUT ROWID](https://www.sqlite.org/withoutrowid.html)
- [SQLite Expressions](https://www.sqlite.org/lang_expr.html)

## 资料性参考

- [Eidos File Format 1.0 canonical specification](./eidos-file-1.0.md)
- [RFC 4180](https://www.rfc-editor.org/rfc/rfc4180)
- [SQLite as an Application File Format](https://www.sqlite.org/appfileformat.html)
- [SQLite Security](https://www.sqlite.org/security.html)
- [SQLite Limits](https://www.sqlite.org/limits.html)
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- [IANA `+sqlite3`](https://www.iana.org/assignments/media-type-structured-suffix/media-type-structured-suffix.xhtml)
- [W3C Specification Guidelines](https://www.w3.org/TR/qaframe-spec/)
