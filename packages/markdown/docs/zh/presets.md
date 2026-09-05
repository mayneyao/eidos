# 预设

预设是明确的插件组合，不是另一套编辑器。
从 `commonmarkPreset` 的基础 Markdown 或 `gfmPreset` 的表格、任务列表等
标准扩展开始，再通过 `createMarkdownPreset` 添加应用需要的插件。

```tsx
import { MarkdownEditor } from "@eidos.space/markdown"
import { gfmPreset } from "@eidos.space/markdown/presets"

;<MarkdownEditor
  documentKey="notes"
  preset={gfmPreset}
  markdown={markdown}
  onMarkdownChange={setMarkdown}
/>
```

Eidos、Obsidian 预设是丰富组合的示例，不是框架的必需能力。
现有 `profile="gfm"`、`profile="eidos"`（默认）和 `profile="obsidian"`
快捷方式继续兼容。通过[组合配置](/zh/docs/composition)定制预设，或参考
[编写插件](/zh/docs/plugins)添加自己的语法。

## 语法覆盖

| 语法族                              | GFM    | Eidos  | Obsidian     |
| ----------------------------------- | ------ | ------ | ------------ |
| CommonMark 块、行内文本、链接和图片 | 支持   | 支持   | 支持         |
| 表格、任务列表、删除线              | 支持   | 支持   | 支持         |
| 扩展网址与邮箱自动链接              | 支持   | 支持   | 支持         |
| 禁用 HTML 标签过滤与安全呈现        | 支持   | 支持   | 支持         |
| YAML 文档属性                       | 不启用 | 支持   | 支持         |
| 脚注、公式与高亮                    | 不启用 | 支持   | 支持         |
| 双链、提示块、标签、注释和块 ID     | 不启用 | 不启用 | 支持         |
| 笔记与附件嵌入引用                  | 不启用 | 不启用 | 需要宿主支持 |

GFM 预设覆盖 [GFM 规范](https://github.github.com/gfm/)中的五类扩展：
表格、任务列表、删除线、扩展自动链接、禁用的原始 HTML。
公式、脚注、Issue 提及、emoji 简写等 GitHub 产品功能不等于 GFM 规范。
“语法族覆盖”也不意味着已通过每个官方一致性用例。
编辑器有更严格的安全边界：危险 HTML 以惰性源码呈现；复杂容器可能使用
可视化预览与源码编辑，不保证都支持直接光标编辑。行内图片支持导入，
但不会出现在行内插入菜单。

## 交互体验

[Playground](/zh/playground) 切换的是真实编辑器配置，不只是替换示例文字。
切换会保留 Markdown、只读状态和源码模式；编辑器会话重新开始，光标和撤销历史重置。
`?preset=gfm`、`?preset=eidos`、`?preset=obsidian` 可指定打开时的预设。
这些地址不负责在刷新后恢复草稿。

[语法演示](/zh/spec) 列出语法族，并呈现可编辑源码和真实编辑效果。
也可以切到未启用该语法的预设，观察差异；每项示例的草稿在切换时保留。

## 自定义预设

`gfmMarkdownProfile`、`eidosMarkdownProfile` 和 `obsidianMarkdownProfile`
是可导入的公开配置对象。使用 `defineMarkdownProfile` 组合 codec 与插件，
使用 `defineMarkdownPlugins` 组合语法与行为。
编辑器不可同时传入 `profile` 和 `plugins`。参见[编写插件](./plugins.md)。

## 特定预设的边界

Obsidian 是实验性预设，不是独立编辑器，也不是完整的 Obsidian 应用模拟。
它不读取 `.obsidian` 配置；跨文档跳转与附件查找需要宿主回调。
目前不支持完整笔记内容转引和任意社区插件语法。
[详细覆盖记录](../../OBSIDIAN-COMPATIBILITY.md)仅描述这个预设。

交互与源码保留规则见[行为规范](./specification.md)。
