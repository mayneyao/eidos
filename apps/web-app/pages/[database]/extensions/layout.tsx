import { Outlet } from "react-router-dom"

export const ExtensionsLayout = () => {
  return (
    <div className="h-full overflow-hidden">
      <Outlet />
    </div>
  )
}