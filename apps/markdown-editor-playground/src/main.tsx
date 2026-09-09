import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./styles.css"
import { App } from "./app"
import { LocaleProvider } from "./locale"
import logo from "../../../packages/markdown/assets/markdown-logo.svg?url&no-inline"

const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
if (favicon) favicon.href = logo

const root = document.getElementById("root")
if (!root) throw new Error("Markdown editor playground root is missing")

createRoot(root).render(
  <StrictMode>
    <LocaleProvider>
      <App />
    </LocaleProvider>
  </StrictMode>
)
