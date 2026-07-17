import { lazy, Suspense } from "react"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui/context"
import type { EidosFileEditorViewProps } from "@eidos.space/eidos-file-ui/eidos-file-editor-view"

const EidosFileEditorView = lazy(() =>
  import("@eidos.space/eidos-file-ui/eidos-file-editor-view").then(
    (module) => ({
      default: module.EidosFileEditorView,
    })
  )
)

interface SharedEidosFileEditorViewProps extends EidosFileEditorViewProps {
  theme: "light" | "dark"
  loadingLabel?: string
}

/**
 * Loads the canonical Desktop Grid only when an editor surface is mounted.
 * The provider is intentionally host-owned so Desktop and Web can share the
 * exact behavior while resolving theme and files for their own environment.
 */
export function SharedEidosFileEditorView({
  theme,
  loadingLabel = "Loading Eidos File editor…",
  ...props
}: SharedEidosFileEditorViewProps) {
  return (
    <EidosFileUIProvider themeName={theme}>
      <Suspense
        fallback={
          <div className="shared-grid-loading" role="status">
            {loadingLabel}
          </div>
        }
      >
        <EidosFileEditorView {...props} />
      </Suspense>
    </EidosFileUIProvider>
  )
}
