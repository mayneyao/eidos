import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@eidos.space/markdown-editor/styles.css"
import "./styles.css"
import { App } from "./app"

const root = document.getElementById("root")
if (!root) throw new Error("Markdown editor playground root is missing")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
