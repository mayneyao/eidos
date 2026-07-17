# Build custom views for Eidos File

`@eidos.space/eidos-file-ui` is the shared React UI used by Eidos File hosts. Core provides the editor surface and Grid. Gallery, Kanban, and third-party saved view types are Eidos File plugins that a host imports explicitly.

The UI package does not open SQLite files. It consumes a `EidosFileEditorDataSource`, so the same components can work with a Web Worker, Electron IPC, or another host boundary.

## Install and render the editor

```bash
pnpm add @eidos.space/eidos-file @eidos.space/eidos-file-ui \
  @glideapps/glide-data-grid react react-dom
```

Import the published styles once in your application:

```ts
import "@eidos.space/eidos-file-ui/styles.css"
```

Render the active table and saved view:

```tsx
import {
  EidosFileEditorView,
  EidosFileUIProvider,
} from "@eidos.space/eidos-file-ui"
import { eidosFileGalleryPlugin } from "@eidos.space/eidos-file-ui/plugins/gallery"
import { eidosFileKanbanPlugin } from "@eidos.space/eidos-file-ui/plugins/kanban"

const plugins = [eidosFileGalleryPlugin, eidosFileKanbanPlugin]

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
        plugins={plugins}
        onError={(error) => console.error(error)}
      />
    </EidosFileUIProvider>
  )
}
```

`EidosFileEditorView` always routes `grid`. It resolves other types from the supplied plugins. All renderers share paging and mutation contracts rather than implementing separate data models.

## Use standalone view components

Low-level view components are also published as subpath exports when you need to compose your own shell:

```ts
import { EidosFileDataGrid } from "@eidos.space/eidos-file-ui/eidos-file-data-grid"
import { EidosFileGalleryView } from "@eidos.space/eidos-file-ui/eidos-file-gallery-view"
import { EidosFileKanbanView } from "@eidos.space/eidos-file-ui/eidos-file-kanban-view"
```

Use `EidosFileEditorView` for the complete routing contract. Use standalone exports only when your host intentionally owns paging, grouping, card projection, and the surrounding editor chrome.

## Choose a persisted view type

The view `type` stored in the `.eidos` file is an open string. Eidos reserves `grid`, `gallery`, and `kanban`; Grid is core, while Gallery and Kanban are official plugins. Use a namespaced key for third-party views, for example `com.example.timeline`.

Persist the view through the runtime:

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

Eidos File preserves the `type` and `properties` even when another host does not have your renderer. That host can show an unsupported-view message or fall back to Grid without rewriting the saved view.

Renderer resolution follows this order:

1. a matching renderer in the host's `renderers` registry;
2. a matching renderer contributed by an Eidos File plugin;
3. the built-in Grid renderer;
4. the host's `renderUnsupportedView` callback;
5. the package's default unsupported-view surface.

## Implement a custom renderer

A renderer is a React component with the `EidosFileViewRendererProps` contract. This minimal Timeline reads its field configuration from `view.properties`, requests a bounded projection, and reports errors to the host:

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

For a published renderer package, export an Eidos File plugin and let each host import it explicitly:

```tsx
import { defineEidosFilePlugin } from "@eidos.space/eidos-file-ui/plugin"
import { TimelineView } from "@example/eidos-file-timeline-view"

const timelinePlugin = defineEidosFilePlugin({
  id: "com.example.eidos-file.timeline",
  views: [{
    type: "com.example.timeline",
    label: "Timeline",
    description: "Records on a date axis",
    renderer: TimelineView,
  }],
})

<EidosFileEditorView
  source={source}
  table={table}
  view={view}
  plugins={[timelinePlugin]}
/>
```

Keep the plugin and plugin array outside render functions so their identity stays stable. Plugin and view identifiers must be unique; the registry rejects ambiguous host composition.

## Add the view to your editor's create menu

The plugin registry is also the source of truth for the view creation menu. Do not maintain a second catalog that can drift away from the imported plugins:

```ts
import { createEidosFilePluginRegistry } from "@eidos.space/eidos-file-ui/plugin"

const registry = createEidosFilePluginRegistry(plugins)
const viewContributions = [
  { type: "grid", label: "Grid" },
  ...Object.values(registry.views).filter(
    (view) => view.create?.isAvailable?.(fields) ?? true
  ),
]
```

Use each contribution's `create.defaultName` and optional `create.properties(fields)` when the user selects it. An imported Gallery, Kanban, or custom view plugin therefore becomes renderable and creatable through one contract.

Creating a view is a runtime operation. Add a host Worker action that calls `EidosFileRuntime.createView`, then return a fresh snapshot:

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

`EidosFileEditorDataSource` intentionally focuses on rendering and editing an existing surface, so view creation and deletion may remain explicit host actions. After either operation, replace the editor snapshot and select the new or fallback view.

Update renderer settings through the shared data source:

```ts
const nextSnapshot = await source.updateView(view.id, {
  properties: {
    ...(view.properties ?? {}),
    startField: selectedColumn,
  },
})
```

Store only JSON-compatible, portable values. Do not save DOM state, callbacks, Blob URLs, file handles, or application-local object identities in `properties`.

## Renderer contract

Every `EidosFileViewRenderer` receives:

| Prop          | Purpose                                                           |
| ------------- | ----------------------------------------------------------------- |
| `source`      | Async paging and mutation boundary                                |
| `table`       | Current table metadata, fields, views, and row count              |
| `view`        | Active saved view and renderer-specific properties                |
| `query`       | Normalized search, filter, and sort state for the active view     |
| `search`      | Current host search text                                          |
| `disabled`    | Read-only or busy state                                           |
| `reloadToken` | Signal to refresh cached pages                                    |
| callbacks     | Report mutations, snapshots, field panels, and errors to the host |

Your renderer should consume the supplied `query`. Do not read every row and reimplement filtering or sorting in React.

When a property references a missing or incompatible field, render a useful configuration state instead of throwing. An Eidos File can move between hosts with different renderer packages installed.

## Page records through the data source

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

Use `page.nextCursor` for the next contiguous page when available. Projection keeps card and timeline views from transferring every column in a wide table.

For Kanban-like grouped views, use `source.getGroupCounts` and add a group filter to the active query. Grouping semantics belong to the Eidos File runtime; a renderer should not download the full table to count columns.

## Edit through the shared boundary

```ts
const result = await source.updateRow(table.table.id, String(row._id), {
  status: "Done",
})

onMutation?.(result)
```

Respect `disabled`, surface errors through `onError`, and report successful mutations so the host can update dirty and save state. File ownership, permissions, recovery, and save conflicts remain the host's responsibility.

## View properties

Renderer-specific state belongs in `view.properties` and must be JSON-compatible. Prefer stable field column names over display names.

Good examples include:

- Timeline start and end fields;
- Map latitude and longitude fields;
- Chart category, value, and aggregation;
- Calendar date field and week-start preference.

Keep transient UI state—hover, an open menu, current drag position—inside the React component. Do not persist it into the `.eidos` file.

## Accessibility and performance

A public renderer should:

- provide keyboard navigation and visible focus;
- honor light and dark host themes;
- work in narrow containers rather than assuming a full window;
- virtualize large lists and keep caches bounded;
- request pages and projections instead of the full table;
- preserve unknown fields and view properties when saving;
- expose a useful empty, loading, and error state.

## Test a renderer as a portable contribution

Before publishing a custom view, verify:

1. Create the view, close the editor, reopen the same `.eidos`, and confirm the type and properties survive.
2. Open the file in a host without the renderer and confirm the view metadata remains unchanged.
3. Filter, sort, and search in the host; confirm the renderer receives and uses the updated `query`.
4. Edit a record and confirm `onMutation` updates dirty/save state.
5. Test empty tables, missing configured fields, read-only mode, and rejected mutations.
6. Test thousands of records with bounded pages and caches.
7. Verify keyboard focus, narrow containers, and both themes.

## Package boundaries

Use `@eidos.space/eidos-file` for data semantics and `@eidos.space/eidos-file-ui` for presentation. A renderer may choose layout and interaction, but it should not copy Eidos File schema rules, compile SQL, or interpret field storage independently.

Return to the [runtime guide](#/docs/runtime) for the Worker and data-source boundary, or read the [format reference](#/docs/format) for persisted view metadata.
