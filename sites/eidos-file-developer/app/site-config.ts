export const RELEASE_VERSION = "0.1.0"

export const navigation = [
  { href: "/quickstart", label: "Quickstart" },
  { href: "/build-a-view", label: "Build a View" },
  { href: "/embed", label: "Embed" },
  { href: "/api", label: "API / Contracts" },
  { href: "/playground", label: "Playground" },
] as const

export const installCommand =
  "pnpm add @eidos.space/eidos-file@0.1.0 @eidos.space/eidos-file-ui@0.1.0 @glideapps/glide-data-grid marked@^4 react react-dom"

export const minimalHostCode = `import { useMemo } from "react"
import { EidosFileSession } from "@eidos.space/eidos-file"
import { EidosFileBrowserRuntime } from "@eidos.space/eidos-file/browser"
import {
  EidosFileProvider,
  EidosFileViewHost,
} from "@eidos.space/eidos-file-ui"
import "@eidos.space/eidos-file-ui/styles.css"

export function FileEditor() {
  const session = useMemo(
    () => new EidosFileSession(new EidosFileBrowserRuntime()),
    []
  )

  return (
    <EidosFileProvider session={session} themeName="light">
      <EidosFileViewHost />
    </EidosFileProvider>
  )
}`

export const viewCode = `import {
  defineEidosFileView,
  type EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"

function Timeline({ source, table, query }: EidosFileViewRendererProps) {
  // Page rows through the host-neutral async data source.
  // See the live implementation in this site's Playground.
  return <section aria-label={\`\${table.table.name} timeline\`} />
}

export const timelineView = defineEidosFileView({
  type: "timeline",
  label: "Timeline",
  description: "Group dated records by delivery month.",
  renderer: Timeline,
  create: { defaultName: "Timeline" },
})`

export const embedCode = `const handle = await pickBrowserEidosFile()
if (handle) await session.open(handle)

// The host chooses which trusted renderers are available.
<EidosFileViewHost
  viewId={activeViewId}
  renderers={{ timeline: timelineView.renderer }}
/>

// Mutations update the working copy. Save is explicit.
session.markDirty()
await session.checkpoint()
await session.save()`
