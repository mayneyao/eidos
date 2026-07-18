import type { ComponentProps } from "react"
import type { EidosFileSession } from "@eidos.space/eidos-file"
import {
  EidosFileProvider,
  EidosFileViewHost,
  defineEidosFileView,
  type EidosFileViewRendererProps,
} from "@eidos.space/eidos-file-ui"
import "@eidos.space/eidos-file-ui/styles.css"

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

type ProviderProps = ComponentProps<typeof EidosFileProvider>
const trust: ProviderProps["themeName"] = "dark"

void Host
void trust
