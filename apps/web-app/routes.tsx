import type { RouteObject } from "react-router-dom"

import NodePage from "@/apps/web-app/pages/[database]/[node]/page"
import { BlocksPage } from "@/apps/web-app/pages/[database]/blocks/page"
import { ExtensionDetailPage } from "@/apps/web-app/pages/[database]/extensions/detail"
import { ExtensionsEmptyState } from "@/apps/web-app/pages/[database]/extensions/empty-state"
import { ExtensionsLayout } from "@/apps/web-app/pages/[database]/extensions/layout"
import { FileHandlerPage } from "@/apps/web-app/pages/[database]/file-handler/page"
import { FolderHandlerPage } from "@/apps/web-app/pages/[database]/folder-handler/page"
import EverydayPage from "@/apps/web-app/pages/[database]/journals/[day]/page"
import EverydayHomePage from "@/apps/web-app/pages/[database]/journals/page"
import SpaceHomePage from "@/apps/web-app/pages/[database]/page"
import AgentPage from "@/apps/web-app/pages/[database]/agent/page"
import TerminalPage from "@/apps/web-app/pages/[database]/terminal/page"

export const spaceRoutes: RouteObject[] = [
  {
    index: true,
    element: <SpaceHomePage />,
  },
  {
    path: "file-handler",
    element: <FileHandlerPage />,
  },
  {
    path: "folder",
    element: <FolderHandlerPage />,
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
        element: <ExtensionDetailPage />,
      },
    ],
  },
  {
    path: "journals",
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
    path: "terminal",
    element: <TerminalPage />,
  },
  {
    path: "agent/:sessionId?",
    element: <AgentPage />,
  },

  {
    path: ":table",
    element: <NodePage />,
  },
]
