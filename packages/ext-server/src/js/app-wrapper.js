import React from "react"
import {
  ExtensionContextProvider,
  createEidos,
  useEidosStore,
} from "@eidos.space/react"
import { createRoot } from "react-dom/client"

import { Toaster } from "@/components/ui/toaster"

// Initialize the Eidos SDK with window.eidos for useEidos() hook
if (window.eidos) {
  const eidos = createEidos(window.eidos.currentSpace)
  useEidosStore.getState().setEidos(eidos)
}
let appRootInstance = null
let AppComponentRef = null
let currentProps = {
  ...(window.__serverSideProps || {}),
}

try {
  if (window.name) {
    currentProps = JSON.parse(window.name || "{}")
  } else {
    const deserializePropsFromUrl = (url) => {
      const props = {}
      url.searchParams.forEach((value, key) => {
        if (!value) {
          props[key] = value
          return
        }

        // Check if the value has our JSON prefix
        if (value.startsWith("__JSON__:")) {
          const jsonString = value.substring(9) // Remove '__JSON__:' prefix
          try {
            props[key] = JSON.parse(jsonString)
          } catch (e) {
            console.error(`Failed to parse JSON for key "${key}":`, e)
            // Fallback to the original value without prefix
            props[key] = jsonString || value
          }
        } else {
          // Try to automatically detect and parse common data types
          if (value === "true") {
            props[key] = true
          } else if (value === "false") {
            props[key] = false
          } else if (value === "null") {
            props[key] = null
          } else if (value === "undefined") {
            props[key] = undefined
          } else if (
            !isNaN(Number(value)) &&
            value.trim() !== "" &&
            !isNaN(parseFloat(value))
          ) {
            // Check if it's a number (integer or float)
            const numValue = Number(value)
            props[key] = Number.isInteger(numValue)
              ? parseInt(value, 10)
              : numValue
          } else {
            // Keep as string
            props[key] = value
          }
        }
      })
      return props
    }

    currentProps = {
      ...(window.__serverSideProps || {}),
      ...deserializePropsFromUrl(new URL(window.location.href)),
    }
  }
} catch (err) {
  console.error("Error parsing props:", err)
}

let retryCount = 0
const maxRetries = 3

// Parse client-side context from URL (space and URL params only, type comes from server)
const parseClientContext = () => {
  const hostname = window.location.hostname
  const pathname = window.location.pathname
  const hash = window.location.hash

  // Extract space from hostname: <extId>.block.<space>.eidos.localhost
  const hostMatch = hostname.match(/\.block\.(.+)\.eidos\.localhost/)
  const space = hostMatch?.[1] || ""

  const parts = pathname.split("/").filter(Boolean)

  // Build context with URL-derived values (type comes from server via extension.meta.type)
  let context = { space }

  if (hash) {
    // FileHandler: #<filePath>
    context.filePath = decodeURIComponent(hash.slice(1))
  } else if (parts.length === 2) {
    // TableView: /<tableId>/<viewId>
    context.tableId = parts[0]
    context.viewId = parts[1]
  } else if (parts.length === 1) {
    // ExtNode: /<nodeId>
    context.nodeId = parts[0]
  } else {
    context.nodeId = ""
  }

  return context
}

// Helper function to perform the rendering
const performRender = () => {
  if (appRootInstance && AppComponentRef) {
    // Merge server-side context with client-side context
    const serverContext = window.__extensionContext || {}
    const clientContext = parseClientContext()
    const extensionContext = { ...clientContext, ...serverContext }

    const appElement = React.createElement(AppComponentRef, currentProps)

    // Wrap with ExtensionContextProvider if context is available
    const wrappedApp = extensionContext.type
      ? React.createElement(
          ExtensionContextProvider,
          { context: extensionContext },
          appElement
        )
      : appElement

    appRootInstance.render(
      React.createElement(React.StrictMode, null, [
        wrappedApp,
        React.createElement(Toaster),
      ])
    )
  }
}

// Global function to update props and re-render
window.updateAppProps = (newProps) => {
  if (JSON.stringify(currentProps) === JSON.stringify(newProps)) {
    return
  }
  currentProps = newProps // Replace current props with new ones
  performRender()
}

window.addEventListener("message", (event) => {
  if (event.data.type === "props-change") {
    console.log("props-change", event.data.props)
    window.updateAppProps(event.data.props)
  }
  if (event.data.type === "theme-change") {
    document.documentElement.className = event.data.theme
    const { variables } = event.data
    if (variables) {
      Object.entries(variables).forEach(([name, value]) => {
        if (typeof value === "string") {
          document.documentElement.style.setProperty(`--${name}`, value)
        }
      })
    }
  }
})

const executeCode = async (initialProps = {}) => {
  try {
    const moduleExports = await import("/app.js")
    let MyComponent = moduleExports.default

    if (!MyComponent) {
      MyComponent = Object.values(moduleExports).find(
        (exported) => typeof exported === "function"
      )
    }

    if (!MyComponent) {
      throw new Error("Make sure to export a default component or a function")
    }

    AppComponentRef = MyComponent // Store the component reference
    currentProps = initialProps // Set initial props

    const rootElement = document.getElementById("root")
    if (!rootElement) {
      throw new Error("Root element not found")
    }

    // Create root instance only if it doesn't exist
    if (!appRootInstance) {
      appRootInstance = createRoot(rootElement)
    }

    performRender() // Call the render helper

    document.getElementById("loading").style.opacity = "0"
    setTimeout(() => {
      document.getElementById("loading").style.display = "none"
    }, 200)
  } catch (err) {
    console.error("Execution error:", err)
    console.error("Error stack:", err.stack)
    if (retryCount < maxRetries) {
      retryCount++
      console.log(`Retrying... Attempt ${retryCount} of ${maxRetries}`)
      const loadingEl = document.getElementById("loading")
      loadingEl.style.opacity = "1"
      loadingEl.style.display = "flex"
      setTimeout(() => executeCode(initialProps), 1000) // Pass initialProps in retry
      return
    }

    const errorElement = document.createElement("div")
    errorElement.style.color = "red"
    errorElement.style.padding = "1rem"
    errorElement.style.fontFamily = "monospace"
    errorElement.textContent = `\${err.message}\n${err.stack}`
    document.body.appendChild(errorElement)

    document.getElementById("loading").style.display = "none"
  }
}

executeCode(currentProps).catch((err) => {
  // Pass initial props (e.g., an empty object)
  console.error("Top level error:", err)
  document.getElementById("loading").style.display = "none"
})
