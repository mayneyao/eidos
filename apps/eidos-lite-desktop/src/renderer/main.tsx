import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./app"
import "@glideapps/glide-data-grid/dist/index.css"

import { PluginBluetoothPicker } from "./plugin-bluetooth-picker"
import { EidosLiteI18nProvider } from "./i18n"
import "./styles.css"
import "@eidos.space/markdown/styles.css"
import "@eidos.space/markdown/static.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EidosLiteI18nProvider>
      <App />
      <PluginBluetoothPicker />
    </EidosLiteI18nProvider>
  </React.StrictMode>
)
