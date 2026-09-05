# Obsidian Markdown 兼容性

`profile="obsidian"` 是显式开启的实验性配置。它只兼容 Markdown 语法，不读取或解释 `.obsidian` 目录，也不实现 Obsidian 应用。重要 Vault 应保留备份。

本文是[完整兼容矩阵](/docs/compatibility)的中文导读，具体边界以英文参考为准。

## 启用方式

```tsx
<MarkdownEditor
  documentKey="Projects/Current.md"
  markdown={markdown}
  profile="obsidian"
  onMarkdownChange={setMarkdown}
  onOpenInternalLink={openVaultTarget}
  navigationTarget={navigationTarget}
  resolveImageUrl={resolveVaultAttachment}
/>
```

`profile` 与 `plugins` 互斥。目录中是否有 `.obsidian` 不会改变文档的解析模式。

## 支持范围

| 语法或能力                                                   | 当前状态                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| CommonMark / GFM 常见文本                                    | 标题、引用、列表、任务列表、表格、代码、强调和链接等可编辑 |
| YAML 文档属性                                                | 保留源码，语义化展示空值、数组、URL 和 wikilink            |
| Wikilink 与 Markdown 笔记链接                                | 解析路径、别名、标题及块 ID，交由宿主导航                  |
| 当前笔记标题与块锚点                                         | 编辑器内定位，不修改宿主 URL                               |
| 图片嵌入                                                     | 通过资源回调展示栅格图片，支持部分尺寸语法                 |
| 笔记与非图片嵌入                                             | 保留目标的安全占位；未实现正文转引展示                     |
| 标签                                                         | 保留源码并语义化展示；没有 Vault 标签索引或自动补全        |
| `^[text]` 行内脚注                                           | 解析并保留源码；没有专门的该语法编辑浮层                   |
| 命名脚注                                                     | 按首次引用编号，在文档尾部展示定义                         |
| `%%comment%%` 注释                                           | 保留源码并弱化展示                                         |
| Callout                                                      | 展示类型、标题、内容和折叠状态；嵌套编辑采用局部源码       |
| 数学公式、高亮                                               | 使用对应语义展示                                           |
| 重命名传播、链接补全、创建未解析笔记                         | 尚未实现                                                   |
| 反向链接、图谱、Canvas、Bases、社区插件、主题、Sync、Publish | 不属于 Markdown 编辑器契约                                 |

## 宿主边界

笔记查找、附件定位、目录访问权限和粘贴图片存储由宿主决定。文档中的链接不能授权目录穿越、访问符号链接目标或把任意本地资源暴露给渲染器。

## 源码保留

打开再关闭且没有编辑时，在所选 codec 定义的 BOM 与换行规范化之外保留原文。局部编辑在映射明确时保留未改动区域的空白、换行与拼写；未支持功能不会静默丢失。
