# Eidos 存储 RFCs

状态：草案集合，实施中
日期：2026-07-08
实施快照：2026-07-12

本目录包含 Eidos 转向 file-based 存储模型的一组草案 RFC。

## 实施状态

| RFC               | 状态             | 当前实现边界                                                                                                                                       |
| ----------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Space/Base 存储   | 实施中           | file-based 垂直切片、独立 Base runtime、Base-aware diff、真实 legacy export 和原生 remote 验收已跑通；仍需文件化扩展与剩余 Base 细化。             |
| Markdown runtime  | Desktop 验收通过 | 真实文件树、直接编辑、安全保存、watcher、持久派生索引、quick open、wiki-link completion、outline、backlinks、附件、IME、图片粘贴和长文档均已跑通。 |
| Graft 版本管理    | Desktop 验收通过 | 原生 Desktop 已验收持久 fetch/pull/push、分叉文本 diff、path-first resolution、双 parent continuation、clean reconciliation 和最终 push。          |
| 产品 UX           | 实施中           | Files/Version、Diff/History、上下文 Settings、紧凑同步控件、冲突操作、正式 Base grid 和 Legacy Migration Settings 已通过原生验收。                 |
| Base 格式/runtime | 垂直切片         | 独立 package 和分页 Grid 已支持 primitive 编辑、table/field 生命周期、choice options、view layout、批量删除与流式导入。                            |
| 文件化扩展        | 未开始           | RFC 仍是目标设计。                                                                                                                                 |
| Legacy migration  | 真实导出通过     | 独立 planning、原子 export、Desktop Settings、schema recovery 和 111 万行真实 Space 验收已完成；实时派生字段重算仍待实现。                         |

实施顺序已经从 Base-first 调整，前四个 milestones 现已完成：

1. 完成 Markdown file-based Space 垂直切片，
2. 稳定本地 Graft 版本管理，
3. 构建独立 Base package 和垂直切片，
4. 实现并验收 legacy migration exports。

下一顺序是文件化扩展，然后是更细的 Base conflict 与剩余产品细化。

推荐阅读顺序：

1. `eidos-space-base-storage.zh.md`
   - 整体产品/存储模型。
2. `eidos-base-file-format.zh.md`
   - `.base` SQLite 文件格式与表格运行时。
3. `eidos-space-markdown-runtime.zh.md`
   - Space mode 下 Markdown 文件作为 source of truth。
4. `eidos-file-based-extensions.zh.md`
   - 扩展源码文件、私有运行时状态、trust 和 graft tracking。
5. `eidos-graft-space-versioning.zh.md`
   - Graft tracking、status、commit、sync 和 conflict 语义。
6. `eidos-legacy-space-migration.zh.md`
   - 从当前 `.eidos/db.sqlite3` spaces 迁移。
7. `eidos-space-base-product-ux.zh.md`
   - 文件、Base、Changes、history 和 migration 的产品交互模型。

英文版本不带 `.zh` 后缀。
