# Eidos 存储 RFCs

状态：草案集合，实施中
日期：2026-07-08
实施快照：2026-07-12

本目录包含 Eidos 转向 file-based 存储模型的一组草案 RFC。

## 实施状态

| RFC               | 状态         | 当前实现边界                                                                                                                           |
| ----------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Space/Base 存储   | 实施中       | file-based 核心垂直切片、独立 Base runtime 和 Base-aware diff 已跑通；migration、remote sync 和文件化扩展仍待实现。                    |
| Markdown runtime  | 垂直切片可用 | 已有真实文件树、直接编辑、安全保存、watcher、indexed quick open、wiki-link completion、outline、backlinks 和附件；持久索引仍待实现。   |
| Graft 版本管理    | 本地链路可用 | Changes、staging、commit、diff、history、restore 和 Base table/row inspection 已跑通；remote sync 和 conflicts 仍待实现。              |
| 产品 UX           | 实施中       | Files/Version、Diff/History、上下文 Settings 和分页正式 Base grid 已可用；Sync 和 Migration UX 仍待实现。                              |
| Base 格式/runtime | 垂直切片     | 独立 package 和分页 Grid 已支持 primitive 编辑、table/field 生命周期、choice options、view layout 与批量删除；CSV 和丰富字段仍待实现。 |
| 文件化扩展        | 未开始       | RFC 仍是目标设计。                                                                                                                     |
| Legacy migration  | 未开始       | 等待 Base runtime 和导出格式稳定。                                                                                                     |

实施顺序已经从 Base-first 调整为：

1. 完成 Markdown file-based Space 垂直切片，
2. 稳定本地 Graft 版本管理，
3. 构建独立 Base package 和垂直切片，
4. 再实现 legacy migration、文件化扩展、remote sync 和 conflicts。

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
