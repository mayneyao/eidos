import React from "react"
import ReactDOM from "react-dom/client"
import "@glideapps/glide-data-grid/dist/index.css"

import { App } from "./app"
import { EidosLiteI18nProvider } from "./i18n"
import "./styles.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EidosLiteI18nProvider>
      <App />
    </EidosLiteI18nProvider>
  </React.StrictMode>
)
