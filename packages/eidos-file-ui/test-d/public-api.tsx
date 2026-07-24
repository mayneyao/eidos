import type { ComponentProps } from "react"
import type { EidosFileSession, HostServices } from "@eidos.space/eidos-file"
import {
  EidosFileEditorShell,
  EidosFileProvider,
  EidosFileViewHost,
  defineEidosFileView,
  type EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"
import "@eidos.space/eidos-file-ui/styles.css"
import { EidosUIKernel } from "@eidos.space/eidos-file-ui/kernel"
import {
  EidosStandardView,
  EidosUIRuntimeProvider,
} from "@eidos.space/eidos-file-ui/runtime-platform"

const timeline = defineEidosFileView({
  type: "timeline",
  label: "Timeline",
  description: "Groups records by date",
  renderer(props: EidosFileViewRendererProps) {
    return <output>{props.table.table.name}</output>
  },
})

function Host({ session }: { session: EidosFileSession }) {
  return (
    <EidosFileProvider session={session}>
      <EidosFileViewHost renderers={{ [timeline.type]: timeline.renderer }} />
    </EidosFileProvider>
  )
}

function ExactViewer({ host }: { host: HostServices }) {
  const kernel = new EidosUIKernel(host)
  return (
    <EidosUIRuntimeProvider kernel={kernel}>
      <EidosStandardView />
    </EidosUIRuntimeProvider>
  )
}

function EditorShell() {
  return (
    <EidosFileEditorShell
      viewTabs={<nav>Views</nav>}
      queryToolbar={<menu>Search, Filter, Sort</menu>}
      fields={<button type="button">Fields</button>}
      sheetTabs={<nav>Tables</nav>}
    >
      <div>Data canvas</div>
    </EidosFileEditorShell>
  )
}

type ProviderProps = ComponentProps<typeof EidosFileProvider>
const trust: ProviderProps["themeName"] = "dark"

void Host
void ExactViewer
void EditorShell
void trust
