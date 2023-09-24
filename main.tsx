import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createBrowserRouter } from "react-router-dom"

import NodePage from "@/app/[database]/[table]/page"
import EverydayPage from "@/app/[database]/everyday/[day]/page"
import EverydayHomePage from "@/app/[database]/everyday/page"
import { FileManager } from "@/app/[database]/files/page"
// space
import SpaceLayout from "@/app/[database]/layout"
import SpaceHomePage from "@/app/[database]/page"
// extensions
import { ExtensionPage } from "@/app/extensions/page"
import RootLayout from "@/app/layout"
import HomePage from "@/app/page"
import SettingsAccountPage from "@/app/settings/account/page"
import SettingsAIPage from "@/app/settings/ai/page"
import SettingsApiPage from "@/app/settings/api/page"
import SettingsAppearancePage from "@/app/settings/appearance/page"
import { BackupSettings } from "@/app/settings/backup/page"
import SettingsExperimentPage from "@/app/settings/experiment/page"
// settings
import SettingsLayout from "@/app/settings/layout"
import SettingsPage from "@/app/settings/page"
import ShareNodePage from "@/app/share/[database]/[table]/page"
import ShareLayout from "@/app/share/[database]/layout"
// share
import SharePage from "@/app/share/page"
// space-manage
import SpaceManagePage from "@/app/space-manage/page"

import { ExtensionContainer } from "./app/extensions/container"

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        path: "/",
        element: <HomePage />,
      },
      {
        path: "offline",
        element: <HomePage />,
      },
      {
        path: "extensions",
        element: <ExtensionPage />,
      },
      {
        path: "ext",
        children: [
          {
            path: ":ext",
            element: <ExtensionContainer />,
          },
        ],
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
            path: "account",
            element: <SettingsAccountPage />,
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
        path: "space-manage",
        element: <SpaceManagePage />,
      },
      {
        path: ":database",
        element: <SpaceLayout />,
        children: [
          {
            index: true,
            element: <SpaceHomePage />,
          },
          {
            path: "opfs",
            element: <FileManager />,
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
    ],
  },
])

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
