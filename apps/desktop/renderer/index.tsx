import React from "react"
import ReactDOM from "react-dom/client"

import "@/locales/i18n"
// space

import { DesktopSpaceLayout } from "./[database]/layout"
// extensions
import RootLayout from "./layout"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootLayout>
      <DesktopSpaceLayout />
    </RootLayout>{" "}
  </React.StrictMode>
)
