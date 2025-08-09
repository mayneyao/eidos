import { Outlet } from "react-router-dom"

import { ExtensionSidebar } from "./components/extension-sidebar"

export const ExtensionsLayout = () => {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Sidebar - Extension Directory Tree */}
      <ExtensionSidebar />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}