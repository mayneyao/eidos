# Eidos 规范

状态：规范套件索引  
套件版本：1.0  
唯一规范语言：English

本目录把 Eidos 定义成四个可独立实现、契约 owner 唯一的层。工具只实现自己需要的层，并分别声明
conformance。实现源码、package API report、产品现状、旧 RFC 或中文译本都不能覆盖
这里的英文 normative specification。

Eidos Flavored Markdown 是实现中立的可移植内容语法 companion，不构成第五个产品
layer：Eidos 产品采用 EFM 时，File Format 与 Runtime 仍拥有 canonical
container/value meaning，Adapter 拥有资源 authority，UI 拥有交互。

## 开发者入口

希望使用 SDK 打开、查询或修改 `.eidos`，并理解一次操作如何经过 Runtime、SQLite
工作库和保存流程，请先读 [Eidos File 开发者快速上手](./eidos-file-developer-guide.zh.md)。
它是 non-normative 的伴随指南，提供可运行示例和实现原理，不会新增或改写本页列出的技术契约。

## 边界图

```text
UI ──calls──────────────► RuntimeClient
UI ──calls──────────────► HostServices
Runtime ──calls─────────► ConnectionPort / environment ports
Adapter composition ────► RuntimeHostBridge
Runtime ──interprets────► Eidos File Format
Adapter ──publishes─────► Eidos File Format
```

箭头表示 call/use 方向，不表示整个 layer 的依赖或规则 ownership。Runtime 与 Adapter
有两个刻意注入的窄边界：Adapter 提供 Runtime 调用的 ports，trusted Adapter
composition 则调用 Runtime 的窄 Host bridge。这不构成共享语义 ownership：Runtime
拥有 logical meaning，Adapter 拥有 platform behavior。

实现顺序是：

```text
File Format → Runtime → Adapter → UI
```

语义 ownership 只能单向：

- File Format 不依赖 Runtime API、平台或 UI；
- Runtime 不打开路径、不请求权限、不持有平台 handle；
- Adapter 不定义 Field、Formula、Lookup、Relation、query 或 mutation 语义；
- UI 以 Runtime public service 获取数据语义，并且只以 Adapter 的 high-level、
  capability-scoped HostServices 执行平台工作；它不接收 SQLite connection、native
  handle、generated SQL 或 canonical-file 写原语。

## 文档

| 层                    | 英文规范                                                                | 中文参考                                        |
| --------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| File Format           | [Eidos File Format 1.0](./eidos-file-1.0.md)                            | [中文](./eidos-file-1.0.zh.md)                  |
| Runtime               | [Eidos Runtime 1.0](./eidos-runtime-1.0.md)                             | [中文](./eidos-runtime-1.0.zh.md)               |
| Runtime merge profile | [Eidos System Metadata Merge 1.0](./eidos-system-metadata-merge-1.0.md) | [中文](./eidos-system-metadata-merge-1.0.zh.md) |
| Adapter               | [Eidos Adapter 1.0](./eidos-adapter-1.0.md)                             | [中文](./eidos-adapter-1.0.zh.md)               |
| UI                    | [Eidos UI 1.0](./eidos-ui-1.0.md)                                       | [中文](./eidos-ui-1.0.zh.md)                    |
| UI 标准视图           | [Eidos Standard Views 1.0](./eidos-standard-views-1.0.md)               | [中文](./eidos-standard-views-1.0.zh.md)        |
| 可移植内容语法        | [Eidos Flavored Markdown 1.0](./eidos-flavored-markdown-1.0.md)         | [中文](./eidos-flavored-markdown-1.0.zh.md)     |

## 文档组织规则

每个 layer 只有一份核心规范。只有当一个完整主题会让核心规范难以阅读时，才拆出
normative companion；companion 仍沿用同一 layer 的 ownership，通常也复用该 layer
已有的 conformance label。

同一 abstraction 的内建变体必须放在一起。因此 Grid、Gallery、Kanban、Calendar 与
Form 都是 Eidos 标准视图 1.0 的章节，而不是五份独立 profile。未来新增的内建 View
也加入这份文档。只有明确位于 standard baseline 之外的第三方或实验性 View 才可以
使用单独的 optional profile，并自行定义 label 与 prerequisite。

## 实现阶梯

每完成一层，就得到一个可独立测试和交付的边界：

| 步骤           | 实现的契约                                                                                      | 可交付结果                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1. File Format | SQLite identity/schema、raw encoding、reference、validity、atomic Writer postcondition          | 不需要 derived semantics 的 validator、inspector、canonical-data import/export 或 repair tool |
| 2. Runtime     | typed schema/value、query/evaluation、mutation、conversion、revision、validation public service | 不依赖 Browser/Desktop API 的 headless semantic processor、CLI、server engine 或 editor core  |
| 3. Adapter     | ConnectionPort、Host lifecycle/publication、Transport 与一个平台 profile                        | 对 durability、permission、cancellation、recovery 作出真实承诺的 Browser 或 Desktop 处理工具  |
| 4. UI          | 严格消费 RuntimeClient/HostServices 的 interaction contract                                     | presentation code 不持有 SQLite 或平台权限的可互换 viewer/editor/schema editor                |

需要解释 Formula、Lookup、Relation 的 headless tool 通常声明
`EF-Reader-1.0 ER-Reader-1.0`，再加适用的 `EA-Connection-1.0` 与平台
profile；它不需要 UI label。修改 canonical state 的工具还要增加对应 Writer 与
Host 要求。Raw File inspector 可以停在第一步，但不能声称实现 Runtime semantics。

这个阶梯是 artifact 的构建顺序，不是循环 ownership。第二步可以先让 Runtime 对照
Adapter 规范的 in-memory/reference `ConnectionPort` harness 实现和测试；第三步再提供
该固定 port 的真实平台实现，不能改变 Runtime semantics。

## 唯一规范来源

| 关注点                                                                                                            | 唯一 owner  |
| ----------------------------------------------------------------------------------------------------------------- | ----------- |
| SQLite container、application ID、metadata DDL、physical name、canonical raw value、commit revision postcondition | File Format |
| logical type、derived evaluation、query result、operation/revision concurrency、error                             | Runtime     |
| SQLite driver、file lifecycle、locking、persistence、Worker/process profile                                       | Adapter     |
| RuntimeClient/HostServices 消费、interaction state、editing affordance、accessibility                             | UI          |
| Markdown 源码模型、语法、解析优先级、语义渲染、序列化与 conformance                                               | EFM         |

上层可以摘要下层规则，但必须链接 owner，不能重新定义。出现冲突时以上表 owner 为准。

## Conformance labels

产品发布一个以空格分隔的 label 列表：

```text
EF-Reader-1.0
EF-Writer-1.0
ER-Reader-1.0
ER-Writer-1.0
ER-System-Merge-1.0
EA-Connection-1.0
EA-Host-1.0
EA-Browser-1.0
EA-Desktop-1.0
EU-Viewer-1.0
EU-Editor-1.0
EU-Schema-1.0
EFM-Parser-1.0
EFM-Renderer-1.0
EFM-Serializer-1.0
```

较高 label 不隐含无关 layer。`ER-System-Merge-1.0` 是可选的 draft Runtime profile，
要求 `EF-Reader-1.0`、`EF-Writer-1.0`、`ER-Reader-1.0` 与 `ER-Writer-1.0`，但
`ER-Writer-1.0` 不会自动隐含它。例如 headless CLI 可以声明
`EF-Reader-1.0 ER-Reader-1.0 EA-Desktop-1.0` 而没有 UI conformance。每份规范定义
自己的 prerequisite 与 required test family。Eidos 标准视图 1.0 是现有 UI label
必须遵循的 companion，不是可选 profile，也不增加新的 conformance label。

## 互操作完成标准

独立实现必须能够证明：

1. 同一 bytes/schema 得到相同 File validity；
2. 同一有效文件和 Runtime request 得到相同 typed value、order、error 和 revision effect；
3. 替换 conforming Adapter 不改变 Runtime-observable semantics；
4. conforming UI 可以替换 Runtime transport，而不接触 SQLite 或改变 canonical rules。

Example 与 implementation note 是 informative。Normative JSON shape、SQL、algorithm、
truth table、limit 与 test vector 属于各自 owning specification。分发 machine-readable
schema/vector 时，必须标明 owning specification/version，且不得静默扩展它。

## Change policy

Compatible clarification 可以增加 example 与 test，但不能改变已有 valid value 或
observable result。持久化含义变化升级 File Format version；logical result 或 public
operation 变化升级 Runtime；port/profile 变化升级 Adapter；required interaction behavior
变化升级 UI。

Design 与 implementation record 只作历史证据，不能修改本规范套件。

Eidos Flavored Markdown 语法、解析优先级或 canonical document meaning 的变化独立升级
EFM version，不要求同步升级四个产品 layer 的版本。
