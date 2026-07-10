import { FileSpaceSidebar } from "@/apps/web-app/components/file-space/sidebar"
import { TabManager } from "@/apps/web-app/components/tab-manager"
import { Nav } from "@/components/nav"

import { TabContentLayout } from "./tab-content-layout"

export function FileSpaceLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <FileSpaceSidebar />
      <main className="flex h-screen min-w-0 flex-1 flex-col">
        <Nav />
        <TabManager>
          <TabContentLayout />
        </TabManager>
      </main>
    </div>
  )
}
