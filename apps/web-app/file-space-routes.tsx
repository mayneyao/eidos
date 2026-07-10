import { Navigate, type RouteObject } from "react-router-dom"

import {
  FILE_SPACE_FILE_ROUTE,
  FILE_SPACE_SETTINGS_ROUTE,
  FILE_SPACE_VERSION_HISTORY_ROUTE,
} from "@/apps/web-app/file-space-route-policy"
import { SpaceFilePage } from "@/apps/web-app/pages/[database]/space-file/page"
import { SpaceVersionHistoryPage } from "@/apps/web-app/pages/[database]/space-version-history/page"
import SettingsPage from "@/apps/web-app/pages/[database]/settings/page"
import SpaceHomePage from "@/apps/web-app/pages/[database]/page"

export const fileSpaceRoutes: RouteObject[] = [
  {
    index: true,
    element: <SpaceHomePage />,
  },
  {
    path: FILE_SPACE_FILE_ROUTE,
    element: <SpaceFilePage />,
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
    path: "*",
    element: <Navigate to="/" replace />,
  },
]
