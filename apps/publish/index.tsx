import React from "react"
import ReactDOM from "react-dom/client"
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom"

import { NotFound } from "@/apps/web-app/404"
import NodePage from "@/apps/web-app/[database]/[node]/page"
import SpaceHomePage from "@/apps/web-app/[database]/page"
import { ErrorBoundary } from "@/apps/web-app/error"

import RootLayout from "./layout"
import SpaceLayout from "./space-layout"

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        index: true,
        element: <Navigate to="~" replace />,
      },
      {
        path: "404",
        element: <NotFound />,
      },
      {
        path: "~",
        element: <SpaceLayout />,
        children: [
          {
            index: true,
            element: <SpaceHomePage />,
          },
          {
            path: ":table",
            element: <NodePage />,
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
