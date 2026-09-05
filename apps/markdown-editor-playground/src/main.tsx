import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./styles.css"
import { Site } from "./site/site"
import { LocaleProvider } from "./site/locale"
import { logo } from "./site/brand"

const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
if (favicon) favicon.href = logo

const root = document.getElementById("root")
if (!root) throw new Error("Markdown editor playground root is missing")

createRoot(root).render(
  <StrictMode>
    <LocaleProvider>
      <Site />
    </LocaleProvider>
  </StrictMode>
)
