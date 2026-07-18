# 基于 Eidos File 构建

Eidos File `0.1.0` 提供两个公共层：与宿主无关的 headless runtime，以及 React View Host。你的应用负责文件选择、权限、保存决策与可信视图代码；package 负责可携带的数据和视图契约。

## 安装

```bash
pnpm add @eidos.space/eidos-file@0.1.0 \
  @eidos.space/eidos-file-ui@0.1.0 \
  @glideapps/glide-data-grid marked@^4 react react-dom
```

在应用中引入一次编译后的样式。Consumer 不需要配置 Tailwind。

```ts
import "@eidos.space/eidos-file-ui/styles.css"
```

浏览器构建需要 SQLite WASM 与 top-level await。Vite 项目应添加 `vite-plugin-wasm` 和 `vite-plugin-top-level-await`，并从依赖预构建中排除 `@sqlite.org/sqlite-wasm`。

## 嵌入 View Host

创建一个 `EidosFileSession`，连接浏览器 adapter，再通过 React Provider 提供给视图：

```tsx
import { useEffect, useMemo } from "react"
import { EidosFileSession } from "@eidos.space/eidos-file"
import {
  EidosFileBrowserRuntime,
  IndexedDbEidosFileRecoveryStore,
  pickBrowserEidosFile,
} from "@eidos.space/eidos-file/browser"
import {
  EidosFileProvider,
  EidosFileViewHost,
} from "@eidos.space/eidos-file-ui"
import "@eidos.space/eidos-file-ui/styles.css"

export function EidosFileEditor() {
  const session = useMemo(
    () =>
      new EidosFileSession(
        new EidosFileBrowserRuntime(),
        new IndexedDbEidosFileRecoveryStore()
      ),
    []
  )

  useEffect(() => () => void session.close(), [session])

  async function openFile() {
    const handle = await pickBrowserEidosFile()
    if (handle) await session.open(handle)
  }

  return (
    <EidosFileProvider session={session} themeName="light">
      <button type="button" onClick={() => void openFile()}>
        打开 .eidos 文件
      </button>
      <EidosFileViewHost />
    </EidosFileProvider>
  )
}
```

`EidosFileViewHost` 渲染当前持久化视图。文件选择、视图切换、保存与冲突操作，以及 session cleanup 仍由宿主负责。

## 构建类型安全的视图

Renderer 会收到异步 data source、类型化的 table/view descriptor、规范化 query、selection、commands 与明确的 capabilities。它不会获得 SQLite、原始文件字节、routes、Zustand store 或 Electron IPC。

```tsx
import { useEffect, useState } from "react"
import type { EidosFileRow } from "@eidos.space/eidos-file"
import {
  defineEidosFileView,
  type EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"

function Timeline({
  source,
  table,
  query,
  reloadToken,
  disabled,
  onMutation,
  onError,
}: EidosFileViewRendererProps) {
  const [rows, setRows] = useState<EidosFileRow[]>([])

  useEffect(() => {
    let active = true
    source
      .getPage(table.table.id, 0, 50, query)
      .then((page) => active && setRows(page.rows))
      .catch(onError)
    return () => {
      active = false
    }
  }, [onError, query, reloadToken, source, table.table.id])

  return (
    <ol aria-label={`${table.table.name} timeline`}>
      {rows.map((row) => (
        <li key={String(row._id)}>
          <time>{String(row.due ?? "未排期")}</time>
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              try {
                const result = await source.updateRow(
                  table.table.id,
                  String(row._id),
                  { status: "Done" }
                )
                onMutation?.(result)
              } catch (error) {
                onError?.(error)
              }
            }}
          >
            {String(row.title ?? "未命名")}
          </button>
        </li>
      ))}
    </ol>
  )
}

export const timelineView = defineEidosFileView({
  type: "com.example.timeline",
  label: "Timeline",
  description: "在交付时间轴上呈现带日期的记录。",
  renderer: Timeline,
  create: { defaultName: "Timeline" },
})
```

使用持久化 type 注册 renderer：

```tsx
<EidosFileViewHost
  renderers={{ "com.example.timeline": timelineView.renderer }}
/>
```

创建持久化视图时，调用 session 的公共 data source，再把返回的 snapshot 标记为 dirty：

```ts
const source = session.getState().source
const next = await source?.createView(tableId, {
  name: timelineView.create.defaultName,
  type: timelineView.type,
})

if (next) session.markDirty(next)
```

第三方视图应使用带命名空间的 type。其他宿主未安装该 renderer 时，可以回退到 Grid，但必须保留 type 与兼容 JSON 的 `view.properties`。

## 保存、冲突与恢复

完成 mutation 后调用 `session.markDirty(nextSnapshot?)`。保存会把打开文件时记录的 revision 与当前原文件比较，执行 compare-and-swap 写入。

```ts
import { EidosFileHostError } from "@eidos.space/eidos-file"

session.markDirty()
await session.checkpoint()

try {
  await session.save()
} catch (error) {
  if (error instanceof EidosFileHostError && error.code === "conflict") {
    // 提供重新加载、明确覆盖或另存为。
  }
}
```

不要静默解决冲突。Chromium 宿主获得授权后可以写回原文件；其他浏览器应提供另存为或下载副本。文件字节始终留在浏览器内。

## 公共边界

| 层                                | 负责内容                                                                    |
| --------------------------------- | --------------------------------------------------------------------------- |
| `@eidos.space/eidos-file`         | descriptor、handler、runtime、分页、mutation、session state、冲突与恢复契约 |
| `@eidos.space/eidos-file/browser` | 浏览器 handle、SQLite WASM、picker、下载与 IndexedDB recovery               |
| `@eidos.space/eidos-file-ui`      | provider、hooks、View Host、共享视图、commands、selection 与作用域样式      |
| 你的宿主                          | 权限、导航、持久化决策、错误 UI 与可信 renderer import                      |

React 视图是可信应用代码，不是运行在沙箱中的 Eidos Space Extension。应像审查其他依赖一样审查它，并且只提供必要的宿主能力。
