# 基于 Eidos File 1.0 构建

Eidos 1.0 包含四个可互操作层，依赖顺序固定：

```text
File Format → Runtime → Adapter → UI
```

以下冻结英文规范是 normative，中文文件是逐项参考：

- [Eidos File 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-file-1.0.md)
- [Eidos Runtime 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-runtime-1.0.md)
- [Eidos Adapter 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-adapter-1.0.md)
- [Eidos UI 1.0](https://github.com/mayneyao/eidos/blob/main/docs/specs/eidos-ui-1.0.md)

## 安装

```bash
pnpm add @eidos.space/eidos-file@1.0.0 \
  @eidos.space/eidos-file-ui@1.0.0 react react-dom
```

应用只需引入一次 `@eidos.space/eidos-file-ui/styles.css`。

## Runtime 与 Adapter

把 EA-Connection-1.0 `ConnectionPort` 传给 `Runtime.open` 或
`Runtime.create`。Browser 参考实现是 `SQLiteWasmConnectionPort`，Desktop
参考实现是 `BetterSqlite3ConnectionPort`。

```ts
import { Runtime, type ConnectionPort } from "@eidos.space/eidos-file"

const { service, hostBridge } = await Runtime.open(
  connection satisfies ConnectionPort,
  environment,
  "readwrite",
  { cancellation, deadlineMilliseconds: 30_000 }
)
```

只有 `service` 可以作为 `RuntimeClient` 暴露。`hostBridge` 必须留在可信
Adapter / product composition 内。浏览器中，Connection 与 Runtime 位于
Dedicated Worker，并通过 `AdapterTransportRuntimeClient` 提供给 Window；不能把
SQLite 或原始文件 handle 发送给 UI。

产品实现 `HostServices`，负责 opaque source/destination token、权限、保存/CAS、
冲突、恢复与资产。Host 可以持有 trusted bridge，UI 不可以。

## Viewer

```tsx
import { useEffect, useMemo, type ReactNode } from "react"
import type { HostServices } from "@eidos.space/eidos-file"
import {
  EidosFileUIProvider,
  type AssetPresenter,
} from "@eidos.space/eidos-file-ui"
import { EidosUIKernel } from "@eidos.space/eidos-file-ui/kernel"
import {
  EidosStandardView,
  EidosUIRuntimeProvider,
} from "@eidos.space/eidos-file-ui/runtime-platform"

function Viewer({
  host,
  sourceToken,
  assetPresenter,
}: {
  host: HostServices
  sourceToken: string
  assetPresenter: AssetPresenter<ReactNode>
}) {
  const kernel = useMemo(() => new EidosUIKernel(host), [host])
  useEffect(() => {
    void kernel.openSource({ sourceToken, access: "read" })
    return () => {
      void kernel.close()
    }
  }, [kernel, sourceToken])
  return (
    <EidosFileUIProvider locale="zh">
      <EidosUIRuntimeProvider kernel={kernel} assetPresenter={assetPresenter}>
        <EidosStandardView />
      </EidosUIRuntimeProvider>
    </EidosFileUIProvider>
  )
}
```

Kernel 先协商 Host 与 Runtime，再加载 snapshot 和与 revision 绑定的 schema。
Grid、Gallery 与 Kanban 只消费 Runtime 的 columnar 结果；它们不会在本地重做
File filter、Formula、Lookup、Relation、aggregate 或 group 语义。

`EidosFileUIProvider` 支持 `locale="en"` 与 `locale="zh"`，Host 也可以通过
`messages` 或 `translate` 覆盖文本。Locale 只改变 UI copy、accessibility label、
input affordance 与 formatting；canonical option name 以及用户创建的 Table、Field、
View name 始终是 File data，绝不会被翻译。

File-entry URI 不是 presentation URL。relative、`https:` 与 canonical inline
image Data URL 全部通过 `HostServices.resolveAsset`；只有注入的
`AssetPresenter` 可以消费 lease token。没有 session-scoped relative root 的
Host 必须省略该 capability。打开/下载是显式 lease action；普通 URL 字段不会
自动 fetch。

## 必需的互操作验证

- Browser WASM 与 Desktop better-sqlite3 跑同一 Runtime contract；
- Connection 层验证 tagged value、嵌套事务、snapshot、取消与错误映射；
- transported mutation 必须在 COMMIT 前完成 prepared-commit receipt；
- UI 验证 snapshot/schema/page cursor binding 与 revision invalidation；
- optional capability 为 false 时，对应 optional method 必须不存在，不能用 stub 伪装。
- 覆盖 invalid Base64/media/size、1 MiB inline 边界、missing relative root、
  lease expiry/fallback，以及 zero direct URI fetch/navigation。
