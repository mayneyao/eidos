# 为 Eidos File 构建自定义视图

`@eidos.space/eidos-file-ui` 是 Eidos File 宿主共享的 React UI，提供编辑器、Grid、Gallery、Kanban、记录面板、字段控件，以及扩展视图类型的 renderer registry。

UI package 不负责打开 SQLite 文件，只消费 `EidosFileEditorDataSource`。因此同一套组件可以连接 Web Worker、Electron IPC 或其他宿主边界。

## 安装并渲染编辑器

```bash
pnpm add @eidos.space/eidos-file @eidos.space/eidos-file-ui \
  @glideapps/glide-data-grid react react-dom
```

在应用中引入一次发布样式：

```ts
import "@eidos.space/eidos-file-ui/styles.css"
```

渲染当前数据表与视图：

```tsx
import {
  EidosFileEditorView,
  EidosFileUIProvider,
} from "@eidos.space/eidos-file-ui"

function EidosFileSurface({ source, table, view, theme }) {
  return (
    <EidosFileUIProvider
      themeName={theme}
      resolveAssetUrl={(path) => `/assets/${path}`}
    >
      <EidosFileEditorView
        source={source}
        table={table}
        view={view}
        onError={(error) => console.error(error)}
      />
    </EidosFileUIProvider>
  )
}
```

`EidosFileEditorView` 会将 `grid`、`gallery` 与 `kanban` 路由到内置 renderer。这些视图共享选择、分页、字段编辑、记录面板和 mutation 契约，而不是维护各自的数据模型。

## 单独使用内置视图

需要自行组合宿主 shell 时，也可以使用低层 subpath export：

```ts
import { EidosFileDataGrid } from "@eidos.space/eidos-file-ui/eidos-file-data-grid"
import { EidosFileGalleryView } from "@eidos.space/eidos-file-ui/eidos-file-gallery-view"
import { EidosFileKanbanView } from "@eidos.space/eidos-file-ui/eidos-file-kanban-view"
```

完整的视图路由应使用 `EidosFileEditorView`。只有当宿主明确接管分页、分组、卡片 projection 与编辑器 chrome 时，才直接组合低层组件。

## 选择持久化 View Type

`.eidos` 文件中的 view `type` 是开放字符串。内置类型保留 `grid`、`gallery` 与 `kanban`。第三方视图建议使用带命名空间的 key，例如 `com.example.timeline`。

通过 runtime 保存视图：

```ts
eidosFile.createView(table.id, {
  name: "Timeline",
  type: "com.example.timeline",
  properties: {
    startField: "start_date",
    endField: "end_date",
  },
})
```

即使另一个宿主没有你的 renderer，Eidos File 仍会保留 `type` 与 `properties`。该宿主可以显示不支持提示或临时回退到 Grid，但不应重写原视图。

Renderer 按以下顺序解析：

1. 宿主 `renderers` registry 中匹配的 renderer；
2. 内置 Grid、Gallery 或 Kanban renderer；
3. 宿主的 `renderUnsupportedView` callback；
4. package 默认的不支持视图界面。

## 实现自定义 Renderer

Renderer 是实现 `EidosFileViewRendererProps` 契约的 React 组件。下面的最小 Timeline 从 `view.properties` 读取字段配置，请求有界 projection，并将错误报告给宿主：

```tsx
import { useEffect, useState } from "react"
import type { EidosFileRowPage } from "@eidos.space/eidos-file"
import {
  EidosFileUnsupportedView,
  type EidosFileViewRenderer,
} from "@eidos.space/eidos-file-ui"

export const TimelineView: EidosFileViewRenderer = ({
  source,
  table,
  view,
  query,
  disabled,
  reloadToken,
  onMutation,
  onError,
}) => {
  const [page, setPage] = useState<EidosFileRowPage | null>(null)
  const startField = String(view?.properties?.startField ?? "")
  const field = table.fields.find(
    (candidate) => candidate.tableColumnName === startField
  )

  useEffect(() => {
    if (!field) return
    let cancelled = false
    setPage(null)
    source
      .getPage(table.table.id, 0, 100, query, undefined, undefined, {
        columns: ["title", field.tableColumnName],
        fieldLimit: 8,
        omitEmptyFields: true,
      })
      .then((next) => {
        if (!cancelled) setPage(next)
      })
      .catch(onError)
    return () => {
      cancelled = true
    }
  }, [field, onError, query, reloadToken, source, table.table.id])

  if (!view || !field) {
    return (
      <EidosFileUnsupportedView
        name={view?.name ?? "Timeline"}
        type={view?.type ?? "com.example.timeline"}
        detail="Choose a valid start field in Timeline settings."
      />
    )
  }

  if (!page) return <p role="status">Loading timeline…</p>

  return (
    <ol aria-label={view.name}>
      {page.rows.map((row) => (
        <li key={String(row._id)}>
          <time>{String(row[field.tableColumnName] ?? "No date")}</time>
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              try {
                const result = await source.updateRow(
                  table.table.id,
                  String(row._id),
                  { [field.tableColumnName]: new Date().toISOString() }
                )
                onMutation?.(result)
              } catch (error) {
                onError?.(error)
              }
            }}
          >
            {String(row.title ?? "Untitled")}
          </button>
        </li>
      ))}
    </ol>
  )
}
```

发布 renderer package 时导出组件，由每个宿主显式注册：

```tsx
import { TimelineView } from "@example/eidos-file-timeline-view"
import {
  EidosFileEditorView,
  builtInEidosFileViewRenderers,
} from "@eidos.space/eidos-file-ui"

const renderers = {
  ...builtInEidosFileViewRenderers,
  "com.example.timeline": TimelineView,
}

<EidosFileEditorView
  source={source}
  table={table}
  view={view}
  renderers={renderers}
/>
```

Registry 应定义在 render function 外部，保持引用稳定。宿主 entry 可以覆盖相同 key 的内置 renderer，因此应用也可以在不改变持久化 metadata 的情况下替换内置呈现。

## 将视图加入编辑器创建菜单

Renderer registry 回答“如何渲染这个类型”，编辑器 shell 另外负责“用户可以创建哪些类型”。在 registry 旁维护一个小型 contribution catalog：

```ts
const viewContributions = [
  { type: "grid", label: "Grid" },
  { type: "gallery", label: "Gallery" },
  { type: "kanban", label: "Kanban" },
  { type: "com.example.timeline", label: "Timeline" },
]
```

创建视图属于 runtime 操作。增加宿主 Worker action，调用 `EidosFileRuntime.createView`，然后返回新 snapshot：

```ts
runtime.createView(tableId, {
  name: "Timeline",
  type: "com.example.timeline",
  properties: {
    startField: "start_date",
    endField: "end_date",
  },
})

return snapshot(fileName, runtime)
```

`EidosFileEditorDataSource` 有意聚焦于渲染和编辑已有 surface，因此视图创建与删除可以保持为明确的宿主 action。操作完成后替换 editor snapshot，并选中新视图或 fallback 视图。

通过共享 data source 更新 renderer 设置：

```ts
const nextSnapshot = await source.updateView(view.id, {
  properties: {
    ...(view.properties ?? {}),
    startField: selectedColumn,
  },
})
```

只保存兼容 JSON、可携带的值。不要把 DOM 状态、callback、Blob URL、file handle 或应用本地对象 identity 写入 `properties`。

## Renderer 契约

每个 `EidosFileViewRenderer` 都会收到：

| Prop          | 用途                                          |
| ------------- | --------------------------------------------- |
| `source`      | 异步分页与 mutation 边界                      |
| `table`       | 当前 table 元数据、字段、视图与记录数         |
| `view`        | 当前视图及 renderer 专用属性                  |
| `query`       | 当前视图规范化后的搜索、筛选与排序            |
| `search`      | 宿主当前搜索文本                              |
| `disabled`    | 只读或忙碌状态                                |
| `reloadToken` | 请求刷新缓存页面的信号                        |
| callbacks     | 向宿主报告 mutation、snapshot、字段面板与错误 |

Renderer 应直接消费传入的 `query`。不要读取全部记录后，在 React 中重新实现筛选与排序。

Property 引用的字段不存在或类型不兼容时，应渲染有帮助的配置状态，而不是直接抛错。Eidos File 文件可能在安装了不同 renderer package 的宿主之间移动。

## 通过 Data Source 分页

```ts
const page = await source.getPage(
  table.table.id,
  offset,
  100,
  query,
  totalHint,
  cursor,
  {
    columns: ["title", "start_date", "end_date", "owner"],
    fieldLimit: 12,
    omitEmptyFields: true,
  }
)
```

存在 `page.nextCursor` 时，将它用于下一段连续分页。Projection 可以避免卡片或 Timeline 从宽表传输所有字段。

对于类似 Kanban 的分组视图，使用 `source.getGroupCounts`，并在当前 query 上增加分组筛选。分组语义属于 Eidos File runtime；renderer 不应下载整表后自行计数。

## 通过共享边界编辑

```ts
const result = await source.updateRow(table.table.id, String(row._id), {
  status: "Done",
})

onMutation?.(result)
```

请尊重 `disabled`，通过 `onError` 暴露错误，并报告成功 mutation，便于宿主更新 dirty 与保存状态。文件所有权、权限、恢复与保存冲突仍由宿主负责。

## 视图属性

Renderer 专用状态属于 `view.properties`，并且必须兼容 JSON。应使用稳定 field column name，不要依赖可修改的 display name。

适合保存的属性包括：

- Timeline 起止字段；
- Map 经纬度字段；
- Chart 分类、数值与聚合方式；
- Calendar 日期字段与一周起始日。

Hover、打开的菜单、当前拖拽位置等临时 UI 状态应保留在 React 组件内部，不要写入 `.eidos` 文件。

## 可访问性与性能

公开 renderer 应做到：

- 支持键盘操作与清晰焦点；
- 遵循宿主的 light/dark theme；
- 适应窄容器，而不是假设占满窗口；
- 虚拟化长列表并保持有界缓存；
- 使用分页与 projection，不读取整张表；
- 保存时保留未知字段与视图属性；
- 提供有效的空状态、加载状态与错误状态。

## 将 Renderer 作为可携带贡献进行测试

发布自定义视图前，至少验证：

1. 创建视图、关闭编辑器、重新打开同一 `.eidos`，确认 type 与 properties 保留。
2. 在没有安装 renderer 的宿主中打开文件，确认视图 metadata 未被改写。
3. 在宿主中筛选、排序和搜索，确认 renderer 收到并使用新 `query`。
4. 编辑记录，确认 `onMutation` 正确更新 dirty/save 状态。
5. 覆盖空表、配置字段缺失、只读模式与 mutation 被拒绝。
6. 用数千条记录验证分页与缓存保持有界。
7. 验证键盘焦点、窄容器与 light/dark theme。

## Package 边界

数据语义使用 `@eidos.space/eidos-file`，呈现层使用 `@eidos.space/eidos-file-ui`。Renderer 可以决定布局与交互，但不应复制 Eidos File schema 规则、编译 SQL 或自行解释字段存储格式。

返回 [Runtime 指南](#/docs/runtime)了解 Worker 与 data source 边界，或阅读[格式参考](#/docs/format)了解视图如何持久化。
