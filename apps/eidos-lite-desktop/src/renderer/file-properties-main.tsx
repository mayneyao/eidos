import React from "react"
import ReactDOM from "react-dom/client"
import "@glideapps/glide-data-grid/dist/index.css"
import { FilePropertiesApp } from "./file-properties-window"
import { PluginBluetoothPicker } from "./plugin-bluetooth-picker"
import { EidosLiteI18nProvider } from "./i18n"
import "./styles.css"
import "@eidos.space/markdown/styles.css"
import "@eidos.space/markdown/static.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EidosLiteI18nProvider>
      <FilePropertiesApp />
      <PluginBluetoothPicker />
    </EidosLiteI18nProvider>
  </React.StrictMode>
)
