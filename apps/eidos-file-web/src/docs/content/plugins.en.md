# Compose an Eidos File editor with plugins

Eidos File plugins are trusted modules that an editor host imports at build time. They are inspired by Lexical's composition model: the editor core stays small, while a host chooses which views and workflows to mount.

They are **not Eidos Space extensions**. Eidos File plugins have no install manifest, marketplace lifecycle, sandbox, or direct access to a Space. A plugin receives only the public editor data source and the host adapter passed to its factory.

## What belongs in core?

The core is the minimum required to open and safely edit every `.eidos` file:

| Core capability                                   | Why it is always present                              |
| ------------------------------------------------- | ----------------------------------------------------- |
| Format validation, schema, migrations             | Every host must interpret the same file safely        |
| Query, filter, sort, paging and transactions      | Data semantics cannot depend on installed UI          |
| Row and field editing                             | A file must remain editable without optional packages |
| Grid, selection, keyboard and virtualization      | Grid is the universal lossless fallback               |
| Table/view metadata and unknown-view preservation | Missing plugins must never rewrite saved metadata     |
| Plugin registry, slots and duplicate-ID checks    | Composition itself is part of the editor contract     |
| File open/save/recovery adapter boundary          | The host owns handles and persistence                 |

## What should be a plugin?

Plugins add workflows or presentations that can be removed without making the file unreadable:

| Plugin boundary           | Contribution                                                        |
| ------------------------- | ------------------------------------------------------------------- |
| Gallery                   | `gallery` saved-view renderer and creation metadata                 |
| Kanban                    | `kanban` renderer, Select-field requirement and defaults            |
| CSV Import                | Workbar action, preview UI and an adapter to runtime CSV operations |
| CSV Export                | A view action and download/save adapter                             |
| Graft versioning          | History/status UI backed by a host-provided Graft adapter           |
| Calendar, Timeline, Chart | Namespaced saved-view renderers                                     |

The package currently exposes Gallery, Kanban and CSV Import as official entry points. CSV Export, Graft and future visualizations should use the same boundary when their public adapters are available.

Formula, Lookup, Select, Relation and attachment value encodings are **not plugins**. They are format/runtime semantics. A plugin may provide a better editor for them, but it cannot redefine how their values are stored.

## Add official views explicitly

Grid is available without optional imports. Gallery and Kanban become available only when their plugins are passed to the editor:

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

Keep the array outside React render functions so plugin identity stays stable. If the file contains a `kanban` view and the Kanban plugin is absent, the view type and properties remain intact; the editor shows an unavailable-view surface.

## Add CSV Import

CSV parsing, type inference and the import transaction live in `@eidos.space/eidos-file/csv`. The UI plugin only owns file selection, preview controls and placement in the editor.

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

`copy` is optional; pass it when the host supports multiple languages. Keep the adapter opaque: the source ID may refer to a browser `File`, a Desktop picker token, or another host-owned resource.

Mount action plugins with the public slot component:

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

The browser adapter sends bytes to a Worker, where the shared runtime parses and writes them. A Desktop adapter can instead use a streaming worker with progress and cancellation. Neither adapter duplicates CSV type inference or SQLite business rules.

## Define a custom view plugin

Use a namespaced persisted type. The renderer receives bounded paging and mutation APIs, never a SQLite connection:

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

Plugin IDs, action IDs and view types must be unique. `createEidosFilePluginRegistry()` rejects collisions before rendering, so host composition errors cannot silently select the wrong implementation.

## Security and ownership boundary

- The host owns file handles, save state, recovery and permission prompts.
- `@eidos.space/eidos-file` owns schema, query, transactions and value codecs.
- Plugins own optional UI and workflow orchestration.
- Plugins receive public adapters, not arbitrary SQL or raw file access.
- Unavailable plugins never delete or rewrite their persisted view metadata.

Continue with [Build custom views](#/docs/custom-views) for renderer paging, mutations and performance rules.
