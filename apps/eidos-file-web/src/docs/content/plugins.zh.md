# 使用插件组合 Eidos File 编辑器

Eidos File Plugin 是由编辑器宿主在构建时显式引入的可信模块。它借鉴 Lexical 的组合方式：编辑器核心保持精简，宿主选择要挂载哪些视图与工作流。

它**不是 Eidos Space Extension**。Eidos File Plugin 没有安装 manifest、市场生命周期或 Space 沙箱，也不会直接获得 Space 权限。插件只能使用公共编辑器 Data Source，以及宿主传给插件工厂的 adapter。

## 哪些能力属于核心？

核心是安全打开和编辑任意 `.eidos` 文件所必需的最小集合：

| 核心能力                                  | 必须内置的原因                      |
| ----------------------------------------- | ----------------------------------- |
| 格式校验、Schema、Migration               | 所有宿主必须一致且安全地解释文件    |
| Query、Filter、Sort、分页和事务           | 数据语义不能随 UI 插件变化          |
| Row 与 Field 编辑                         | 没有可选 package 时文件仍必须可编辑 |
| Grid、Selection、Keyboard、Virtualization | Grid 是无损且通用的回退视图         |
| Table/View metadata 与未知视图保留        | 缺少插件时不能重写 saved metadata   |
| Plugin registry、Slot 与 ID 冲突检查      | 组合机制本身属于编辑器契约          |
| Open/Save/Recovery adapter 边界           | 文件句柄与持久化由宿主拥有          |

## 哪些能力适合作为插件？

插件增加可移除的工作流或呈现方式；移除后文件仍然可读、可编辑：

| 插件边界                  | Contribution                                   |
| ------------------------- | ---------------------------------------------- |
| Gallery                   | `gallery` saved-view renderer 与创建配置       |
| Kanban                    | `kanban` renderer、Select 字段要求与默认配置   |
| CSV Import                | Workbar action、预览 UI 与 runtime CSV adapter |
| CSV Export                | View action 与下载/保存 adapter                |
| Graft Versioning          | 由宿主 Graft adapter 驱动的历史与状态 UI       |
| Calendar、Timeline、Chart | 带命名空间的 saved-view renderer               |

当前 package 提供 Gallery、Kanban 与 CSV Import 官方入口。CSV Export、Graft 与后续可视化能力在公共 adapter 就绪后，也应遵循同一边界。

Formula、Lookup、Select、Relation 与附件编码**不是插件**，它们属于格式与 Runtime 语义。插件可以为这些类型提供更好的编辑界面，但不能重新定义磁盘编码。

## 显式引入官方视图

Grid 无需可选 import。只有把 Gallery/Kanban 插件传入编辑器后，对应视图才可用：

```tsx
import { EidosFileEditorView } from "@eidos.space/eidos-file-ui"
import { eidosFileGalleryPlugin } from "@eidos.space/eidos-file-ui/plugins/gallery"
import { eidosFileKanbanPlugin } from "@eidos.space/eidos-file-ui/plugins/kanban"

const plugins = [eidosFileGalleryPlugin, eidosFileKanbanPlugin]

<EidosFileEditorView
  source={source}
  table={table}
  view={view}
  plugins={plugins}
/>
```

插件数组应定义在 React render function 之外，保持引用稳定。若文件包含 `kanban` 视图而宿主没有引入 Kanban 插件，编辑器会保留其 type 与 properties，并显示不可用提示，不会修改文件。

## 引入 CSV Import

CSV 解析、类型推断和导入事务属于 `@eidos.space/eidos-file/csv`。UI 插件只负责文件选择、预览控件和编辑器中的入口。

```tsx
import { createEidosFileCsvImportPlugin } from "@eidos.space/eidos-file-ui/plugins/csv-import"

const csvImportPlugin = createEidosFileCsvImportPlugin(
  {
    async pickFile() {
      const file = await pickCsvFile()
      return file ? rememberFile(file) : null
    },
    async preview(source, options) {
      const file = resolveFile(source.id)
      return worker.previewCsv(file.name, await file.arrayBuffer(), options)
    },
    async import(source, options) {
      const file = resolveFile(source.id)
      return worker.importCsv(file.name, await file.arrayBuffer(), options)
    },
    release(source) {
      forgetFile(source.id)
    },
  },
  { copy: localizedCsvCopy }
)
```

`copy` 是可选配置；宿主支持多语言时应传入本地化文案。Adapter 必须保持 opaque：source ID 可以指向浏览器 `File`、Desktop picker token 或其他宿主拥有的资源。

通过公共 Slot 组件挂载 action plugin：

```tsx
<EidosFilePluginSlot
  slot="workbar"
  plugins={[csvImportPlugin]}
  context={{
    source,
    snapshot,
    activeTable,
    activeView,
    disabled: false,
    onSnapshot: setSnapshot,
    onTableSelect: setActiveTableId,
  }}
/>
```

浏览器 adapter 把字节发送给 Worker，由共享 Runtime 解析和写入。Desktop adapter 可以使用支持进度与取消的 streaming worker。两种 adapter 都不复制 CSV 类型推断或 SQLite 业务规则。

## 定义自定义视图插件

持久化 type 应使用命名空间。Renderer 只获得有界分页与 mutation API，不获得 SQLite connection：

```tsx
import { defineEidosFilePlugin } from "@eidos.space/eidos-file-ui/plugin"

export const timelinePlugin = defineEidosFilePlugin({
  id: "com.example.eidos-file.timeline",
  views: [
    {
      type: "com.example.timeline",
      label: "Timeline",
      description: "Records placed on a date axis",
      renderer: TimelineRenderer,
      create: {
        defaultName: "Timeline",
        isAvailable: (fields) => fields.some((field) => field.type === "date"),
        properties: (fields) => ({
          dateField: fields.find((field) => field.type === "date")
            ?.tableColumnName,
        }),
      },
    },
  ],
})
```

Plugin ID、Action ID 与 View Type 必须唯一。`createEidosFilePluginRegistry()` 会在渲染前拒绝冲突，避免宿主组合错误静默选择错误实现。

## 安全与 Ownership 边界

- 宿主拥有文件句柄、保存状态、Recovery 与权限提示。
- `@eidos.space/eidos-file` 拥有 Schema、Query、Transaction 与 Value Codec。
- 插件拥有可选 UI 与工作流编排。
- 插件获得公共 adapter，不获得任意 SQL 或原始文件访问权。
- 插件缺失时，不删除或重写对应的 persisted view metadata。

继续阅读[构建自定义视图](#/docs/custom-views)，了解 Renderer 分页、Mutation 与性能规则。
