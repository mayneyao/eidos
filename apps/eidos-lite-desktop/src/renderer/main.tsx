import React from "react"
import ReactDOM from "react-dom/client"
import "@glideapps/glide-data-grid/dist/index.css"

import { PluginBluetoothPicker } from "./plugin-bluetooth-picker"
import { EidosLiteI18nProvider } from "./i18n"
import "./styles.css"
import "@eidos.space/markdown/styles.css"
import "@eidos.space/markdown/static.css"

// Choose the entry before importing the workbench. A native inspector should
// not parse the workspace, terminal, editors and Sync panels to show a form.
const loadApp =
  window.location.hash === "#/file-properties"
    ? import("./file-properties-window").then(
        ({ FilePropertiesApp }) => FilePropertiesApp
      )
    : import("./app").then(({ App }) => App)

void loadApp.then((App) =>
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <EidosLiteI18nProvider>
        <App />
        <PluginBluetoothPicker />
      </EidosLiteI18nProvider>
    </React.StrictMode>
  )
)
