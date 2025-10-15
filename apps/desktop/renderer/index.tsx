import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createBrowserRouter, redirect } from "react-router-dom"
import { QueryParamProvider } from "use-query-params"
import { ReactRouter6Adapter } from "use-query-params/adapters/react-router-6"

import CreateSpacePage from "@/apps/desktop/renderer/initial-setup/create-space"
import InitialSetupPage from "@/apps/desktop/renderer/initial-setup/storage-setup"
import NodePage from "@/apps/web-app/pages/[database]/[node]/page"
import EverydayPage from "@/apps/web-app/pages/[database]/everyday/[day]/page"
import EverydayHomePage from "@/apps/web-app/pages/[database]/everyday/page"
import { FileManager } from "@/apps/web-app/pages/[database]/files/page"

import "@/locales/i18n"
import { NotFound } from "@/apps/web-app/pages/404"
import { BlocksPage } from "@/apps/web-app/pages/[database]/blocks/page"
import { ExtensionDetailPage } from "@/apps/web-app/pages/[database]/extensions/detail"
import { ExtensionsEmptyState } from "@/apps/web-app/pages/[database]/extensions/empty-state"
import { ExtensionsLayout } from "@/apps/web-app/pages/[database]/extensions/layout"
// space
import SpaceHomePage from "@/apps/web-app/pages/[database]/page"
import { SpaceSetting } from "@/apps/web-app/pages/[database]/settings/page"
import { DocEditor } from "@/apps/web-app/pages/eidtor/doc"
import { ErrorBoundary } from "@/apps/web-app/pages/error"
import { LabPage } from "@/apps/web-app/pages/lab"
import { LicenseManagePage } from "@/apps/web-app/pages/license-manage/page"
import { LandingPage } from "@/apps/web-app/pages/page"
import ShareNodePage from "@/apps/web-app/pages/share/[database]/[table]/page"
import ShareLayout from "@/apps/web-app/pages/share/[database]/layout"
// share
import SharePage from "@/apps/web-app/pages/share/page"

import { DesktopSpaceLayout } from "./[database]/layout"
import BlockPage from "./[database]/standalone-blocks/page"
// extensions
import RootLayout from "./layout"

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
        element: <DesktopSpaceLayout />,
        loader: async () => {
          console.log("🔍 Root route loader executing")
          console.log("📍 Current URL:", window.location.href)
          console.log("📍 Current hostname:", window.location.hostname)
          console.log("📍 Current port:", window.location.port)

          const hostname = window.location.hostname
          let spaceId = null

          if (hostname.endsWith(".eidos.localhost")) {
            const parts = hostname.split(".")
            if (parts.length >= 2) {
              spaceId = parts[0]
            }
          }

          console.log("Extracted space ID from hostname:", spaceId)

          try {
            console.log("Checking spaces via list-spaces IPC...")
            const spaces = await window.eidos.invoke("list-spaces")
            console.log("Spaces result:", spaces)

            if (!spaces || spaces.length === 0) {
              console.log("No spaces available, redirecting to initial-setup")
              return redirect("/initial-setup")
            }

            if (spaceId) {
              const spaceExists = spaces.some(
                (space: any) => space.id === spaceId
              )
              console.log(`Checking if space '${spaceId}' exists:`, spaceExists)
              if (!spaceExists) {
                console.log(`Space '${spaceId}' not found, redirecting to 404`)
                return redirect("/404")
              }
            }

            console.log("All checks passed, proceeding normally")
            return null
          } catch (error) {
            console.error("Error checking spaces via IPC:", error)
            console.log("Falling back to legacy methods...")

            const isDataFolderSet = await window.eidos.checkIsDataFolderSet()
            console.log("checkIsDataFolderSet result:", isDataFolderSet)

            if (!isDataFolderSet) {
              console.log("Data folder not set, redirecting to initial-setup")
              return redirect("/initial-setup")
            }

            if (spaceId) {
              const spaceExists = await window.eidos.isSpaceExist(spaceId)
              console.log(
                `Legacy check: space '${spaceId}' exists:`,
                spaceExists
              )
              if (!spaceExists) {
                console.log(
                  `Legacy check: space '${spaceId}' not found, redirecting to 404`
                )
                return redirect("/404")
              }
            }

            console.log("Legacy checks passed, proceeding normally")
            return null
          }
        },
        children: [
          {
            index: true,
            element: <SpaceHomePage />,
          },
          {
            path: "standalone-blocks",
            children: [
              {
                path: ":id",
                element: <BlockPage />,
              },
            ],
          },
          {
            path: "blocks",
            children: [
              {
                path: ":blockId",
                element: <BlocksPage />,
              },
            ],
          },
          {
            path: "settings",
            element: <SpaceSetting />,
          },
          {
            path: "opfs",
            element: <FileManager />,
          },
          {
            path: "extensions",
            element: <ExtensionsLayout />,
            children: [
              {
                index: true,
                element: <ExtensionsEmptyState />,
              },
              {
                path: ":scriptId",
                loader: async ({ params }) => {
                  if (!(window as any)?.sqlite) {
                    return {}
                  }
                  return await (window as any)?.sqlite?.extension.get(
                    params.scriptId
                  )
                },
                element: <ExtensionDetailPage />,
              },
            ],
          },
          {
            path: "everyday",
            children: [
              {
                index: true,
                element: <EverydayHomePage />,
              },
              {
                path: ":day",
                element: <EverydayPage />,
              },
            ],
          },
          {
            path: ":table",
            element: <NodePage />,
          },
        ],
      },
      {
        path: "initial-setup",
        element: <InitialSetupPage />,
      },
      {
        path: "create-space",
        element: <CreateSpacePage />,
      },
      {
        path: "404",
        element: <NotFound />,
      },
      {
        path: "my-licenses",
        element: <LicenseManagePage />,
      },
      {
        path: "lab",
        element: <LabPage />,
      },
      {
        path: "share",
        children: [
          {
            index: true,
            element: <SharePage />,
          },
          {
            path: ":database",
            element: <ShareLayout />,
            children: [
              {
                path: ":table",
                element: <ShareNodePage />,
              },
            ],
          },
        ],
      },
      {
        path: "editor",
        children: [
          {
            path: "doc",
            element: <DocEditor />,
          },
        ],
      },
    ],
  },
])

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} fallbackElement={<div>Loading...</div>} />
  </React.StrictMode>
)
