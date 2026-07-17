# RFC：原生 File Space Agent Runtime

状态：集成交付候选
日期：2026-07-17
Owner：Eidos

相关 RFC：

- `eidos-space-markdown-runtime.zh.md`
- `eidos-base-file-format.zh.md`
- `eidos-file-based-extensions.zh.md`
- `eidos-graft-space-versioning.zh.md`

## 摘要

Eidos 明确保留两个 Agent runtime，而不是让新 File Space Agent 兼容旧
DataSpace Agent：

1. **Legacy DataSpace Agent Runtime**：继续由
   `packages/ai/server/agent-api.ts`、旧 DataSpace、旧 session store 与旧 tools
   服务旧产品链路。
2. **Native File Space Agent Runtime**：由
   `apps/desktop/electron/modules/file-space-agent/file-space-agent-runtime.ts`
   独立组装 AI SDK `ToolLoopAgent`，只接受 file-based Space 的原生 host tools。

两个 runtime 可以共享 AI SDK、provider resolver、thinking 配置、Skills toolkit
和展示组件；这属于 library/UI 复用，不是 runtime 兼容。新 runtime 不调用
`prepareAgent`，不创建 legacy DataSpace，不挂载旧 Bash/VFS，不暴露旧 `eidos`
CLI tools，也不导入旧 `{id}.meta.json + {id}.jsonl` session。

Native File Space Agent 可以通过正式 host service：

- 列出、搜索、读取、新建、修改、移动与删除 Space 文件；
- 创建、编辑、检查、授权、信任、启停和运行 File-Based Extensions；
- 检查 Graft 状态、历史和 diff，并执行 enable、stage、unstage、commit、discard、
  restore、remote sync 与 conflict resolution；
- 读取 Markdown、图片、Base snapshot 和 Base rows；
- 在 tab 关闭后继续由 Electron main 执行，并以 durable journal 恢复 UI。

## 产品与导航边界

共享 Sidebar Work Modes 拥有 Files、Version、Agent 顶层入口、快捷键和模式状态。
本 RFC 只拥有 Agent mode 内部的 conversation panel 和 `/agent/:conversationId`
内容页，不重排公共 shell。

Files 是 canonical Space 资源入口；Agent 是推理与操作入口；Version 是用户审阅
工作树与历史的入口。Agent 可以调用版本工具，但不能直接读取或修改 `.graft/`。

成熟的消息 UI 继续复用 `apps/web-app/components/ai-agent/`，包括 streamed
Markdown、reasoning、tool timeline、usage、Stop、Retry、edit/regenerate、Fork、
Copy、outline 和完成音效。UI 复用不要求 runtime 或 session 格式兼容。

## 双 Runtime 边界

| 边界           | Legacy DataSpace Agent            | Native File Space Agent                   |
| -------------- | --------------------------------- | ----------------------------------------- |
| 入口           | 旧 `/agent` API/channel           | Desktop `file-space-agent` IPC            |
| 组装           | `prepareAgent` / `handleAgentApi` | `prepareFileSpaceAgentRuntime`            |
| canonical data | DataSpace/SQLite                  | Space files、`.base`、`.eidos/extensions` |
| tools          | legacy Bash/VFS/eidos/web tools   | typed Space/Extension/Version/Base tools  |
| session        | 旧 sidecar/session store          | `<id>/meta.json + events.jsonl`           |
| approval       | legacy permission server          | Electron main 的 run-scoped approval      |
| lifecycle      | request/renderer 链路             | Electron main background run              |

禁止在 Native runtime 中增加以下 fallback：

- `prepareAgent` 或 `handleAgentApi`；
- legacy DataSpace、`AgentSessionStore` 或旧 session 自动导入；
- `createBashTool`、`createFileTools`、旧 VFS 或 legacy `eidos` command；
- legacy permission WebSocket；
- 直接 filesystem path、直接 `.base` SQLite 或直接 `.graft` 访问。

## 架构

```text
Agent tab / panel
  -> file-space-agent IPC
  -> FileSpaceAgentService（run、journal、approval、recovery）
       -> prepareFileSpaceAgentRuntime
            -> shared provider resolver + AI SDK ToolLoopAgent
            -> selected Skills toolkit
       -> SpaceManagementService
       -> FileExtensionService
       -> SpaceVersioningService
       -> Base runtime facade
```

`startRun` 在 main 中登记 `ActiveRun` 和 `AbortController`，随后以 detached promise
消费 `fullStream`。renderer 只轮询 durable event sequence；关闭 tab 只停止轮询，
显式 Stop 才 abort。应用退出后不能继续 provider stream，下一次启动把非终态 run
标记为 `interrupted`，不会自动重放 mutation。

## 文件与会话模型

```text
.eidos/agent/sessions/
  <conversation-id>/
    meta.json
    events.jsonl
.eidos/agent/local/
  preferences.json
```

Native store 只识别目录格式。旧 `<id>.meta.json` 和 `<id>.jsonl` sidecar 由旧
runtime 自己拥有，新 runtime 忽略且不删除它们。

`meta.json` 带 `formatVersion`，但不持久化本机 registry `spaceId` 或权限。
`events.jsonl` 的 envelope 带 `schemaVersion`，并保持 sequence 单调、checksum
chained、append + fsync。允许修复崩溃产生的最后半行；中间 checksum/sequence
错误或不支持的版本必须失败。连续 stream delta 会合并后落盘，轮询只读取新增 sequence。

审批模式是 main-owned 本机安全状态，存于不参与版本管理的
`.eidos/agent/local/preferences.json`。renderer 必须通过独立 IPC 修改它，`startRun`
传入的同名字段不构成权限来源。会话在另一台设备恢复时默认回到 Ask。

Files 将 `.eidos/agent/sessions/**` 暴露为受 Eidos 管理的只读 Space 内容，用户可以
查看和导出底层 conversation 文件。通用 Files 与 Agent 文件变更不能在这个根目录内
编辑、移动、新建或删除；conversation controls 仍是唯一受支持的写入入口。其他
`.eidos/agent/**` 运行时状态继续保持私有。

conversation 是否进入 Graft 仍由用户在每个 Space 的设置页决定，默认关闭。
Agent 不得替用户切换该隐私设置。开启仅改变 managed ignore，不自动 stage、commit
或 Push。

## Native Tool Surface

### Space files

| AI tool                  | Host service                       | 权限            |
| ------------------------ | ---------------------------------- | --------------- |
| `list_space_files`       | `SpaceManagementService.listFiles` | observe         |
| `search_space_files`     | `searchFiles`                      | observe         |
| `read_space_file`        | `readFile`                         | observe         |
| `create_space_file`      | `createFile`                       | approval        |
| `create_space_directory` | `createDirectory`                  | approval        |
| `write_space_file`       | digest-bound `writeFile`           | diff + approval |
| `move_space_path`        | `moveFile`                         | approval        |
| `delete_space_path`      | `removeFile`                       | approval        |

所有 path 必须是 Space-relative。`SpaceFiles` 负责 traversal/symlink containment，
隐藏 `.graft` 与 private `.eidos` state，但将 `.eidos/extensions/**` 作为公开、可版本
管理的 Extension source，并将 `.eidos/agent/sessions/**` 作为受管理的只读
conversation 文件公开。写入经 shared operation lock，并更新文件索引。

已有文本文件修改必须先 read 并提交精确 `contentDigest`；审批前显示 diff，写入时
同时校验 mtime 与 digest。Agent 不通过 shell 挂载 Space root。

### File-Based Extensions

| AI tool                                | 行为                                                                 |
| -------------------------------------- | -------------------------------------------------------------------- |
| `inspect_extensions`                   | discovery、manifest、source、diagnostics、trust/grants/runtime state |
| `create_extension`                     | 用 canonical template 创建 `.eidos/extensions/local.*`               |
| `uninstall_extension`                  | 卸载精确 snapshot，并清理其 runtime state                            |
| `read_space_file` / `write_space_file` | 编辑 manifest 与 source                                              |
| `trust_extension`                      | trust exact content/permission snapshot                              |
| `set_extension_grant`                  | grant/revoke exact files/network capability                          |
| `set_extension_enabled`                | enable/disable exact trusted snapshot                                |
| `run_extension_command`                | 执行 enabled exact snapshot command                                  |

Agent 不自造另一套 extension manifest，也不绕过 snapshot identity。创建、卸载、
trust、grant、enable 和 command execution 都在 main 中审批并审计。generic file tools
只能编辑现有 package 内部文件，不能创建、移动或删除 package root；源码修改后旧
snapshot 立即失效，必须重新 inspect。

### Graft Versioning

只读工具包括 status、history、diff、commit detail、conflicts 和 remotes。变更工具
包括 enable、stage、unstage、commit、discard、restore path/version、remote
configure/remove、fetch/pull/push 和 conflict resolution。

所有 mutation 调用 `SpaceVersioningService`，继承 repository lock、private-path
filter、managed ignore、expected-head、conflict 与 file refresh 语义。除首次 enable
外，Agent 必须先读取 status；guarded mutation 使用精确 current head。每次 mutation
或 external sync 均要求 Allow once/Deny。Agent 永远不能直接操作 `.graft/`。

### Base 与 Resource Context

`.base` 不能当普通文本文件写。当前 Agent 通过 `getBaseSnapshotReadOnly`、
`getBaseTableRow` 和 `getBaseTablePage` 读取 Base；后续 Base mutation 必须继续加入
Base Runtime typed API，不能使用文件覆盖。

active tab context capture 支持 Markdown selection/heading、普通文本、Base row、图片
和 binary metadata，并记录 digest/mtime/fingerprint/capturedAt。图片最大 10 MiB，
由 main 读取后作为 model file part 注入。

## 权限、审计与失败语义

- observe tools 自动执行，但仍产生 ToolRun audit。
- modify/external tools 在 main 中绑定 Space、conversation、run 和 ToolRun。Ask 全部
  询问；Approve for me 只自动批准安全 typed mutation；Full access 自动批准当前
  Space 内的 typed tools，但不会扩大到 Space 外或绕过参数验证。
- approval 等待 5 分钟后默认 Deny；关闭 tab 不改变等待状态。
- 并行 tool approval 以 run 为单位聚合；任一仍待确认时 run 保持 waiting。
- Stop abort provider 和 pending approval。
- tool input、resource、risk、preview、result/error 与状态转换写入 journal。
- 重启恢复时未执行完成的 tool 标为 `interrupted`；已批准但结果无法确认的 tool 标为
  `outcome-unknown`，要求检查目标后再重试。
- provider/tool failure 显示 Retry；stale digest/head/snapshot 在 host mutation 前失败；
  move/delete 在审批时记录递归 path fingerprint，并在执行前复验。
- Agent 不接收 credential value，也不能写 `.graft` 或 private `.eidos` state。

## 验收矩阵

| 需求              | 实现证据                                                                             | 自动化验证                                                               | Desktop 验收                                                        |
| ----------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 两个独立 runtime  | `agent-api.ts` 与 `file-space-agent-runtime.ts`；新 service 无 `prepareAgent` import | typecheck + static grep + service stream test                            | 旧 Agent 与 Agent mode 分别运行且 tools 不交叉                      |
| 不兼容旧 session  | native store 只扫描 conversation directory                                           | sidecar ignore/delete isolation tests                                    | 放入旧 sidecar，新 Agent panel 不导入也不删除                       |
| 后台 run          | main `activeRuns`、detached `executeRun`、journal                                    | stream/stop/recovery/parallel approval tests                             | 生成中关闭 tab，重新打开继续显示                                    |
| 文件完整 CRUD     | typed tools → `SpaceManagementService`                                               | search/read/write stale + create/move/delete approval tests              | 创建、改名、编辑、删除 Markdown；每次 mutation 可审阅               |
| Extension 编写    | create/edit/inspect/trust/grant/enable tools                                         | template + diagnostics + command approval tests；extension runtime smoke | Agent 创建 command Extension、修复 diagnostics、trust/enable 后执行 |
| 版本管理          | status/diff/stage/commit/restore/sync tools                                          | status→stage→commit approval test + versioning coordinator suite         | Agent 展示 changes，用户批准 stage/commit，再在 Version mode 查看   |
| conversation 隐私 | per-Space default-off setting + managed ignore                                       | settings/coordinator tests                                               | 默认不进入 status；用户开启后才可手工 stage                         |
| 本机权限边界      | `.eidos/agent/local/preferences.json` + 独立 IPC                                     | local-state fail-closed 与 run authority tests                           | 同步会话到另一设备后默认 Ask                                        |
| shared shell 边界 | Agent 只消费 Work Modes contract                                                     | sidebar tests                                                            | Files/Version/Agent 切换不丢 tab/state                              |

交付命令：

```bash
pnpm typecheck
pnpm --filter eidos smoke:file-agent
pnpm --filter eidos smoke:base-query
pnpm --filter eidos smoke:file-extension-runtime
pnpm build:desktop:dev
```

## RFC 所有权边界

- Space Markdown RFC 拥有 safe-save、selection 与 preview 语义。
- Base Runtime RFC 拥有 `.base` query/mutation；Agent 只调用 typed facade。
- File-Based Extensions RFC 拥有 manifest、compiler、snapshot trust、grant 和 sandbox；
  Agent 只编排正式 service。
- Graft Versioning RFC 拥有 repository、ignore、stage/commit/restore/sync/conflict；
  Agent 只编排 `SpaceVersioningService`。
- Sidebar Work Modes owner 拥有公共入口与 shell；本 RFC 不重排模式。
- 不修改 `/Users/mayne/workspace/graft`。
