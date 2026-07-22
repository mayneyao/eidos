# Eidos File：开放、本地优先的多维表格格式

Eidos File 是保存在单个 `.eidos` 文件中的多维表格。它本质上是标准 SQLite 数据库，同时包含记录、字段类型、关系与持久化视图。这个文件既能在 Eidos 中使用，也能被普通 SQLite 工具检查，还能接入基于公共 package 构建的应用。

![一个 Eidos File 分别呈现为 Grid、Kanban 与 Gallery，所有视图共享同一份记录。](/eidos-file-model.png)

Grid、Gallery、Kanban 与自定义视图，只是处理同一份记录的不同方式。视图保存查询和呈现状态，不会复制数据表。

## 在编辑器中体验

1. 返回 [Eidos File 编辑器](/)。
2. 选择**打开 .eidos 文件**、打开内置的 2,500 行示例，或选择一个模板。
3. 体验项目组合、客户关系、个人财务、阅读书库、习惯追踪和内容日历。这些文件共同覆盖 Formula、Relation、Lookup、Select、Multi-select、日期、附件、持久化筛选、分组、统计、Gallery 与 Kanban。
4. 保存原文件，或下载新的副本。

获得授权后，Chromium 系浏览器可以把修改写回原文件；其他浏览器使用明确的副本流程。两种模式都只在本地通过 SQLite WASM 与 Web Worker 处理数据库。

## 文件会携带什么

- 用户数据表与稳定的记录标识；
- 字段名称、类型、选项、Formula、Lookup 与 Relation；
- 包含筛选、排序、字段顺序和布局属性的持久化视图；
- 文件标识与格式版本。

不受当前宿主支持的自定义视图类型仍会保留在文件中。宿主可以临时回退到 Grid，但不应删除自己无法理解的视图元数据。

## 直接使用或基于它构建

| 路径                         | 适用场景                                                                |
| ---------------------------- | ----------------------------------------------------------------------- |
| Eidos File 编辑器            | 直接在浏览器中打开或编辑本地文件。                                      |
| Eidos Desktop                | 将 Eidos File 与文档、附件、本地 AI 和版本历史一起使用。                |
| `@eidos.space/eidos-file`    | 使用 headless runtime、浏览器 adapter、保存生命周期或 Node connection。 |
| `@eidos.space/eidos-file-ui` | 使用 React View Host、共享编辑器 UI 或类型安全的自定义视图。            |

## 隐私与所有权

`.eidos` 文件始终是事实来源。编辑器不会把文件内容上传到 Eidos 服务器。需要恢复未保存工作时，浏览器可能保留一份私有本地 checkpoint；你可以在编辑器中丢弃，或通过清除站点数据将其删除。

编辑器和模板均支持中文与英文。切换界面语言时，编辑器会选择对应语言的模板文件；它绝不会翻译或改写已有文件中用户创建的名称与数据。

阅读[格式参考](format.zh.md)了解稳定的 SQLite 契约，或使用已公开的 `1.0.0` package [基于 Eidos File 构建](build.zh.md)。
