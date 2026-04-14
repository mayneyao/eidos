import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createBrowserRouter, redirect } from "react-router-dom"
import { QueryParamProvider } from "use-query-params"
import { ReactRouter6Adapter } from "use-query-params/adapters/react-router-6"

import "@/locales/i18n"
// space
import SpaceLayout from "@/apps/web-app/pages/[database]/layout"
// extensions
import RootLayout from "@/apps/web-app/pages/layout"
import { LandingPage } from "@/apps/web-app/pages/page"

import { spaceRoutes } from "../routes"
import { NotFound } from "./404"
import { ErrorBoundary } from "./error"
import { LabPage } from "./lab"

// Create a wrapper component that includes QueryParamProvider
const AppWithQueryParams = () => (
  <QueryParamProvider adapter={ReactRouter6Adapter}>
    <RootLayout />
  </QueryParamProvider>
)

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppWithQueryParams />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        path: "/",
        element: <LandingPage />,
      },
      {
        path: "404",
        element: <NotFound />,
      },
      {
        path: "lab",
        element: <LabPage />,
      },
      {
        path: ":database",
        element: <SpaceLayout />,
        loader: async ({ params }) => {
          // check the space is exist
          try {
            let spaceNames: string[] = []

            // In desktop mode, use IPC to get workspace list
            if (typeof window !== "undefined" && window.eidos) {
              try {
                const spaces = await window.eidos.spaceMgmt.listSpaces()
                spaceNames = spaces.map((space: any) => space.id)
              } catch (error) {
                console.error("Failed to get spaces from Electron:", error)
              }
            }
            // Web mode will only support single space, no validation needed

            if (
              params.database &&
              spaceNames.length > 0 &&
              !spaceNames.includes(params.database)
            ) {
              return redirect("/404")
            }
            return null
          } catch (error) {
            console.error("Error checking space existence:", error)
            return null
          }
        },
        children: spaceRoutes,
      },
    ],
  },
])

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} fallbackElement={<div>Loading...</div>} />
  </React.StrictMode>
)
