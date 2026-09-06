# Eidos Markdown

编辑器统一使用一种默认方言：**CommonMark + GFM + Wiki 文件链接，以及 Eidos 扩展**。
Lite 和 Playground 不再提供 Obsidian 兼容模式切换。

## 语法与职责

| 层次       | 语法                                                      |
| ---------- | --------------------------------------------------------- |
| CommonMark | 段落、标题、列表、引用、代码、链接、图片与安全 HTML       |
| GFM        | 表格、任务列表、删除线、自动链接与 HTML 标签过滤          |
| Wiki       | 文件链接和别名，可指向 Markdown、.eidos、图片、PDF 等文件 |
| Eidos 扩展 | frontmatter、公式、脚注、高亮、提示块、标签、注释、块 ID  |

插件用于组织解析、序列化、节点和编辑行为，不再对应不同产品模式。
宿主负责文件搜索、路径解析、打开及附件访问。
`[[business/customers.eidos|客户数据]]` 是文件链接，不是嵌入；
`![[...]]` 不受支持，保留为原始文本，不加载嵌入内容。

## 兼容入口

`eidosPreset` 与 `eidosMarkdownProfile` 指向默认组合。
旧 `obsidianPreset`、`obsidianMarkdownProfile` 和 `profile="obsidian"`
作为弃用别名保留，实际使用同一种 Eidos Markdown。
旧 Lite 偏好值仍可读取，但不再影响语法行为。

`searchNotes` 保留原 API 名称，候选可包含任意宿主文件。
CommonMark/GFM 基础组合和已有自定义插件 API 暂时保留用于现有调用方及测试，
不是面向用户的方言选择器。不读取或依赖 .obsidian 配置。
未支持语法必须保留原始源码，不能静默丢弃。
