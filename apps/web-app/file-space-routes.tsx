import { Navigate, type RouteObject } from "react-router-dom"

import {
  FILE_SPACE_FILE_ROUTE,
  FILE_SPACE_AGENT_ROUTE,
  FILE_SPACE_EXTENSION_PANEL_ROUTE,
  FILE_SPACE_SETTINGS_ROUTE,
  FILE_SPACE_VERSION_DIFF_ROUTE,
  FILE_SPACE_VERSION_CONFLICTS_ROUTE,
  FILE_SPACE_VERSION_HISTORY_ROUTE,
} from "@/apps/web-app/file-space-route-policy"
import { SpaceFilePage } from "@/apps/web-app/pages/[database]/space-file/page"
import { SpaceExtensionPanelPage } from "@/apps/web-app/pages/[database]/extension-panel/page"
import { SpaceVersionDiffPage } from "@/apps/web-app/pages/[database]/space-version-diff/page"
import { SpaceVersionConflictsPage } from "@/apps/web-app/pages/[database]/space-version-conflicts/page"
import { SpaceVersionHistoryPage } from "@/apps/web-app/pages/[database]/space-version-history/page"
import SettingsPage from "@/apps/web-app/pages/[database]/settings/page"
import SpaceHomePage from "@/apps/web-app/pages/[database]/page"
import { FileSpaceAgentPage } from "@/apps/web-app/pages/[database]/file-agent/page"

export const fileSpaceRoutes: RouteObject[] = [
  {
    index: true,
    element: <SpaceHomePage />,
  },
  {
    path: FILE_SPACE_AGENT_ROUTE,
    element: <FileSpaceAgentPage />,
  },
  {
    path: FILE_SPACE_FILE_ROUTE,
    element: <SpaceFilePage />,
  },
  {
    path: FILE_SPACE_EXTENSION_PANEL_ROUTE,
    element: <SpaceExtensionPanelPage />,
  },
  {
    path: FILE_SPACE_SETTINGS_ROUTE,
    element: <SettingsPage />,
  },
  {
    path: FILE_SPACE_VERSION_HISTORY_ROUTE,
    element: <SpaceVersionHistoryPage />,
  },
  {
    path: FILE_SPACE_VERSION_DIFF_ROUTE,
    element: <SpaceVersionDiffPage />,
  },
  {
    path: FILE_SPACE_VERSION_CONFLICTS_ROUTE,
    element: <SpaceVersionConflictsPage />,
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]
