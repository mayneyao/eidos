import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createBrowserRouter, redirect } from "react-router-dom"

import { DownloadPage } from "@/components/landing/download"
import NodePage from "@/apps/web-app/[database]/[node]/page"
import EverydayPage from "@/apps/web-app/[database]/everyday/[day]/page"
import EverydayHomePage from "@/apps/web-app/[database]/everyday/page"
import { FileManager } from "@/apps/web-app/[database]/files/page"
// space
import SpaceLayout from "@/apps/web-app/[database]/layout"
import SpaceHomePage from "@/apps/web-app/[database]/page"
// extensions
import RootLayout from "@/apps/web-app/layout"
import { LandingPage } from "@/apps/web-app/page"
import SettingsAIPage from "@/apps/web-app/settings/ai/page"
import SettingsApiPage from "@/apps/web-app/settings/api/page"
import SettingsAppearancePage from "@/apps/web-app/settings/appearance/page"
import { BackupSettings } from "@/apps/web-app/settings/backup/page"
import SettingsExperimentPage from "@/apps/web-app/settings/experiment/page"
// settings
import SettingsLayout from "@/apps/web-app/settings/layout"
import SettingsPage from "@/apps/web-app/settings/page"
import SettingsStoragePage from "@/apps/web-app/settings/storage/page"
import ShareNodePage from "@/apps/web-app/share/[database]/[table]/page"
import ShareLayout from "@/apps/web-app/share/[database]/layout"
// share
import SharePage from "@/apps/web-app/share/page"

import { SpaceFileSystem } from "../../lib/storage/space"
import { NotFound } from "./404"
import { AppPage } from "./[database]/apps/page"
import { ScriptDetailPage } from "./[database]/scripts/detail"
import { ScriptPage } from "./[database]/scripts/page"
import { ScriptStorePage } from "./[database]/scripts/store"
import { SpaceSetting } from "./[database]/settings/page"
import { DocEditor } from "./eidtor/doc"
import { ErrorBoundary } from "./error"
import { LabPage } from "./lab"
import { LicenseManagePage } from "./license-manage/page"
import { DevtoolsPage } from "./settings/dev/page"

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
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
        path: "download",
        element: <DownloadPage />,
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
            path: "ai",
            element: <SettingsAIPage />,
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
            path: "extensions",
            children: [
              {
                index: true,
                id: "extensions",
                loader: async () => {
                  if (!(window as any)?.sqlite) {
                    return []
                  }
                  return await (window as any)?.sqlite?.listScripts()
                },
                element: <ScriptPage />,
              },
              {
                id: "script-store",
                path: "store",
                loader: async () => {
                  if (!(window as any)?.sqlite) {
                    return []
                  }
                  return await (window as any)?.sqlite?.listScripts()
                },
                element: <ScriptStorePage />,
              },
              {
                path: ":scriptId",
                loader: async ({ params }) => {
                  if (!(window as any)?.sqlite) {
                    return []
                  }
                  return await (window as any)?.sqlite?.getScript(
                    params.scriptId
                  )
                },
                element: <ScriptDetailPage />,
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
    <RouterProvider router={router} />
  </React.StrictMode>
)
