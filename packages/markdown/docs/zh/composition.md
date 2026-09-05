# 组合自己的编辑器

`/build` 工作台使用同一份配置生成实际预览和集成代码。它不会执行生成的
JavaScript，而是与生成代码一样调用 `createMarkdownPreset`。

```tsx
import { createMarkdownPreset } from "@eidos.space/markdown"
import { gfmPreset } from "@eidos.space/markdown/presets"
import { wikilinkPlugin } from "@eidos.space/markdown/plugins"

const preset = createMarkdownPreset({
  id: "my-app.markdown",
  extends: gfmPreset,
  plugins: [wikilinkPlugin],
})
```

这就是 GFM 加 Wiki 链接，不是整套 Obsidian 预设，不会隐式启用公式、提示块、
嵌入或标签。`onOpenInternalLink` 提供 `path`、`heading`、`blockId` 和来源文档标识。
宿主负责解析路径并打开文档；编辑器不拥有笔记库、文件索引、路由或反向链接图谱。
嵌入内容的加载是另一项独立能力。

不需要 GFM 扩展时，使用 `commonmarkPreset` 即可。以上组合均不需要自定义 codec
或 profile。

将该对象作为 `MarkdownEditor` 的 `preset` 传入，并提供 `documentKey`、
`markdown` 和 `onMarkdownChange`。原有 `profile` 保持兼容，但不能与
`preset` 同时传入；也不能再同时传入 `plugins`。

`extends` 继承插件描述，不继承另一套 codec。自定义 codec 仍通过
`defineMarkdownProfile` 定义，不应将其作为组合预设的基础并期待 codec
被保留。`exclude` 使用确切的插件 ID；缺失依赖、未知 ID 和冲突定义会报错。
预设应定义在组件外，或使用 `useMemo` 缓存。

## 当前组合边界

组合式 preset 不会根据插件 ID 或 feature 命名空间推断整份文档的方言，解析行为
由显式语法和能力决定。旧 profile 入口仍保留已有默认行为，兼容现有集成。

表格、任务列表、删除线、自动链接和 GFM 标签过滤已是独立插件。公式、脚注、
属性、高亮、图片和安全 HTML 也可以分别选择。CommonMark 的段落、标题、引用、
列表、代码块、行内代码、强调、链接和分隔线已各有独立插件，从 `/plugins` 导出。
`/presets` 的 `minimalPreset` 只包含段落与源码编辑，可在此基础上添加语法。
任务列表只依赖 `listPlugin`，不再依赖整个 CommonMark 包。旧 `commonmarkPlugin`
保留兼容，但不能与独立成员混用。Builder 已提供基础语法开关和“最小配置”起点。
选择任务列表会启用列表，引用式链接会启用链接；界面会说明这些依赖，关闭依赖方
后才能移除被依赖的能力。双链、嵌入引用、标签、注释、块标识符、行内脚注、提示块、
附件尺寸和 Vault 相对链接已可独立选择。Builder 的 Obsidian 起点与公共
`obsidianPreset` 使用同一组插件，修改后成为自定义组合。

语法插件提供 micromark 解析规则、mdast 转换及 HTML 预览扩展。文档解析、
行内处理和嵌套预览使用同一份组合规则。显式空规则代表 CommonMark，不默认
启用 GFM。HTML 安全检查始终生效，标签过滤不能替代安全检查。

`grammar.commonmark` 声明插件拥有的 micromark 基础规则，组合时取并集。
只要有插件声明此字段（包括空数组），未选规则就会同时从解析及 HTML 预览中
禁用；转义、字符实体和换行仍属于核心。所有插件都省略该字段时，才保留完整
的旧 CommonMark 规则。因此省略字段与 `commonmark: []`（纯文本）不同。

## 原文与宿主

语法和交互分别配置。`interactions` 的 `toolbar`、`insertMenu`、`blockDrag`、
`blockSelection` 均可独立设为 `true` 或 `false`。Builder 提供对应开关，
并在 React 示例中输出相同对象。关闭插入菜单同时关闭加号与斜杠菜单拦截；
关闭块选区不会关闭原生文本选区。格式快捷键及列表项排序仍是独立的快捷键能力。
为兼容旧 API，未指定的工具栏、菜单、拖拽值继承 `showToolbar`（默认 `true`），
块选区默认 `true`；显式设置优先。只读模式仍会隐藏编辑控件。

修改配置保留受控 Markdown，重新建立编辑会话和撤销历史。底层 codec 导出
可能规范化语法，但编辑器的文档会话保留未修改的原始文本。未启用的语法可以
显示为普通文本或需要源码编辑的回退块。

分享链接仅包含版本化配置，不包含用户正文。加载示例必须显式点击，并支持
恢复之前的草稿。配置版本 2 显式记录基础语法；旧版本 1 的分享链接会保留原有的
隐式 CommonMark 基础能力，不会因升级而意外禁用这些语法。
图片存储需要宿主接入 `onPasteImage` / `resolveImageUrl`；
选择图片语法不意味着自动拥有存储后端。

目前仍为工作区预发布包，生成代码需要使用构建产物或工作区依赖，尚未发布到 npm。

## 组合双链

`wikilinkPlugin` 可从 `@eidos.space/markdown/plugins` 引入，也可以在 Builder
的笔记关联分组中启用。它独立支持 `[[Note]]` 链接，不会同时开启嵌入、标签或其他
Vault 语法。可以与普通公式、脚注和文档属性插件组合使用，不改变它们的语义。
链接导航仍由宿主负责。不要与已经包含双链的旧版 `obsidianSyntaxPlugin` 整包同时使用。

`obsidianPreset` 在 `eidosPreset` 上组合独立插件。旧 `obsidianSyntaxPlugin` 和
`obsidianMarkdownProfile` 保留兼容，但 Builder 不再使用它们。这是语法兼容，
不是对 Obsidian 应用的模拟。

普通 Markdown 相对路径由 `linkPlugin` 处理，CommonMark 和 GFM 均适用。
`vaultLinkPlugin` 仅保留为依赖 `linkPlugin` 的兼容描述符，新接入无需使用。

`calloutPlugin` 依赖 `quotePlugin`，`attachmentPlugin` 依赖 `imagePlugin`。
Builder 读取插件声明来补齐依赖；依赖方仍被
选中时，不能移除被依赖的能力。悬停禁用的控件可查看依赖方。

`/plugins` 同时导出 `embedPlugin`、`tagPlugin`、`commentPlugin`、`blockIdPlugin`
和 `inlineFootnotePlugin`，每个都可以独立加入 `minimalPreset`。嵌入引用的目标由
宿主解析，启用它不会获得文件系统访问能力。这些插件共用节点与视图基础设施，
扫描和导出逻辑现由功能模块通过 `inlineSyntax` 注册，不再位于中央方言分支。
启用 Vault 行内插件不会自动开启普通 Markdown
图片中的附件尺寸语法；未启用该能力时，图片替代文字原样保留。

## 下载可运行项目

工作台的“下载项目”会导出 React/Vite 项目，包含当前配置、集成代码，以及与
预览来自同一次站点构建的 Markdown package tarball，不包含草稿正文。
解压后使用 Node.js 22.12 或更新版本，执行 `pnpm install` 和 `pnpm dev`。
`pnpm build` 会先执行严格的 TypeScript 检查再构建生产版本。
安装仍需下载 React、Vite 和传递依赖；压缩包不是离线依赖缓存，也不需要先发布 npm 包。

启用图片后，可以选择“本地 OPFS 图片存储”，实际预览和生成文件都会接入完整的
宿主适配器。粘贴图片保存在浏览器存储中，Markdown 使用稳定的 `opfs://` 地址，
显示时使用临时 blob URL。该能力需要 HTTPS 或 localhost 安全上下文。
OPFS 按浏览器源隔离，不是备份或跨设备存储，也不会随项目一起下载。
长期保存或共享文档时应替换适配器。示例的 Markdown 仅保存在 React 状态中，
正文持久化需要另外接入。
