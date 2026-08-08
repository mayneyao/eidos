import React from "react"
import ReactDOM from "react-dom/client"

import { ServeApp } from "./app"
import "./styles.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ServeApp />
  </React.StrictMode>
)
