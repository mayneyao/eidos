import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createBrowserRouter, redirect } from "react-router-dom"

import NodePage from "@/app/[database]/[node]/page"
import EverydayPage from "@/app/[database]/everyday/[day]/page"
import EverydayHomePage from "@/app/[database]/everyday/page"
import { FileManager } from "@/app/[database]/files/page"
// space
import SpaceLayout from "@/app/[database]/layout"
import SpaceHomePage from "@/app/[database]/page"
// extensions
import RootLayout from "@/app/layout"
import { LandingPage } from "@/app/page"
import SettingsAIPage from "@/app/settings/ai/page"
import SettingsApiPage from "@/app/settings/api/page"
import SettingsAppearancePage from "@/app/settings/appearance/page"
import { BackupSettings } from "@/app/settings/backup/page"
import SettingsExperimentPage from "@/app/settings/experiment/page"
// settings
import SettingsLayout from "@/app/settings/layout"
import SettingsPage from "@/app/settings/page"
import SettingsStoragePage from "@/app/settings/storage/page"
import ShareNodePage from "@/app/share/[database]/[table]/page"
import ShareLayout from "@/app/share/[database]/layout"
// share
import SharePage from "@/app/share/page"

import { NotFound } from "./app/404"
import { AppPage } from "./app/[database]/apps/page"
import { ScriptDetailPage } from "./app/[database]/scripts/detail"
import { ScriptPage } from "./app/[database]/scripts/page"
import { ScriptStorePage } from "./app/[database]/scripts/store"
import { SpaceSetting } from "./app/[database]/settings/page"
import { DocEditor } from "./app/eidtor/doc"
import { ErrorBoundary } from "./app/error"
import { LabPage } from "./app/lab"
import { LicenseManagePage } from "./app/license-manage/page"
import { DevtoolsPage } from "./app/settings/dev/page"
import { spaceFileSystem } from "./lib/storage/space"

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
          const spaceNames = await spaceFileSystem.list()
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
