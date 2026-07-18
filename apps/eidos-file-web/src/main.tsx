import React from "react"
import ReactDOM from "react-dom/client"

import { App } from "./app"
import { eidosFileDocsRouteFromPathname } from "./docs/routes"
import { I18nProvider } from "./i18n"
import "./styles.css"

const docsRoute = eidosFileDocsRouteFromPathname(window.location.pathname)

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider initialLocale={docsRoute?.locale}>
      <App />
    </I18nProvider>
  </React.StrictMode>
)
