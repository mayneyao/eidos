import { lazy, Suspense } from "react"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui/context"
import type { EidosFileEditorViewProps } from "@eidos.space/eidos-file-ui/eidos-file-editor-view"

import { useI18n } from "../i18n"

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

function activateBrowserUrl(uri: string): void {
  if (uri.length === 0 || uri.length > 8_192 || uri !== uri.trim()) {
    throw new Error("Invalid external URL")
  }
  const url = new URL(uri)
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("External URLs require HTTP or HTTPS without credentials")
  }
  const anchor = document.createElement("a")
  anchor.href = uri
  anchor.target = "_blank"
  anchor.rel = "noopener noreferrer"
  anchor.referrerPolicy = "no-referrer"
  anchor.click()
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
  const { locale } = useI18n()
  return (
    <EidosFileUIProvider
      themeName={theme}
      locale={locale}
      activateUrl={activateBrowserUrl}
    >
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
