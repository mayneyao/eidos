import React from "react"
import ReactDOM from "react-dom/client"

import "prismjs"

import "@/locales/i18n"
// space

import { DesktopSpaceLayout } from "./[database]/layout"
// extensions
import RootLayout from "./layout"
import { ErrorBoundary } from "./ErrorBoundary"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RootLayout>
        <DesktopSpaceLayout />
      </RootLayout>
    </ErrorBoundary>
  </React.StrictMode>
)
