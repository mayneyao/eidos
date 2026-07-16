# RFC：file-based Space 的 Agent 集成

状态：草案，P1 开发者预览
日期：2026-07-17
Owner：Eidos
相关 RFC：

- `eidos-space-markdown-runtime.zh.md`
- `eidos-base-file-format.zh.md`
- `eidos-space-base-storage.zh.md`
- `eidos-file-based-extensions.zh.md`
- `eidos-graft-space-versioning.zh.md`
- `eidos-legacy-space-migration.zh.md`

## 摘要

本 RFC 将 Agent 作为 file-based Space 的一等工作模式接入 Eidos。新链路
不会把旧 DataSpace Agent 后端重新接回 Desktop，而是由主进程持有会话和
运行，从真实 Space 文件与 Base snapshot 构建可解释上下文，并通过显式
权限边界调用类型化宿主工具。

首个交付切片必须让 Desktop 用户能够：

1. 从 Markdown 或 Base tab 打开 Agent；
2. 基于当前 Space 提问；
3. 查看回答实际使用的资源与工具调用；
4. 批准或拒绝 Agent 提出的 Markdown patch；
5. 关闭再打开 Agent tab，而不取消仍在运行的任务。

## 产品决策

### Agent 是内容 tab

Space 主侧边栏继续只有 Files 与 Version。Agent 以普通
`/agent/:conversationId` 内容 tab 打开，P1 入口位于 Space sidebar、命令面板
和快捷键。打开前先捕获 source tab，也允许在右侧 split 打开；可搜索的
conversation list 与 New Tab 入口属于 P2。

- Files 定位 canonical Space 资源。
- Agent 针对资源推理与执行。
- Version 审阅 canonical 资源的变化。

Agent 不自动 stage、commit、Pull 或 Push。Agent 修改的文件与用户修改一样
出现在 Version。conversation 默认保持私有；用户可以在每个 Space 的 Versioning
设置中明确同意，将 transcript、捕获的上下文、ToolRun、审批记录与附件作为普通
Space 变更纳入版本管理，但系统仍不会自动 stage、commit 或 Push。

### 上下文必须显式且可检查

prompt 不会静默塞入无界的整个 Space。每轮使用不可变的
`ResourceContext` capture，记录加入原因、路径、逻辑目标、有界 excerpt，
以及捕获时的 file digest、mtime 或 Base fingerprint。

首个切片支持 Markdown/text、heading、当前文本 selection、Base table、
Base record，以及通过有界 Space 搜索发现的资源。UI 以 context chips 展示
来源；资源变化后标记 stale，不把旧内容伪装成最新状态。

### run 属于 Desktop runtime

Electron 主进程持有 provider call、tool loop、取消、审批等待和持久化。
renderer 按 event sequence 增量订阅。关闭 tab 不等于取消；显式 Stop 才取消。

应用重启后，原 `running` 或 `waiting-approval` run 变为 `interrupted`，绝不
自动重放。Retry 创建新 attempt；可能已经执行但结果未知的修改工具必须先
对账。

## 架构

```text
Agent 内容 tab
  -> file-space-agent 类型化 IPC（start/subscribe/approve/stop）
  -> AgentRunManager
       -> ProviderBroker
       -> Conversation journal
       -> ResourceContextResolver
       -> AgentToolGateway
            -> PermissionPolicy
            -> SpaceFiles / FileIndex / Base query worker
            -> File Extension 隔离 runtime（后续 manifest 修订）
```

IPC 传递可 clone 的 snapshot，不传递 renderer-owned stream。主进程先将 delta
和状态转换写入 journal，再允许 renderer 按最新 sequence 拉取。

## 数据模型

- `Conversation`：`id`、`spaceId`、title、model、created/updated、latest
  sequence、可选 parent/fork lineage。
- `ResourceContext`：kind、path、heading/range、Base table/row、selection、
  excerpt、digest/mtime/fingerprint、capture reason 和 stale 状态。
- `AgentRun`：一次 user message attempt，状态为 queued、running、
  waiting-approval、succeeded、failed、canceled 或 interrupted。
- `ToolRun`：capability、规范化 input 摘要、资源范围、risk、preview、结果、
  error 与所有状态转换。
- `ApprovalDecision`：绑定 Space、conversation、capability、资源 pattern、
  规范化参数，以及适用时的 Extension content digest 与 permission hash。

## 文件与 SQLite 边界

canonical Space 状态仍是真实 Markdown、assets 与 `.base` 文件。Agent 私有
状态统一放在 Agent 自有命名空间：

```text
.eidos/
  agent/
    sessions/<conversation-id>/events.jsonl
    sessions/<conversation-id>/attachments/
    local/
      index.sqlite3
      state.sqlite3
      cache/
```

`events.jsonl` 是 transcript 与 audit 的事实源，事件有单调 sequence 和
checksum chain。index DB 可重建；state DB 保存 run lease、grant 和偏好。
grant 缺失或损坏时 fail closed。

conversation 版本策略是本地、每 Space 的明确同意，写入 Eidos 管理的
`.graftignore` block，默认关闭。开启后只有 `.eidos/agent/sessions/**` 会进入与
其它 Space 文件相同的显式 stage/commit/push 流程；`.eidos/agent/local/**`、
credential 与 provider 设置始终排除。关闭开关会先撤销当前 conversation
变更的暂存选择，但不会删除已提交历史或远端中已有的 conversation 数据。

目标态中，Provider credential 不进入 Space、renderer 或工具环境；renderer
只发送 model reference，主进程 ProviderBroker 从 Electron secure storage 解析
credential。P1 已保证 Agent IPC、journal 与工具不携带 credential，但全局
secure-storage migration 仍属于 P2。

> P1 的准确现状：`packages/ai/server/model.ts` 已被主进程直接复用，但
> `apps/desktop/electron/modules/config/config-manager.ts` 仍把 provider API key
> 保存在现有 config，`apps/web-app/components/settings/stores/ai-config-store.ts`
> 仍会把 AI config 镜像到 renderer。secure-storage migration 是 P2 缺口，P1
> 只保证新 Agent IPC 不接收、不返回 credential，不能宣称全局密钥迁移完成。

## 旧 Agent 能力盘点与取舍

| 能力                                   | 旧链路与具体文件                                                                                                                                                                                                  | 取舍                                                  | 原因                                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 会话创建、追加、恢复、搜索、编辑与分支 | `packages/ai/server/routes.ts` 调用 `packages/core/agent-session/agent-session-store.ts`，通过 legacy `DataSpace` VFS 写 JSONL/history                                                                            | 适配思想，不直接调用                                  | JSONL 重建、fork、replace 与 history 行为成熟；但 `~/.eidos/agent/sessions` 是 DataSpace 路径，没有 durable Run、event sequence checksum，也不能持有 file Space 后台 run。              |
| 流式响应与部分持久化                   | `packages/ai/server/agent-api.ts` 使用 `ToolLoopAgent`、`createUIMessageStream`、`onStepFinish`/`onFinish`；`apps/web-app/pages/[database]/agent/page.tsx` 由 `useChat` 持有 stream，组件 unmount 时执行 `stop()` | 复用 AI SDK/provider assembly；重做生命周期与 journal | 旧页面明确承认 mid-stream stop 可能留下不完整 session；tab 生命周期不能等于 run 生命周期。                                                                                              |
| Provider、模型偏好与设置               | `packages/ai/server/model.ts` 解析 `model@provider`；Desktop `ConfigManager` 保存 `AIFormValues`；renderer AI store 读写同一配置                                                                                  | P1 直接复用 model resolution；P2 迁移 credential      | 新 IPC 只传 model reference 并在 main 校验 provider；现有 plaintext/renderer-readable key 不扩大到工具或 session。                                                                      |
| Data/context                           | `packages/ai/server/agent-context.ts` 注入 goal/date/legacy node mentions；`packages/ai/tools/bash/index.ts` 的 `eidos` commands 访问旧 table/doc/journal/extension                                               | 淘汰重做                                              | 没有真实 Space path、Markdown selection、Base snapshot、digest 或 active-tab capture；默认“不确认直接执行”也不符合新信任模型。                                                          |
| 内建工具                               | `packages/ai/tools/bash/index.ts` 使用 `network: { allowAll: true }`；`packages/ai/server/agent-api.ts` 把全部 secrets 放进 env，并合并 renderer 传入的 `tools`                                                   | file Space Agent 禁用                                 | P1 只开放 host 定义、类型化、有界的 file/search/Base tools；无通用 shell、无界网络、secret 枚举或客户端可执行 tool。                                                                    |
| 文件并发编辑                           | `packages/ai/tools/file-tools.ts` 通过 line hash 防止 bash VFS stale edit                                                                                                                                         | 适配并发思想                                          | 新实现绑定真实 `SpaceFiles` 的 `sha256:` digest、mtime、共享 operation lock 和原子替换，不复用 VFS file tool。                                                                          |
| 权限确认                               | `packages/ai/permission/wrapper.ts` 包装 tool；`permission/server.ts` 与 renderer `PermissionProvider.tsx` 用 localhost WebSocket，并支持 session grant/global bypass                                             | transport 与 grant 语义全部重做                       | 旧 socket 只靠 query-string session ID，没有 Space/resource/digest 绑定，且可全局 bypass。P1 决策由 main 持有，绑定 Space/conversation/run/ToolRun，只允许 Allow once 或 Deny。         |
| Extension 能力                         | `packages/ai/tools/bash/extension-commands.ts` 修改 legacy DataSpace extension；`packages/extension-manifest/src/types.ts` 的 file Extension v1 只有 commands/panels/fileEditors/baseViews/menus                  | 淘汰旧桥；P3 另立 manifest 修订                       | 已有 file Extension command 绝不能静默变成 Agent tool；未来 `contributes.agentTools` 必须复用 `apps/desktop/electron/modules/file-extensions/` 的 exact-snapshot trust 与隔离 runtime。 |
| 消息、tool 与 composer UI              | `assistant-message.tsx`、`message-bubble.tsx`、`tool-timeline-node.tsx`、`agent-goal-input.tsx` 与 `ui/message-scroller.tsx` 已支持 streamed Markdown、reasoning、usage、tool、mention、stop、edit、fork          | 按数据契约逐步适配                                    | P1 先交付 context、ToolRun、diff、审批、model 与 stop；Markdown renderer、usage、retry/edit/fork、skills、outline 和丰富 composer 进入 P2。                                             |
| 附件、图片与引用                       | 旧 composer 支持结构化 node mention，并由 `agent-context.ts` 注入；没有完整、可恢复的 attachment/image persistence                                                                                                | 引用适配；附件/图片 P2 新建                           | P1 只捕获 active file、selection、Base table/row，不把 renderer 临时 blob 直接塞进 model message。                                                                                      |
| Desktop channel/后台                   | `apps/desktop/electron/modules/agent-channel/agent-channel.service.ts` 与 `packages/ai/server/channel.ts` 有 AbortController，但依赖 `DataSpaceManager`                                                           | P4 适配                                               | channel 必须复用同一 file Space RunManager/ToolGateway，不能复制第二套权限边界。                                                                                                        |

## P1 复用的 file Space 基础设施

- `packages/file-space/src/space-files.ts`：contained public path、stable UTF-8
  read、`sha256:` identity、CAS write 与 atomic replacement。
- `packages/file-space/src/file-space-index.ts` 与
  `SpaceManagementService.searchFiles`：有界搜索与 snippet。
- `apps/desktop/electron/modules/space-management/space-management.service.ts`：
  file/Base host facade；Agent 新增 readonly Base snapshot 方法，不直接打开 `.base`。
- `file-space-operation-lock.ts`：Agent、Base、Graft restore 与普通文件编辑共享
  read/write exclusion。
- `apps/desktop/electron/modules/space-versioning/graft-ignore.ts`：
  `.eidos/agent/` 默认被 Graft 忽略。每个 Space 明确同意后，ignore 收窄为
  `.eidos/agent/local/`，只有 `.eidos/agent/sessions/` 可以进入版本管理；
  canonical 修改继续出现在 Version，通用 `.eidos/sessions/` 仍留给其它 runtime。

## P1 实现证据

| 关注点                      | 实际实现路径                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| main 持有 run               | `apps/desktop/electron/modules/file-space-agent/file-space-agent.service.ts` 持有 provider call、tool loop、AbortController、审批等待与 active run。                                       |
| durable transcript/recovery | `file-space-agent-session-store.ts` 在 `.eidos/agent/sessions/` 写 fsync + checksum-chain event；只修复最后半行，未完成 run 恢复为 `interrupted`。                                         |
| IPC 边界                    | `file-space-agent.module.ts`、`app.module.ts`、`preload.ts`、`electron-env.d.ts` 暴露 typed list/get/start/stop/decision；poll cursor 必须是非负整数。                                     |
| source capture              | `open-agent.ts` 打开 right split 前 flush source file；`resource-context.ts`、`space-file/page.tsx` 与 `packages/markdown-editor/src/editor.tsx` 捕获 file/heading/Base target/selection。 |
| UI                          | `apps/web-app/pages/[database]/file-agent/page.tsx` 增量恢复 event，展开 context/ToolRun，展示 diff，发送 scoped Allow once/Deny。                                                         |
| 安全写入                    | `SpaceManagementService.writeFile` 校验 `sha256:` CAS 与 mtime，获取共享 lock，再由 `SpaceFiles.writeText` 原子替换。                                                                      |
| Base 只读                   | `getBaseSnapshotReadOnly` 获取 read lock 并 readonly open Base；context/inspect/row paging 都在 host facade 后。                                                                           |
| shell 入口                  | `file-space-route-policy.ts`、`file-space-routes.tsx`、file sidebar、cmdk 与 `Cmd/Ctrl+J` 接入；legacy Space 仍走原 `/agent`。                                                             |
| conversation 版本同意       | `graft-ignore.ts`、`space-versioning.coordinator.ts`、`use-space-versioning.ts` 与 `file-space-versioning-settings.tsx` 默认保持私有，并在 Versioning 下提供每 Space opt-in。              |

## 首批内建工具

| 工具                    | 风险    | 边界                                             |
| ----------------------- | ------- | ------------------------------------------------ |
| `space.files.search`    | observe | 有界 query、数量、snippet 与 timeout             |
| `space.files.readText`  | observe | Space 内 public path 与 byte limit               |
| `space.base.inspect`    | observe | 复用现有 Base snapshot API                       |
| `space.base.readRows`   | observe | 复用现有 paging API，最多 100 rows               |
| `space.files.patchText` | modify  | diff 审批、digest 校验、operation lock、原子保存 |

observe 工具在 ToolRun timeline 中可见，但在当前 Space 的声明范围内不逐次
弹窗。modify 工具必须等待明确审批。默认只能 Allow once；Space-wide grant
不能从聊天 banner 创建。

首个切片禁止通用 shell、无界网络、secret 枚举和客户端传入可执行工具。

## File Extension tools

严格的 File Extension manifest v1 没有 Agent tool contribution，已有 command
不得被自动当作 tool。后续单独修订可加入 `contributes.agentTools`，要求 input
schema、result schema、risk 与 required capabilities。

调用必须经过既有隔离 runtime，并在执行前同时验证安装、启用、精确 snapshot
trust、capability grant 和 Agent 用户审批。源码或 grant generation 变化会使
ToolRun 失效。

## 失败与恢复

- renderer 断开不取消 run；无人重新连接时，审批在 deadline 后拒绝。
- Stop 取消 provider 生成、observe tools 与审批等待。
- stale digest 导致 patch 整体失败，不做部分写入。
- provider/tool error 写入 journal 并显示 retry guidance。
- 启动恢复把未完成 lease 标记为 interrupted，绝不自动重放修改工具。
- 只允许自动截断崩溃留下的最后半行；journal 内部 checksum 错误必须暴露。

## 阶段计划

### P1：Current Space 垂直切片

- file Space route 与 shell 入口；
- 主进程 run ownership 和 durable event subscription；
- 当前 Markdown/Base context；
- provider/model resolution；
- 有界 search/read/Base tools；
- 需审批的 Markdown patch；
- ToolRun/context 呈现；
- Stop 与关闭 tab 后恢复。

### P2：会话完整性

- list、search、archive、retry、edit 与 fork；
- restart reconciliation；
- 附件与图片 model parts；
- secure credential migration 和每 Space model preference；
- 原生 Desktop smoke。

### P3：能力扩展

- 通过 Base runtime 执行 Base mutation；
- origin-scoped network tools；
- 有界、可信 skills；
- 独立修订 File Extension Agent tool manifest。

### P4：Channels 与迁移

- channel adapter 共用新 file Space runtime；
- conversation 显式 export/import；
- 兼容验收后再制定旧 Agent 退出计划。

## 验收矩阵

| 需求                       | 现状                           | 缺口                                   | 实现证据                                               | 自动化验证                                               | 真实 Desktop 场景                                                                        |
| -------------------------- | ------------------------------ | -------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Agent route/source capture | P1 已实现                      | P2 增加 New Tab/history 入口           | routes、`open-agent.ts`、sidebar/cmdk/shortcut         | route policy、resource-context、Markdown selection tests | 从 Markdown selection 与 Base record 分别打开，确认 right split 和 source context。      |
| durable stream             | P1 已实现                      | 长会话 compaction/indexing             | main `executeRun` + checksum journal                   | concurrent append、stream persistence、cursor tests      | 长回答生成中关闭 tab，再打开同 URL，观察 delta 继续。                                    |
| 可解释 context             | active resource 已实现         | stale badge、显式 add/remove 是 P2     | `resolveResourceContext` + context detail UI           | Markdown/selection/oversized preview/Base-row tests      | 展开卡片查看 path、selection/table/row、digest 或 Base revision 和原因。                 |
| Space search/read          | P1 已实现                      | ranking/timeout telemetry              | typed search/read tools                                | observe ToolRun 与 byte bound tests                      | 跨文件提问，展开回答实际使用的 search/read ToolRun。                                     |
| Base read                  | P1 已实现                      | richer filter/group context            | readonly snapshot + query-worker row/page              | Base-row test、`smoke:base-query`                        | 基于 active table/record 提问，确认没有 Base mutation。                                  |
| 权限                       | Allow once/Deny 已实现         | durable narrow grant 故意不做          | main pending approval 绑定 Space/conversation/run/tool | approve/deny tests                                       | 同一 patch 先 Deny，再次提议后检查 diff 并 Allow once。                                  |
| 安全写入                   | P1 已实现                      | multi-hunk patch/stale UI              | digest read、diff、shared lock、atomic write           | success、stale digest、deny-no-write tests               | 审批打开时外部编辑文件；Allow once 必须失败且不覆盖。                                    |
| Stop/recovery              | P1 已实现                      | retry/reconciliation UI 是 P2          | AbortController、deadline、lazy interrupted recovery   | canceled/denied/interrupted tests                        | 生成中 Stop；另一次 run 强退重开后显示 `interrupted`。                                   |
| conversation 版本同意      | 每 Space、默认关闭的设置已实现 | 已提交历史不能被开关追溯抹除           | managed `.graftignore` policy + Versioning switch      | ignore policy、coordinator 与 settings UI tests          | 默认确认 session 不出现；同意后提交并 Push 一次；再关闭并确认 local runtime 始终不出现。 |
| Version 边界               | 架构已满足                     | 仍需 packaged app 手工证据             | 条件式 session ignore + canonical host write           | Graft ignore 与 Version suite                            | Apply 后 Version 出现 canonical 文件；只有明确同意后才出现 Agent session。               |
| legacy 兼容                | route 分流已实现               | 保持全量 regression 绿色               | file policy + 未改 legacy route                        | route-policy 与 legacy tests                             | legacy Space 继续使用旧 Agent/session flow。                                             |
| 附件/图片/引用             | 只有 active resource reference | persistence/image parts/citation 是 P2 | ResourceContext model                                  | context tests                                            | P2：附件后重启，preview/model part 仍稳定。                                              |
| File Extension Agent tools | 明确排除                       | P3 独立 manifest/runtime RFC           | 没有 `agentTools` schema/adapter                       | file-extension smoke 不变                                | P1 中现有 Extension command 不得出现在 Agent tools。                                     |

交付命令：

```bash
pnpm test
pnpm typecheck
pnpm --filter eidos smoke:file-agent
pnpm --filter eidos smoke:base-query
pnpm build:desktop:dev
```

Extension tools 阶段额外要求：

```bash
pnpm --filter eidos smoke:file-extension-runtime
```

## 禁止交叉修改边界

- Markdown 继续作为 canonical 内容，只能通过 host safe-save 写入；Agent 不建
  隐藏正文数据库。
- Base 读写只经过独立 Base runtime；Agent 不直接打开 Base SQLite。
- Version 拥有 staging、commit、remote 与 conflict；Agent 只修改工作树。
- P1 不修改 File Extension manifest v1 与 runtime trust 语义。
- Legacy migration 不隐式迁移 chats/messages；只能后续显式 export/import。
