import React from "react"
import ReactDOM from "react-dom/client"
import "@glideapps/glide-data-grid/dist/index.css"

import { App } from "./app"
import "./styles.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
