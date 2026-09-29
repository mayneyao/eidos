# Eidos 插件迁移指南

如果你的插件在视图声明中使用 `context`，或通过 `ctx.editor`、`ctx.table` 等入口调用接口，按以下步骤更新。
先备份源码和安装包，再调整声明与调用路径，最后使用已有设置和测试文件验证插件。

## 1. 保留基线

保留旧源码、锁文件与安装包，在分支上用真实数据副本验证。
保留插件及贡献项 ID，让已保存视图、文件关联、设置、凭据和私有存储保持原有身份。
分发迁移版时增加插件包版本；如果插件自己的状态 schema 改变，单独提供迁移和降级方案。

## 2. 修改 manifest

View 的 context 改为 kind；Action 的 context 保持不变。

| 旧 View context | 新 kind | capabilities                     |
| --------------- | ------- | -------------------------------- |
| page            | page    | 不填写                           |
| document        | file    | ["document"]                     |
| eidos           | file    | ["eidos/schema", "eidos/config"] |
| table           | file    | ["eidos/table"]                  |
| file 或 media   | file    | 不填写，通过 filesystem／流访问  |

Eidos 能力可以组合声明：读取文件结构需要 eidos/schema，操作当前表格需要 eidos/table，
读写本插件配置需要 eidos/config。按实际使用的接口选择；document 不能与 Eidos 能力组合。
通用 file view 不再因扩展名自动获得 document/Eidos 能力，旧插件若依赖该行为，必须显式声明。
保留 placement 和 ID。table/view 仍存在，对应具有 eidos/table 能力的 file view；
navigation 和 plugin/settings 对应 page。

```json
{
  "apiVersion": 1,
  "id": "example.csv",
  "name": "CSV",
  "version": "0.2.0",
  "requires": { "pluginApi": "3.0.0" },
  "views": [
    {
      "id": "editor",
      "title": "CSV",
      "kind": "file",
      "capabilities": ["document"],
      "access": "write",
      "entry": "./src/main.ts"
    }
  ],
  "placements": [
    { "location": "file/open", "view": "editor", "extensions": [".csv"] }
  ]
}
```

可执行插件，包括 CLI 表格视图，声明 requires.pluginApi 为 3.0.0。
Lite 与 Serve 使用相同 major，但 Serve 仍不支持 action、文件系统等 Lite 专属能力。
主题保留数据契约与 CSS，不转成 View。旧 View context 字段直接拒绝，不做隐式适配。

## 3. 将操作移到 capabilities

| 旧入口                                             | 新入口                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| ctx.editor / ctx.binding.document                  | ctx.capabilities.document                                           |
| ctx.table / ctx.binding.table                      | ctx.capabilities.eidos.table                                        |
| ctx.eidos / Eidos view 的 ctx.binding.file         | ctx.capabilities.eidos.schema / .config                             |
| ctx.file / media binding 元数据                    | ctx.binding.file                                                    |
| ctx.fs/ui/storage/network/settings                 | ctx.capabilities.fs/ui/storage/network/settings                     |
| activate 的 ctx.actions / ctx.formatters           | ctx.capabilities.actions / ctx.capabilities.formatters              |
| 表格 provider 的 ctx.table/target/task/connections | ctx.capabilities.eidos.table + capabilities.target/task/connections |
| ctx.signal / ctx.subscriptions                     | 不变                                                                |

不能全局替换 binding.file：旧 Eidos binding 内是操作对象，普通文件／媒体 binding 内是元数据。
文件视图 binding.kind 统一为 file；通过能力存在性判断，而不是继续检查 document/table/eidos/media kind。
表格定位还可从 binding.location 获取。文档 Action 的 binding 变为文件身份，实际编辑能力放在 capabilities。

```ts
import type { Mount } from "@eidos.space/plugin-sdk"

const mount: Mount = async (ctx, root) => {
  if (!ctx.capabilities.document)
    throw new Error("Document capability required")
  const document = ctx.capabilities.document
  const observed = await document.observe((snapshot) => {
    if (!ctx.signal.aborted) root.textContent = snapshot.text
  })
  ctx.subscriptions.add(observed.subscription)
  if (!ctx.signal.aborted) root.textContent = observed.snapshot.text
}
export default mount
```

Document edit 接收 `{ text, expectedVersion }`。
保留编辑串行化、过期／冲突处理、保存、编码、undo/redo 与可恢复草稿。
不能直接覆盖较新数据或改用 fs.writeText。
直接写入、删除、重命名遇到插件服务中已有工作副本时返回 BUSY；
文本更新使用 document.edit/save；删除或重命名应向用户呈现 BUSY 错误。
关闭视图不意味着其缓存的工作副本已经释放。

### 将 Eidos 操作归入对应接口

如果已经使用 capabilities，仍需检查以下入口：

manifest 中的 `table` 改为 `eidos/table`，使用配置时额外声明 `eidos/config`；`eidos` 按实际用途改为 `eidos/schema` 和／或 `eidos/config`。导入的接口类型也要更新：命名空间使用 `EidosCapabilities`，结构接口使用 `EidosSchema`，配置接口使用 `EidosConfig`，替换原来的 `EidosFileContext` 和 `TablePluginConfig`。配置调用需要显式传入 tableId，返回快照使用 `EidosConfigSnapshot`。

| 原调用                                                          | 更新后的调用                                           |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| capabilities.table                                              | capabilities.eidos.table                               |
| eidos.listTables() / eidos.readTable(id)                        | eidos.schema.listTables() / eidos.schema.readTable(id) |
| table.pluginConfig.read()                                       | eidos.config.read(table.tableId)                       |
| table.pluginConfig.write(input)                                 | eidos.config.write(table.tableId, input)               |
| table.pluginConfig.observe(listener)                            | eidos.config.watch(table.tableId, listener)            |
| eidos.readPluginConfig(id) / eidos.writePluginConfig(id, input) | eidos.config.read(id) / eidos.config.write(id, input)  |
| eidos.connections                                               | capabilities.connections                               |

本表中的 eidos 指 `ctx.capabilities.eidos`。如果原来将配置接口赋给局部变量，也要修改其 read/write/watch 参数。
文件视图可选择绑定文件内的表格；表格视图只能使用当前 tableId，额外声明 schema 不会扩大配置范围。
表格动作的 getItems 和 run 使用 eidos.table 与只读 eidos.config；target、task、connections 的位置不变。

```ts
const { table, config } = ctx.capabilities.eidos ?? {}
if (!table || !config) throw new Error("Table and config capabilities required")
const current = await config.read(table.tableId)
await config.write(table.tableId, {
  value: { ...current.value, compact: true },
  expectedVersion: current.version,
})
```

此示例的视图需要同时声明 eidos/table、eidos/config 和 access: write。
配置仍保存在原表格的同一插件命名空间，不需要搬迁数据或重置用户设置。

## 4. 检查宿主差异

宿主可能不提供的服务在共享类型中为可选。View 只有 settings.get，Lite Action 另有 set/reset。
不再暴露不可用的 settings.observe、ui.select/confirm。
ui.openFile/navigate 与 eidos.config 为可选，调用前判断，提供降级或明确拒绝不支持的宿主。
需要选择或确认界面时，在插件内实现相应交互。

```ts
ctx.subscriptions.add(
  ctx.capabilities.actions.register("open", async (action) => {
    const { ui } = action.capabilities
    if (!ui.navigate) throw new Error("This action requires page navigation")
    await ui.navigate("main", "/")
  })
)
```

表格 provider 的解构参数也要修改：`getItems({ capabilities: { eidos: { table, config } }, signal })`。
原有分页、readToken、task.report 和 undo 语义不变。
取消会保留已完成的记录修改；请让用户看到已完成和未完成的范围。

## 5. 核对权限和已有状态

Workspace Action 的 context 不再隐式提供工作区文件权限，确需访问时声明 workspace.files。
可写 page 还需显式 access: write。只读贡献项不能继承包级工作区写授权。
文件视图的访问范围仍受当前文件及其目录约束。

保留 Space 启用状态、settings/connection ID、table pluginConfig 命名空间、view properties、
字段 ID 和私有存储 key。保留乐观版本检查及未知字段。
凭据留在宿主，不导出到迁移夹具；现有模型连接行为不变。
仅迁移 API 路径不要求数据 schema 升级。不能通过换插件 ID 绕过迁移，因为那会创建新的身份。

## 6. 构建和验证

更新项目的 SDK 和开发工具，确认它们支持 manifest 中声明的 API，并提交更新后的锁文件。在插件目录运行：

```sh
npx @eidos.space/plugin-tools check . --target lite
npx @eidos.space/plugin-tools pack .
```

如果同时支持 CLI Serve，执行 `check . --target cli`，再用 `eidos --json plugin doctor /absolute/plugin.eidos-plugin` 检查包，确认 `compatible` 为 `true`。

搜索旧入口后，人工核对别名与解构：

```sh
rg -n 'ctx\.(editor|table|eidos|file|fs|ui|network|storage|settings|actions|formatters)\b|binding\.(document|table|media)\b' src
rg -n 'capabilities\.table|pluginConfig|readPluginConfig|writePluginConfig|eidos\.(listTables|readTable|connections)' src
rg -n '"context"|"requires"|"capabilities"' plugin.json
```

Action context 命中是正常的，View 不能保留旧 context。

| 验收场景         | 必须满足                                                                   |
| ---------------- | -------------------------------------------------------------------------- |
| 每个 placement   | 贡献项 ID 和资源不变，View binding 只有 page/file                          |
| 文本编辑         | 保存重开、undo/redo、过期编辑、外部冲突和未保存草稿均保留内容              |
| 文件／媒体       | 流与释放正常，未声明的 document/Eidos 能力不存在                           |
| 表格视图／action | 查询与配置范围不变，分页、派生字段拒绝、过期 token、取消和部分撤销经过验证 |
| 授权             | 无 files 授权的 workspace action 被拒绝，包有写授权也不能让只读贡献项写入  |
| 状态升级         | 旧设置、配置、关联和私有数据保留，凭据不离开宿主                           |
| 生命周期         | 重挂载不泄漏订阅，不重跑已完成的数据修改                                   |
| 宿主兼容         | 每个承诺支持的宿主都验证，旧不兼容包保持可管理且不会被偷偷执行             |

完成验证后，增加插件版本并发布新的安装包。记录依赖版本、已测试的运行环境和回退方法，保留上一版安装包。回退代码后，已写入的用户数据仍然存在；涉及数据结构变化时需要对应的数据恢复方案。

## API 命名迁移

| 原 API                                        | 当前 API                          |
| --------------------------------------------- | --------------------------------- |
| table.read()                                  | table.readContext()               |
| table.getPage(options)                        | table.readRows(options)           |
| table.updateProperties(value)                 | table.setViewConfig(value)        |
| table.observe(listener)                       | table.watch(listener)             |
| config.observe(tableId, listener)             | config.watch(tableId, listener)   |
| target.read(options)                          | target.readRows(options)          |
| task.preview(samples)                         | task.declareOutputs(samples)      |
| connections.configured(id)                    | connections.isConfigured(id)      |
| settings.update(key, value)                   | settings.set(key, value)          |
| storage.remove(key)                           | storage.delete(key)               |
| FileContext                                   | FileMetadata                      |
| TableContext / TableViewSnapshot              | EidosTable / EidosTableSnapshot   |
| EidosPluginConfig / TablePluginConfigSnapshot | EidosConfig / EidosConfigSnapshot |
| Settings                                      | PluginSettings                    |

`declareOutputs` 返回 `Promise<void>`。删除基于布尔返回值的分支，直接 `await task.declareOutputs(samples)`；校验失败会抛出错误。`setViewConfig` 完整替换当前视图的插件配置，需要保留的字段应先合并。`watch` 只发送失效通知；`document.observe` 返回初始快照及后续更新。

删除 manifest 中的 `resources`、动作的 `configuration` 和 `multiple`。删除对 `ResourceDeclaration`、`ActionConfiguration`、`ActionConfigProperty`、`TableActionInstance`、`GrantedDataMethod`、`GrantedDataClient`、`GrantedRuntimeMethod`、`GrantedRuntimeClient` 和 `EidosResource` 的导入。普通动作的 binding 只有 workspace/file；表格操作使用 provider 上下文。普通动作没有 `capabilities.eidos`，`settings.observe` 不可用。旧名称没有别名。
