import { lazy, Suspense } from "react"
import { BaseUIProvider } from "@eidos.space/base-ui/context"
import type { BaseEditorViewProps } from "@eidos.space/base-ui/base-editor-view"

const BaseEditorView = lazy(() =>
  import("@eidos.space/base-ui/base-editor-view").then((module) => ({
    default: module.BaseEditorView,
  }))
)

interface SharedBaseEditorViewProps extends BaseEditorViewProps {
  theme: "light" | "dark"
  loadingLabel?: string
}

/**
 * Loads the canonical Desktop Grid only when an editor surface is mounted.
 * The provider is intentionally host-owned so Desktop and Web can share the
 * exact behavior while resolving theme and files for their own environment.
 */
export function SharedBaseEditorView({
  theme,
  loadingLabel = "Loading Base editor…",
  ...props
}: SharedBaseEditorViewProps) {
  return (
    <BaseUIProvider themeName={theme}>
      <Suspense
        fallback={
          <div className="shared-grid-loading" role="status">
            {loadingLabel}
          </div>
        }
      >
        <BaseEditorView {...props} />
      </Suspense>
    </BaseUIProvider>
  )
}
