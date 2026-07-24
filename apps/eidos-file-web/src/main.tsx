import React from "react"
import ReactDOM from "react-dom/client"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui/context"

import { App } from "./app"
import { I18nProvider, useI18n } from "./i18n"
import "./styles.css"

const EIDOS_SPACE_ORIGIN = "https://eidos.space"

// The Eidos File documentation now lives on eidos.space. Redirect the old
// editor.eidos.space docs URLs (and the legacy hash routes) there before
// booting the editor.
const docsPathMatch = /^\/(?:(zh)\/)?docs((?:\/[^/?#]*)?)\/?$/.exec(
  window.location.pathname
)
const legacyDocsHashMatch = /^#\/docs(?:\/([^#?]+))?/.exec(window.location.hash)

if (docsPathMatch) {
  const slug = docsPathMatch[2] ?? ""
  const zhPrefix = docsPathMatch[1] === "zh" ? "/zh" : ""
  window.location.replace(
    `${EIDOS_SPACE_ORIGIN}${zhPrefix}/docs${slug ? `${slug}/` : "/"}`
  )
} else if (legacyDocsHashMatch) {
  const slug = legacyDocsHashMatch[1] ? `/${legacyDocsHashMatch[1]}` : ""
  const zhPrefix = navigator.language.toLowerCase().startsWith("zh")
    ? "/zh"
    : ""
  window.location.replace(
    `${EIDOS_SPACE_ORIGIN}${zhPrefix}/docs${slug ? `${slug}/` : "/"}`
  )
} else {
  function EidosFileUILocaleBridge({
    children,
  }: {
    children: React.ReactNode
  }) {
    const { locale } = useI18n()
    return <EidosFileUIProvider locale={locale}>{children}</EidosFileUIProvider>
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <I18nProvider>
        <EidosFileUILocaleBridge>
          <App />
        </EidosFileUILocaleBridge>
      </I18nProvider>
    </React.StrictMode>
  )
}
