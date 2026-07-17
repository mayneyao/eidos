# Eidos File：开放、本地优先的多维表格格式

Eidos File 是保存在单个 `.eidos` 文件中的可携带多维表格。它本质上是标准 SQLite 数据库，同时包含记录、字段类型、关系与视图。你可以用 Eidos 打开，也可以用 SQLite 工具检查，或构建自己的兼容应用。

Eidos File 默认在本地工作。使用 Eidos File Web Editor 打开文件不需要账号，也不会把数据库上传到服务器。

## 打开并编辑 Eidos File

1. 打开 [editor.eidos.space](#/)。
2. 选择**打开 .eidos 文件**，或先体验内置示例。
3. 在 Grid、Gallery 或 Kanban 中编辑记录与字段。
4. 保存修改。

获得授权后，Chromium 系浏览器可以将修改写回原文件。其他浏览器使用明确的副本流程：编辑器导入一份浏览器内的私有工作副本，保存时下载新的 `.eidos` 文件，不会假装替换了原文件。

## 一个文件包含什么

Eidos File 将理解和呈现数据所需的信息保存在一起：

- 一个或多个用户数据表；
- 字段名称、类型、选项与关系；
- 包含筛选、排序、顺序和布局属性的视图；
- 文件标识与格式版本；
- Formula 与 Lookup 定义。

Grid、Gallery、Kanban 和自定义视图读取同一份记录。视图只是呈现方式和查询状态，不会复制数据表。

## 选择适合的使用方式

| 工具                         | 适用场景                                           |
| ---------------------------- | -------------------------------------------------- |
| Eidos File Web Editor        | 无需安装应用，直接打开或编辑本地 `.eidos` 文件     |
| Eidos Desktop                | 将 Eidos File 与文档、附件、扩展和本地 AI 一起管理 |
| SQLite 工具                  | 检查原始值，或接入已有数据工作流                   |
| `@eidos.space/eidos-file`    | 构建兼容 runtime、导入导出工具或宿主应用           |
| `@eidos.space/eidos-file-ui` | 嵌入共享编辑器，并注册自定义视图 renderer          |

## 数据所有权与隐私

你的 `.eidos` 文件是事实来源。Web Editor 在浏览器 Worker 中使用 SQLite WASM 处理文件，文件内容不会发送到 Eidos 服务器。

存在未保存修改时，浏览器恢复存储可能保留一份本地私有工作副本。你可以从编辑器中丢弃该副本；清除此站点的浏览器数据也会将其删除。

## 使用 Graft 进行版本管理

Eidos File 定义文件格式与多维表格行为；Graft 为 SQLite 增加类 Git 的版本管理能力，包括提交、行级差异、分支、恢复与仓库同步。

打开[版本管理](https://graft.eidos.space/)，了解 Graft 如何为 SQLite 数据库提供版本控制。版本管理始终是明确、可选的工作流；使用 `.eidos` 文件并不依赖 Graft。

## 继续阅读

- [Eidos File 文件格式 v1](#/docs/format)——稳定的 SQLite 契约与值编码。
- [构建 Eidos File 编辑工具](#/docs/runtime)——连接文件、Worker、Runtime、保存状态与共享 UI。
- [构建自定义视图](#/docs/custom-views)——组合共享 UI 并注册 renderer。
