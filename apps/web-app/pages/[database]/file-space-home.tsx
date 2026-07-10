import { FileText, FolderOpen } from "lucide-react"

import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useTabTitle } from "@/hooks/use-tab-title"

export function FileSpaceHome() {
  const { currentSpace } = useCurrentSpace()
  useTabTitle(currentSpace?.name ?? "Space")

  return (
    <div className="flex h-full items-center justify-center px-6 py-12">
      <div className="max-w-md text-left">
        <div className="mb-5 flex items-center gap-3 text-muted-foreground">
          <FolderOpen className="h-5 w-5" />
          <span className="text-xs font-medium uppercase tracking-[0.14em]">
            File-based Space
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {currentSpace?.name}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Files in this folder are the source of truth. Open a Markdown file
          from the sidebar to edit it directly.
        </p>
        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-4 w-4" />
          Changes are saved back to the original file.
        </div>
      </div>
    </div>
  )
}
