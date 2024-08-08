import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createBrowserRouter } from "react-router-dom"

import { NotFound } from "@/app/404"
import NodePage from "@/app/[database]/[node]/page"
import SpaceHomePage from "@/app/[database]/page"
import { ErrorBoundary } from "@/app/error"

import RootLayout from "./layout"
import SpaceLayout from "./space-layout"

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        path: "404",
        element: <NotFound />,
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
