# Eidos 虚拟表规范 1.0

Runtime 校验必须在读取虚拟表列或行之前，拒绝未知的必需虚拟表规范，或
`PRAGMA module_list` 中未加载的必需模块。`vtab:` 前缀本身不代表支持。
当前实现仅支持已经加载原生模块的 `fs_meta` 规范。

状态：草案 Eidos 标准 Profile\
版本：1.0\
发布日期：2026-09-24\
编辑器与变更控制方：Eidos Project\
规范语言：English（英文为权威规范，中文为对齐参考）

## 摘要

本 Profile 规范了在 [Eidos 文件格式 1.0 (Eidos File Format 1.0)](./eidos-file-1.0.zh.md) 数据库中集成 SQLite 虚拟表（`vtab`）的标准机制。它定义了一个 `.eidos` 数据库容器如何承载、查询、配置及修改由外部单一真实来源（SSOT，例如通过 `fs_meta` 驱动的本地文件系统元数据）支撑的虚拟表，同时完整保留 Eidos 规范的视图定义（View）、字段元数据（Field）、排序、筛选及 [Graft 版本控制](../../graft/README.md) 的兼容性。

本规范引入了以下一致性标签：

- **`EF-VTab-1.0`**：文件格式层规范，涵盖虚拟表在 SQLite 及 `eidos__*` 元数据中的声明，以及对非 UUIDv7 行标识符的主键放宽规则。
- **`ER-VTab-1.0`**：运行时层规范，涵盖表能力集（Capabilities）强约束、查询下推，以及对不可新增行等受限修改的语义转译。
- **`EA-VTab-1.0`**：适配器/宿主层规范，涵盖原生扩展模块路径解析、安全白名单及动态加载生命周期。

## 规范地位

文中的关键保留词 **MUST**（必须）、**MUST NOT**（严禁）、**REQUIRED**（需要）、**SHALL**（应当）、**SHALL NOT**（不应）、**SHOULD**（推荐）、**SHOULD NOT**（不推荐）、**MAY**（可选）依据 RFC 2119 与 RFC 8174 作出严格定义。

英文版文件为权威规范。在状态变为 Final 且测试用例齐备前，任何实现不得声称已满足本规范。

## 1. 架构定位、职责与所有权

本规范作为 [Eidos 1.0 规范体系](./README.zh.md) 的扩展：

```text
Eidos UI 1.0
    │  调用 RuntimeClient
    ▼
Eidos Runtime 1.0 (ER-VTab-1.0)
    │  校验并执行表能力集（禁用新建行、允许更新字段）
    │  编译虚拟表 SQL 查询与元数据更新
    ▼
Eidos Adapter 1.0 (EA-VTab-1.0)
    │  按平台解析并加载受信任的原生 SQLite 扩展（如 libfs_meta）
    │  管控连接生命周期与沙箱白名单
    ▼
Eidos File Format 1.0 (EF-VTab-1.0)
    │  在 eidos__features 声明 vtab 依赖
    │  在 eidos__* 元数据表中持久化视图、字段、筛选与排序
    ▼
外部存储 / 文件系统
       数据行与元数据属性的单一真实来源（如 xattr / ADS）
```

各层级职责边界：

- **Eidos 文件格式（File Format）**：拥有 `eidos__*` 规范元数据表、特性声明及持久化模式的所有权。
- **Eidos 运行时（Runtime）**：拥有逻辑能力校验、行变更事务规划以及在虚拟表上投影视图的所有权。
- **Eidos 适配器（Adapter）**：拥有底层原生扩展的动态加载、模块完整性校验及宿主文件系统访问权限的所有权。
- **虚拟表模块（Virtual Table Module，如 `fs_meta`）**：拥有对外部物理实体的访问、索引约束处理与扩展属性读写的所有权。

## 2. 设计不变量 (Invariants)

1. **外部权威性（SSOT）**：外部存储实体（如本地目录树和文件的扩展属性）是虚拟表数据行的唯一事实来源。虚拟表**绝不能**在 `.eidos` SQLite 数据库内部生成存储用户数据行的物理 B-Tree 数据页面。
2. **元数据持久性**：保存的视图（`eidos__views`）、字段属性定义（`eidos__fields`）、视图筛选器（`eidos__view_filters`）与排序规则（`eidos__view_sorts`）属于 `.eidos` 数据库内的规范状态，**必须**在会话间稳定持久化，并纳入 Graft 版本追踪。
3. **能力集诚实性**：虚拟表显式声明其变动能力（`insert`、`delete`、`update`、`alterSchema`）。运行时和 UI **必须**忠实遵循该能力集，严禁向用户暴露或执行能力集之外的操作。
4. **宿主沙箱安全**：一个 `.eidos` 文件**严禁**触发执行未经许可的原生二进制代码。宿主适配器**必须**实施严格的白名单机制，仅允许加载预授权的虚拟表模块。

## 3. 特性声明 (`eidos__features`)

包含虚拟表的 `.eidos` 数据库**必须**按照 Eidos 文件格式 1.0 第 13 节的要求，在 `eidos__features` 注册依赖：

```sql
INSERT INTO eidos__features (name, required, config_json)
VALUES (
  'vtab:fs_meta',
  1,
  '{"module":"fs_meta","root":".","namespace":"space.eidos.meta"}'
);
```

- **`name`**：**必须**遵循 `vtab:<module_name>` 格式，其中 `<module_name>` 为引擎标识（例如 `vtab:fs_meta`）。
- **`required`**：声明为 `1`。缺少该模块的阅读器或编写器**必须**拒绝规范写操作，并显式报告 `unsupported-feature: vtab:<module_name>`。
- **`config_json`**：包含模块初始化所需参数的规范 JSON 对象。

## 4. 表元数据与能力集 (`eidos__tables`)

虚拟表在 `eidos__tables` 中注册为用户表格。

### 4.1. SQLite 物理模式

底层物理表通过 SQLite `CREATE VIRTUAL TABLE` 语句创建：

```sql
CREATE VIRTUAL TABLE "files" USING fs_meta(
  root = '.',
  namespace = 'space.eidos.meta',
  fields = 'tags TEXT, rating INTEGER, status TEXT'
);
```

### 4.2. `settings_json` 模式

`eidos__tables.settings_json` 文本**必须**包含 `vtab` 配置块：

```json
{
  "tableType": "virtual",
  "vtabModule": "fs_meta",
  "capabilities": {
    "insert": false,
    "delete": false,
    "update": true,
    "alterSchema": true
  },
  "vtabConfig": {
    "root": ".",
    "namespace": "space.eidos.meta"
  }
}
```

#### 属性说明：

- **`tableType`** (`"virtual"`): 显式标识该表为虚拟表。
- **`vtabModule`** (`string`): 对应 `vtab:<module>` 的模块名称。
- **`capabilities`** (`object`):
  - **`insert`** (`boolean`): 若为 `false`，则数据行集合完全由外部来源决定。UI **必须**隐藏所有行插入交互（如表格底部的空白追加行、“+ 新建行”按钮）。运行时收到 `kind: "create"` 的 `mutateRows` 请求**必须**立即拒绝。
  - **`delete`** (`boolean | "clear_meta"`): 若为 `false`，禁止删除行。若为 `"clear_meta"`，删除操作仅重置该行在外部存储中的自定义元数据，不物理删除文件实体。
  - **`update`** (`boolean`): 若为 `true`，支持对可写自定义字段进行单元格更新。
  - **`alterSchema`** (`boolean`): 若为 `true`，支持在 `eidos__fields` 中动态增加、重命名或移除用户自定义列。
- **`vtabConfig`** (`object`): 传递给模块的特定初始化参数。

## 5. 字段模式与标识放宽 (`eidos__fields`)

### 5.1. 主键 (`row-id`) 放宽规则

标准 Eidos 文件格式 1.0 要求每行必须使用 UUIDv7 作为 `_id`。
在 `EF-VTab-1.0` 规范下：

1. 绑定到 `system_role = 'row-id'` 的虚拟表主键列**允许**使用非 UUIDv7 的规范字符串标识符，前提是该标识符具有唯一性、非空且排序确定（例如 UTF-8 POSIX 相对文件路径）。
2. 该标识符**严禁**包含空字符（`\0`）。
3. 该主键列是不可变且只读的。

### 5.2. 字段分层划分

虚拟表中的字段划分为两个层级：

| 类别              | 描述                                                                                                                              | `writable` | 物理列属性       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------- |
| **系统内置/派生** | 由外部来源固有生成的只读属性（如 `_id`、`name`、`path`、`extension`、`size`、`mimetype`、`_created_at`、`_updated_at`、`file`）。 | `false`    | 虚拟表固有只读列 |
| **User Custom**   | 存储在外部元数据封装中的可编辑属性（如 `tags`、`rating`、`status` 等）。                                                          | `true`     | 虚拟表动态可写列 |

系统内置字段**必须**在其 `settings_json` 中包含 `isSystem: true`、`readOnly: true` 及 `writable: false`。符合规范的 UI 与运行时必须确保这些列在表格中不可编辑、不可删除、不可转换类型：

- **`name`** (`type: "text"`): 物理文件名，指定为记录标题字段（`label_field_id`）。
- **`path`** (`type: "text"`): 规范 POSIX 相对路径，与 `_id` 的值完全一致。
- **`extension`** (`type: "select"`): 文件扩展名，在表格中渲染为单选标签胶囊，内置 `options: []`。
- **`size`** (`type: "integer"`): 物理文件字节大小。
- **`mimetype`** (`type: "text"`): 基于文件后缀推导的 MIME 媒体类型（如 `image/png`、`text/plain`、`application/pdf`），方便通过单条件前缀或包含规则筛选媒体分类（如 `starts with image/`）。
- **`file`** (`type: "file"`): 系统内置文件附件引用。

默认用户自定义元数据字段包含：

- **`tags`** (`type: "multi-select"`): 多选标签，在扩展属性中持久化为 JSON 字符串数组。
- **`rating`** (`type: "integer"`): 0–5 分评分，配置 `settings_json: { "control": "rating", "display": { "kind": "rating", "min": 0, "max": 5 } }`，在 UI 中直接渲染为可交互的星级评分控件。

每个虚拟表**必须**指定一个字段作为记录标题字段（`eidos__tables.label_field_id`）。对于文件系统虚拟表，该字段**必须**指向 `name`（文件名）字段。

### 5.3. 系统内置 `file` 附件字段

针对文件系统虚拟表（`fs_meta`），系统提供内置的 `type: "file"` 字段（对应虚拟表物理列 `file TEXT`）：

1. `file` 列动态评估为符合 RFC 8785 规范的 Eidos File 附件 JSON 数组：
   ```json
   [
     {
       "id": "<uuid-v7>",
       "mediaType": "<mime>",
       "name": "<filename>",
       "size": "<size>",
       "uri": "<rel_path>"
     }
   ]
   ```
2. 当目标路径为目录时，`file` 列评估为 `NULL`。
3. 附件 `id` 是基于相对路径生成的确定性 UUIDv7，确保在重扫、过滤和重新查询时 ID 保持稳定不变。
4. 附件 `uri` 为相对 POSIX 路径，其中的非 ASCII 或不安全字符均按 URI 规范进行百分比转义编码。
5. 在画廊视图（Gallery View）中，将 `layout_json.coverField` 指向此 `file` 字段 ID，画廊卡片即可直接从本地磁盘加载并渲染图片封面预览。
6. 宿主运行时通过既有的 `resolveEidosFileAttachment` 机制，自动将 `uri` 解析为相对于 `files.eidos` 所在目录的本地物理文件。

## 6. 运行时语义 (`ER-VTab-1.0`)

符合 `ER-VTab-1.0` 的运行时实现必须满足以下操作契约：

### 6.1. 查询编译

1. `queryRows` 对底层物理虚拟表生成规范 SQL `SELECT` 语句。
2. 过滤条件（`EidosFilterCondition`）与排序规则（`EidosSortCondition`）转译为 SQL `WHERE` 与 `ORDER BY` 子句，以触发 SQLite `xBestIndex` 的索引优化与下推。

### 6.2. 变更执行与约束

当调用 `mutateRows` 时：

1. **新建行 (`kind: "create"`)**：若 `capabilities.insert` 为 `false`，运行时**必须**立即中止事务并返回：
   ```json
   {
     "code": "table-mutation-not-supported",
     "message": "Virtual table does not support row creation"
   }
   ```
2. **更新行 (`kind: "update"`)**：
   - 运行时**必须**校验目标列仅限于可写的自定义字段。
   - 任何试图更新系统角色字段（`row-id`、`created-time`、`updated-time`）或只读属性的行为均必须被拒绝并报错 `read-only-field`。
   - 合法变更通过标准 SQL `UPDATE` 分发：
     ```sql
     UPDATE "files" SET "tags" = ? WHERE "_id" = ?;
     ```
3. **删除行 (`kind: "delete"`)**：
   - 若 `capabilities.delete` 为 `false`，运行时报错 `table-mutation-not-supported`。
   - 若为 `"clear_meta"` 或 `true`，运行时向虚拟表发出：
     ```sql
     DELETE FROM "files" WHERE "_id" = ?;
     ```

### 6.3. 版本号递增规则

- 任何修改 `eidos__views`、`eidos__fields` 或表配置的元数据事务，**必须**按照 Eidos 文件格式 1.0 第 14 节递增 `eidos__meta.revision` 并更新时间戳。
- 纯粹修改外部扩展属性（如修改标签）的单元格变更，若未引起 `.eidos` SQLite 数据页物理变更，可由事务协调器决定是否递增轻量修订号。

## 7. 适配器与宿主生命周期 (`EA-VTab-1.0`)

符合 `EA-VTab-1.0` 的适配器负责平台执行边界：

1. **扩展加载管控**：宿主适配器仅允许在授权的数据库连接初始化阶段启用扩展加载能力（`enableLoadExtension(true)`）。
2. **模块白名单**：宿主**必须**维持严密的虚拟表模块白名单，任何加载未授权模块的尝试均**必须**被拦截拒绝。
3. **二进制解析**：针对已声明的 `fs_meta` 模块，宿主根据运行平台自动定位对应的预编译二进制库：
   - macOS arm64 / x86_64: `libfs_meta.dylib`
   - Linux x86_64: `libfs_meta.so`
   - Windows x86_64: `fs_meta.dll`
4. **环境隔离**：原生动态库必须随桌面应用程序打包，或在运行前进行加密哈希完整性校验。

## 8. 具体引擎规范：`fs_meta` Profile

`fs_meta` Profile 定义了文件系统元数据虚拟表的标准对接实现：

### 8.1. 模块参数

- **`root`**：扫描目录的路径，相对于所属 `.eidos` 数据库所在目录（包括附加数据库），而非宿主进程工作目录。默认为 `'.'`。Lite 新建文件保存相对路径；已有绝对路径保留明确绑定，不自动迁移。SQL 字符串参数必须解码双写的引号分隔符。Lite 使用原生扩展前要求 `fs_meta_root_mode()` 返回 `database`。
- **`namespace`**：操作系统扩展属性的命名空间键，默认**必须**为 `space.eidos.meta`。
- **`fields`**：用户自定义字段列表声明（包含字段名与 SQLite 亲和类型）。

### 8.2. 默认字段映射表

| 字段名称      | 类型       | 系统角色         | 是否可写 | 说明                            |
| ------------- | ---------- | ---------------- | -------- | ------------------------------- |
| `id` / `_id`  | `text`     | `row-id`         | `false`  | 相对 POSIX 路径                 |
| `name`        | `text`     | 无（标题 Label） | `false`  | 文件或文件夹基本名称            |
| `extension`   | `text`     | 无               | `false`  | 文件后缀名（不带点）            |
| `size`        | `integer`  | 无               | `false`  | 文件字节数大小                  |
| `mimetype`    | `text`     | 无               | `false`  | 推导的 MIME 媒体类型            |
| `file`        | `file`     | 无               | `false`  | 附件 JSON 对象数组              |
| `_created_at` | `datetime` | `created-time`   | `false`  | 文件系统创建时间 (ISO 8601 UTC) |
| `_updated_at` | `datetime` | `updated-time`   | `false`  | 文件系统修改时间 (ISO 8601 UTC) |

## 9. Graft 版本控制兼容性

1. **虚拟行透明性**：虚拟表在 SQLite `sqlite_schema` 中登记的 `rootpage = 0`。Graft 的 `graft-sqlite` 引擎在进行行级差异对比（Row-level diff）与合并时，天然将其识别为 `OpaqueChangeReason::VirtualTable` 并安全跳过。
2. **模式与视图的版本化**：虚拟表的 DDL 记录以及所有 `eidos__*` 元数据（视图排版、筛选器、排序规则、自定义字段定义）作为标准关系表被 Graft 完整记录和版本化。
3. **多端协作合并收敛**：包含虚拟表的 `.eidos` 文件在协同拉取、分支切换与合并时，能无缝借助 [Eidos 系统元数据合并规范 1.0 (Eidos System Metadata Merge 1.0)](./eidos-system-metadata-merge-1.0.zh.md) 自动收敛视图与列变动，而不会与文件系统物理文件产生冲突。
