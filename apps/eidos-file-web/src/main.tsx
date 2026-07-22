import React from "react"
import ReactDOM from "react-dom/client"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui/context"

import { App } from "./app"
import { eidosFileDocsRouteFromPathname } from "./docs/routes"
import { I18nProvider, useI18n } from "./i18n"
import "./styles.css"

const docsRoute = eidosFileDocsRouteFromPathname(window.location.pathname)

function EidosFileUILocaleBridge({ children }: { children: React.ReactNode }) {
  const { locale } = useI18n()
  return <EidosFileUIProvider locale={locale}>{children}</EidosFileUIProvider>
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider initialLocale={docsRoute?.locale}>
      <EidosFileUILocaleBridge>
        <App />
      </EidosFileUILocaleBridge>
    </I18nProvider>
  </React.StrictMode>
)
