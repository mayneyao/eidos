import RootLayout from "@/app/layout";
import HomePage from "@/app/page";
import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

// settings
import SettingsLayout from "@/app/settings/layout";
import SettingsPage from "@/app/settings/page";
import SettingsAccountPage from "@/app/settings/account/page";
import SettingsAIPage from "@/app/settings/ai/page";
import SettingsApiPage from "@/app/settings/api/page";
import SettingsAppearancePage from "@/app/settings/appearance/page";
import SettingsExperimentPage from "@/app/settings/experiment/page";

// space-manage
import SpaceManagePage from "@/app/space-manage/page";

// space
import SpaceLayout from '@/app/[database]/layout';
import EverydayHomePage from "@/app/[database]/everyday/page";
import EverydayPage from "@/app/[database]/everyday/[day]/page";
import NodePage from "@/app/[database]/[table]/page";

// share
import SharePage from "@/app/share/page";
import ShareLayout from "@/app/share/[database]/layout";
import ShareNodePage from "@/app/share/[database]/[table]/page";


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
            ]
          },
          {
            path: ":table",
            element: <NodePage />,
          }
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
              }
            ],
          },
        ]
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
