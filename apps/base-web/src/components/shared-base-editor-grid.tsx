import { lazy, Suspense } from "react"
import { BaseUIProvider } from "@eidos.space/base-ui/context"
import type { BaseDataGridProps } from "@eidos.space/base-ui/base-data-grid"

const BaseDataGrid = lazy(() =>
  import("@eidos.space/base-ui/base-data-grid").then((module) => ({
    default: module.BaseDataGrid,
  }))
)

interface SharedBaseEditorGridProps extends BaseDataGridProps {
  theme: "light" | "dark"
  loadingLabel?: string
}

/**
 * Loads the canonical Desktop Grid only when an editor surface is mounted.
 * The provider is intentionally host-owned so Desktop and Web can share the
 * exact behavior while resolving theme and files for their own environment.
 */
export function SharedBaseEditorGrid({
  theme,
  loadingLabel = "Loading Base editor…",
  ...props
}: SharedBaseEditorGridProps) {
  return (
    <BaseUIProvider themeName={theme}>
      <Suspense
        fallback={
          <div className="shared-grid-loading" role="status">
            {loadingLabel}
          </div>
        }
      >
        <BaseDataGrid {...props} />
      </Suspense>
    </BaseUIProvider>
  )
}
