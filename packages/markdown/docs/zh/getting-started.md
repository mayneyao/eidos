# 快速开始

`@eidos.space/markdown` 是一个支持块级交互、源码感知编辑和可组合语法插件的 React Markdown 编辑器。Markdown 是持久化文档，而不是编辑器的导出格式。

## 当前状态

组件已用于 Eidos。目前仍是工作区内的私有预发布包，尚未通过本项目的发布流程公开发布到 npm。通用包边界和文档站还在完善，稳定版本之前 API 可能调整。

## 接入组件

需要 React 18 或 19，以及浏览器 DOM。严格检查声明文件时，请使用 TypeScript 5.2 或更新版本，并在 `compilerOptions.lib` 中包含 `ESNext.Disposable`、DOM 和对应的 ECMAScript 标准库；Lexical 的公开类型需要它。

从公开入口导入组件，并在应用入口引入一次样式：

```tsx
import { useState } from "react"
import { MarkdownEditor } from "@eidos.space/markdown"
import { gfmPreset } from "@eidos.space/markdown/presets"
import "@eidos.space/markdown/styles.css"

export function Notes() {
  const [markdown, setMarkdown] = useState("# 笔记\n\n开始书写。")
  return (
    <MarkdownEditor
      documentKey="notes"
      preset={gfmPreset}
      markdown={markdown}
      onMarkdownChange={setMarkdown}
      ariaLabel="笔记内容"
      placeholder="用 Markdown 开始书写…"
    />
  )
}
```

`markdown` 与 `onMarkdownChange` 是受控数据边界。应用负责接收修改、持久化文档，并把新值传回组件。不要存储 Lexical 状态或 DOM。

## 宿主负责什么

- 文档存储、保存策略和冲突处理。
- 图片粘贴后的持久化，以及图片地址的解析。
- 跨文档导航、文件查找和访问权限。
- 容器尺寸、主题选择和产品层面的语言设置。

编辑器不依赖 Eidos File、文件系统或账户。独立文档使用 `layout="document"`；嵌入应用时使用 `layout="embedded"`，让正文列与两侧块选择区域保持分离。

## 语法与源码保留

默认 Eidos 配置组合 CommonMark、部分 GFM 扩展、文档属性、脚注与数学公式。`profile="obsidian"` 是显式启用的实验性兼容配置，不等于完整的 Obsidian 应用兼容。

源码保留有边界：未修改区域、已编辑内容块、换行规范化和不支持的语法有不同规则，不能笼统理解成任意操作都逐字节无损。

## 继续阅读

- [API 参考导读](./api.md)：组件属性、回调和受控数据流程。
- [交互指南](./interactions.md)：选择、拖动、源码编辑与快捷键。
- [编写插件](./plugins.md)：语法、节点与行为的职责。
- [规范索引](./specs.md)：可观察行为和证据边界。
- [实现架构](./architecture.md)：依赖方向与尚未完成的拆分。
- [交付路线](./roadmap.md)：当前阶段和验收工作。

## 本地开发

在仓库根目录执行：

```sh
pnpm --filter @eidos.space/markdown test
pnpm --filter @eidos.space/markdown typecheck
pnpm --filter @eidos.space/markdown build
pnpm --filter @eidos.space/markdown test:package
pnpm dev:markdown-editor-playground
```

`test:package` 在工作区外安装打包后的 tarball，检查公开类型、自定义语法往返与 React 应用构建。它需要注册表访问或完整的依赖缓存；临时消费项目保留在命令输出的目录中。
