import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createBrowserRouter, redirect } from "react-router-dom"
import { QueryParamProvider } from "use-query-params"
import { ReactRouter6Adapter } from "use-query-params/adapters/react-router-6"

import CreateSpacePage from "@/apps/desktop/renderer/initial-setup/create-space"
import InitialSetupPage from "@/apps/desktop/renderer/initial-setup/storage-setup"
import SettingsApiPage from "@/apps/desktop/renderer/settings/api/page"
import SettingsSecurityPage from "@/apps/desktop/renderer/settings/security/page"
import SettingsStoragePage from "@/apps/desktop/renderer/settings/storage/page"
import SettingsSyncPage from "@/apps/desktop/renderer/settings/sync/page"
import NodePage from "@/apps/web-app/pages/[database]/[node]/page"
import EverydayPage from "@/apps/web-app/pages/[database]/everyday/[day]/page"
import EverydayHomePage from "@/apps/web-app/pages/[database]/everyday/page"
import { FileManager } from "@/apps/web-app/pages/[database]/files/page"

import "@/locales/i18n"
import { NotFound } from "@/apps/web-app/pages/404"
import { AppPage } from "@/apps/web-app/pages/[database]/apps/page"
import { BlocksPage } from "@/apps/web-app/pages/[database]/blocks/page"
import { ExtensionDetailPage } from "@/apps/web-app/pages/[database]/extensions/detail"
import { ExtensionsEmptyState } from "@/apps/web-app/pages/[database]/extensions/empty-state"
import { ExtensionsLayout } from "@/apps/web-app/pages/[database]/extensions/layout"
import { ScriptPage } from "@/apps/web-app/pages/[database]/extensions/page"
// space
import SpaceHomePage from "@/apps/web-app/pages/[database]/page"
import { SpaceSetting } from "@/apps/web-app/pages/[database]/settings/page"
import { DocEditor } from "@/apps/web-app/pages/eidtor/doc"
import { ErrorBoundary } from "@/apps/web-app/pages/error"
import { LabPage } from "@/apps/web-app/pages/lab"
import { LicenseManagePage } from "@/apps/web-app/pages/license-manage/page"
import { LandingPage } from "@/apps/web-app/pages/page"
import { SettingsAILayout } from "@/apps/web-app/pages/settings/ai/layout"
import SettingsAIPage from "@/apps/web-app/pages/settings/ai/page"
import { ProviderPage } from "@/apps/web-app/pages/settings/ai/provider/page"
import SettingsApiKeyPage from "@/apps/web-app/pages/settings/api-key/page"
import SettingsAppearancePage from "@/apps/web-app/pages/settings/appearance/page"
import { BackupSettings } from "@/apps/web-app/pages/settings/backup/page"
import { DevtoolsPage } from "@/apps/web-app/pages/settings/dev/page"
import SettingsExperimentPage from "@/apps/web-app/pages/settings/experiment/page"
// settings
import SettingsPage from "@/apps/web-app/pages/settings/general/page"
import SettingsLayout from "@/apps/web-app/pages/settings/layout"
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
        element: <LandingPage />,
        loader: ({ params }) => {
          if (!window.eidos.checkIsDataFolderSet()) {
            console.log(
              "redirect to initial-setup",
              window.eidos.checkIsDataFolderSet()
            )
            return redirect("/initial-setup")
          }
          return null
        },
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
            path: "security",
            element: <SettingsSecurityPage />,
          },
          {
            path: "backup",
            element: <BackupSettings />,
          },
          {
            path: "sync",
            element: <SettingsSyncPage />,
          },
        ],
      },
      {
        path: ":database",
        element: <DesktopSpaceLayout />,
        loader: async ({ params }) => {
          // check the space is exist
          if (!window.eidos.checkIsDataFolderSet()) {
            return redirect("/initial-setup")
          }
          const spaceNames = await window.eidos.spaceFileSystem.list()
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
            path: "apps",
            children: [
              {
                path: ":id",
                element: <AppPage />,
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
                    return {}
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
