import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createBrowserRouter, redirect } from "react-router-dom"
import { QueryParamProvider } from "use-query-params"
import { ReactRouter6Adapter } from "use-query-params/adapters/react-router-6"

import { SpaceFileSystem } from "@/lib/storage/space"
import NodePage from "@/apps/web-app/pages/[database]/[node]/page"
import EverydayPage from "@/apps/web-app/pages/[database]/everyday/[day]/page"
import EverydayHomePage from "@/apps/web-app/pages/[database]/everyday/page"
import { FileManager } from "@/apps/web-app/pages/[database]/files/page"

import "@/locales/i18n"
// space
import SpaceLayout from "@/apps/web-app/pages/[database]/layout"
import SpaceHomePage from "@/apps/web-app/pages/[database]/page"
// extensions
import RootLayout from "@/apps/web-app/pages/layout"
import { LandingPage } from "@/apps/web-app/pages/page"
import SettingsAIPage from "@/apps/web-app/pages/settings/ai/page"
import SettingsApiPage from "@/apps/web-app/pages/settings/api/page"
import SettingsAppearancePage from "@/apps/web-app/pages/settings/appearance/page"
import { BackupSettings } from "@/apps/web-app/pages/settings/backup/page"
import SettingsExperimentPage from "@/apps/web-app/pages/settings/experiment/page"
import SettingsPage from "@/apps/web-app/pages/settings/general/page"
// settings
import SettingsLayout from "@/apps/web-app/pages/settings/layout"
import SettingsStoragePage from "@/apps/web-app/pages/settings/storage/page"
import ShareNodePage from "@/apps/web-app/pages/share/[database]/[table]/page"
import ShareLayout from "@/apps/web-app/pages/share/[database]/layout"
// share
import SharePage from "@/apps/web-app/pages/share/page"

import { NotFound } from "./404"
import { AppPage } from "./[database]/apps/page"
import { BlocksPage } from "./[database]/blocks/page"
import { ExtensionDetailPage } from "./[database]/extensions/detail"
import { ExtensionsEmptyState } from "./[database]/extensions/empty-state"
import { ExtensionsLayout } from "./[database]/extensions/layout"
import { ScriptPage } from "./[database]/extensions/page"
import { SpaceSetting } from "./[database]/settings/page"
import { DocEditor } from "./eidtor/doc"
import { ErrorBoundary } from "./error"
import { LabPage } from "./lab"
import { LicenseManagePage } from "./license-manage/page"
import { SettingsAILayout } from "./settings/ai/layout"
import { ProviderPage } from "./settings/ai/provider/page"
import SettingsApiKeyPage from "./settings/api-key/page"
import { DevtoolsPage } from "./settings/dev/page"

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
        path: "my-licenses",
        element: <LicenseManagePage />,
      },
      {
        path: "lab",
        element: <LabPage />,
      },
      {
        path: "settings",
        element: <SettingsLayout />,
        children: [
          {
            index: true,
            element: <SettingsPage />,
          },
          {
            path: "dev",
            element: <DevtoolsPage />,
          },
          {
            path: "storage",
            element: <SettingsStoragePage />,
          },
          {
            path: "api",
            element: <SettingsApiPage />,
          },
          {
            path: "api-key",
            element: <SettingsApiKeyPage />,
          },
          {
            path: "ai",
            element: <SettingsAILayout />,
            children: [
              {
                index: true,
                element: <SettingsAIPage />,
              },
              {
                path: "provider",
                children: [
                  {
                    path: ":providerId",
                    element: <ProviderPage />, // /settings/ai/provider/:providerId 的目标组件
                  },
                ],
              },
            ],
          },
          {
            path: "appearance",
            element: <SettingsAppearancePage />,
          },
          {
            path: "experiment",
            element: <SettingsExperimentPage />,
          },
          {
            path: "backup",
            element: <BackupSettings />,
          },
        ],
      },
      {
        path: ":database",
        element: <SpaceLayout />,
        loader: async ({ params }) => {
          // check the space is exist

          const spaceNames = await new SpaceFileSystem().list()
          if (params.database && !spaceNames.includes(params.database)) {
            return redirect("/404")
          }
          return null
        },
        children: [
          {
            index: true,
            element: <SpaceHomePage />,
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
            path: "apps",
            children: [
              {
                path: ":id",
                element: <AppPage />,
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
                    return null
                  }
                  return await (window as any)?.sqlite?.getScript(
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
