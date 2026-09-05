# 编写插件

一个插件应封装同一功能的语法、节点定义、编辑行为、插入命令与展示。编辑器负责会话、撤销历史和选区生命周期；应用负责存储与导航。

插件 API 尚在预发布阶段。目前支持扩展顶层块语法；嵌套容器语法仍需要 codec 支持，内置功能也尚未全部从共享实现迁出。

## 从组合开始

```tsx
import { MarkdownEditor } from "@eidos.space/markdown"
import { commonmarkPlugin, gfmPlugin } from "@eidos.space/markdown/plugins"
import "@eidos.space/markdown/styles.css"

const plugins = [commonmarkPlugin, gfmPlugin]

<MarkdownEditor
  documentKey="notes"
  markdown={markdown}
  onMarkdownChange={setMarkdown}
  plugins={plugins}
/>
```

未加入的语法不会静默开启，不支持的源码可能保留为回退块。GFM 插件依赖 CommonMark 插件。不要同时传入 `plugins` 与 `profile`。

## 功能内部的职责

| 部分 | 职责                                 |
| ---- | ------------------------------------ |
| 语法 | 识别归属的源码范围，并完成导入与导出 |
| 节点 | 数据模型、序列化和节点展示           |
| 行为 | 注册命令与事件生命周期，卸载时清理   |
| 插入 | 提供菜单元数据和可执行的插入动作     |
| 样式 | 使用隔离的样式，不修改宿主全局元素   |
| 测试 | 解析、编辑、往返、禁用行为与错误输入 |

描述符是不可变的会话配置。ID 使用命名空间，行为变化时更新插件版本。替换编译后的插件配置会创建新的编辑器会话，而不是动态修改 Lexical 的节点注册表。

## 组合容器内的行内解析

`transformers` 贡献可以在 `transformer`、`order` 之外提供
`configure(transformers)`。编译器传入所选插件按顺序排列的未绑定转换器，
并使用返回的新转换器。不要修改冻结的输入数组或共享定义。这是单次绑定，
不是递归依赖解析；自动生成的语义导出适配器不包含在此输入中。

表格插件通过这一入口，只使用当前组合中的 `text-format` 和 `text-match`
转换器解析单元格。添加表格不应隐式启用强调、链接，也不应要求未选插件的节点。

## 添加块语法

`blockSyntax` 提供 `scan`、`import` 和 `export`：

- 扫描器针对规范化后的源码返回覆盖完整行的左闭右开区间。
- 导入器在 Lexical 更新内执行，返回一个已注册、尚未挂接的块节点。
- 导出器对不归自己管理的节点返回 `null`。

扩展已有块时，可用 `matchParsedBlock(block, options)` 代替 `scan`，也可同时
提供二者。它接收完整顶层块的 `type`、`source` 和规范化正文内的半开 `start`/
`end` 偏移；返回 `true` 表示接管整个块。内置提示块插件据此识别带提示标记的
`blockquote`。嵌套块不会单独提交给匹配器，普通扫描器仍不能从受保护容器内部
启动。两个识别路径共用重叠校验，多个所有者接管同一块会报错；每项贡献至少
提供一个识别器。导入、导出及节点校验契约不变。

提示块视图使用插件按当前语法生成的预览，不再暗中按完整 GFM 重新解析。

独立消费测试实现了 `:::note` 语法，仅从公开入口导入，通过打包后的组件完成节点编辑、Markdown 导出和 React 应用构建。参见[可执行插件示例](../../tests/consumer/note-plugin.ts)和[往返测试](../../tests/consumer/smoke.mjs)。

## 复用交互系统

插入动作获得块级与行内插入、保留选区锚点、关闭菜单、管理焦点和简单文本表单等辅助接口。使用这些接口，让插件遵循统一的选区与撤销行为。

通过快捷键注册表声明命令，不要直接添加全局键盘监听。

CommonMark 和 GFM 已分别注册自己的编辑行为。复制能力 ID 不会自动安装这些行为，必须包含对应插件，或显式提供实现。

完整贡献类型见[英文 API](/docs/api)。尚未拆分的部分见[实现架构](./architecture.md)，架构说明不能代替语法规范。

## 自定义行内语法

插件可在 `nodes`、`grammar` 之外声明 `inlineSyntax`。每个
`MarkdownInlineSyntax` 包含命名空间 `id`、返回半开源码区间的
`scan(source, context)`、创建一个未挂载行内 Lexical 节点的
`import(source, options)`，以及返回 Markdown 的 `export(node)`。
不属于该语法的节点返回 `null`；空字符串是有效的导出结果。

扫描上下文提供受保护区间和解析选项。与代码、HTML、Markdown 链接/图片、已有
语义区间相交的匹配会被忽略。无效区间和自定义行内语法之间的重叠会报错，不按
注册顺序静默覆盖。插件负责自身分隔符的转义规则。导入在 Lexical 更新中运行，
返回块节点或已挂载节点会被拒绝。自定义导出先于内置行内导出执行。

注释、双链别名等需要完整拥有内部内容的语法可设置 `capturesContent: true`。
它们先于内部语义替换运行，因此注释内的 `$x$` 不会再被解析为公式。
AST 中的代码、HTML 和链接仍受保护。完整捕获区间会保护内部内容免受普通行内
扫描器处理；完整捕获语法之间的重叠仍会报错。

`createMarkdownPreset` 和 `MarkdownEditor` 会把组合后的注册表传入行内导入，
包括富文本列表项。移除插件即可关闭解释，不需要增加中央 feature 判断。
输入快捷操作仍属于独立行为/transformer。源码编辑容器的 HTML 预览仍需插件的
`grammar` 预览扩展，`inlineSyntax` 本身不会自动生成 HTML 渲染器。

内置 `mathPlugin` 也通过这套接口处理 `$…$` 行内公式，通过 `blockSyntax`
处理块级公式。行内识别、导入和导出归属于功能插件，而非某个 preset 的专用
导入器。旧 EFM codec 的直接入口保留默认公式注册；可组合 preset 只使用明确
选择的注册表。
