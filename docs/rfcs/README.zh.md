# Eidos 存储 RFCs

状态：草案集合，实施中
日期：2026-07-08
实施快照：2026-07-17

本目录包含 Eidos 转向 file-based 存储模型的一组草案 RFC。

> **规范文本：**[Eidos File 1.0](../specs/eidos-file-1.0.md)，中文说明见
> [Eidos File 1.0 中文参考译本](../specs/eidos-file-1.0.zh.md)。本目录文档是设计与
> 实现记录；与 1.0 规范不一致时，以规范为准。

## 实施状态

| RFC                     | 状态                   | 当前实现边界                                                                                                                                                                                                                                                        |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Space/Eidos File 存储   | Eidos File v1 验收通过 | file-based 垂直切片、独立 Eidos File runtime、Eidos File-aware diff、真实 legacy export、原生 remote 与 record tab 验收已跑通；文件化扩展保持独立。                                                                                                                 |
| Markdown runtime        | Desktop 验收通过       | 真实文件树、直接编辑、安全保存、外部冲突草稿恢复、watcher、持久派生索引、quick open、wiki-link completion、outline、backlinks、附件、IME、图片粘贴和长文档均已跑通。                                                                                                |
| Graft 版本管理          | Desktop 验收通过       | v0.8 使用普通物理 SQLite worktree 与 CLI control plane；已验收 WAL/rollback-journal、8 KiB page、STRICT/WITHOUT ROWID 复合主键 diff/merge、fetch/pull/push、path-first resolution 与双 parent continuation。                                                        |
| 产品 UX                 | Desktop 验收通过       | Files/Version、Diff/History、Settings、迁移、原生 Eidos File 生命周期、双 Space row-conflict 审阅、table-view 对齐及 record tab 恢复/分屏均已验收。                                                                                                                 |
| Eidos File 格式/runtime | 交付收尾中             | 独立 package 已支持结构化查询与列聚合、多 layout views、丰富字段、强化校验、原子 range edit/undo、有界百万行视图缓存、批量删除，以及流式 CSV 导入和当前 view 导出。                                                                                                 |
| 文件化扩展              | P2b 开发者预览         | 隔离 command Worker、只读文本、菜单和宿主语义 UI 已实现；GitHub 安装与自定义视图尚未开始。                                                                                                                                                                          |
| Legacy migration        | 真实导出通过           | 独立 planning、原子 export、Desktop Settings、schema recovery 和 111 万行真实 Space 验收已完成；兼容 Formula/Lookup 会迁移为实时派生字段，不兼容定义保留物化值并明确告警。                                                                                          |
| Agent 集成              | 集成交付候选           | 成熟 provider/Skills/ToolLoop runtime 与富 Agent UI 已接入 main-process run ownership、durable file Space context/audit、scoped tool approval、旧 session 自动导入、search/edit/fork/retry 生命周期和用户控制的 conversation 版本管理；仍待 packaged Desktop 验收。 |

实施顺序已经从 Eidos File-first 调整，前四个 milestones 现已完成：

1. 完成 Markdown file-based Space 垂直切片，
2. 稳定本地 Graft 版本管理，
3. 构建独立 Eidos File package 和垂直切片，
4. 实现并验收 legacy migration exports。

Eidos File v1 交付 gate 现已关闭。文件化扩展是独立且当前暂缓的 RFC，不再阻塞 Eidos File 交付。

推荐阅读顺序：

1. `../specs/eidos-file-1.0.zh.md`
   - Eidos File 最终、implementation-independent 契约的中文参考译本。
2. `eidos-file-storage.zh.md`
   - 整体产品/存储模型。
3. `eidos-file-format.zh.md`
   - 已被取代的早期 runtime 设计与实现记录。
4. `eidos-space-markdown-runtime.zh.md`
   - Space mode 下 Markdown 文件作为 source of truth。
5. `eidos-file-based-extensions.zh.md`
   - 扩展源码文件、私有运行时状态、trust 和 graft tracking。
6. `eidos-graft-space-versioning.zh.md`
   - Graft tracking、status、commit、sync 和 conflict 语义。
7. `eidos-legacy-space-migration.zh.md`
   - 从当前 `.eidos/db.sqlite3` spaces 迁移。
8. `eidos-file-product-ux.zh.md`
   - 文件、Eidos File、Changes、history 和 migration 的产品交互模型。
9. `eidos-agent-integration.zh.md`
   - file-based Space 的 Agent conversation、每 Space 版本管理同意、resource context、tools、权限与恢复。

英文版本不带 `.zh` 后缀。
