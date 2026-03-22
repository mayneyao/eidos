import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface ExtensionPreviewProps {
  type: "sidebar" | "file-handler" | "folder-handler" | null
}

export function ExtensionPreview({ type }: ExtensionPreviewProps) {
  return (
    <div className="p-3 w-full aspect-[4/3] relative overflow-hidden flex flex-col">
      {/* App Frame */}
      <div className="flex flex-1 w-full bg-background border border-border rounded shadow-xs overflow-hidden">
        {/* Sidebar */}
        <div
          className={cn(
            "w-[30%] border-r flex flex-col transition-all duration-300 relative",
            type === "sidebar" ? "bg-primary/5" : "bg-muted/5"
          )}
        >
          {/* Horizontal Tabs Row (Top) */}
          <div className="flex items-center gap-1 h-8 border-b px-2">
            <Skeleton className="h-6 w-8 rounded opacity-40" />
            <Skeleton className="h-6 w-8 rounded opacity-40" />

            {/* Highlighted New Tab */}
            {type === "sidebar" && (
              <div className="h-6 w-8 bg-primary/20 rounded border border-primary/20 animate-pulse shadow-xs flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-primary/40" />
              </div>
            )}

            <Skeleton className="h-6 w-8 rounded opacity-40" />
          </div>

          <div className="p-2 space-y-2">
            <Skeleton className="h-6 w-full rounded-md opacity-30" />{" "}
            {/* Search/Other */}
            {/* Sidebar Content (List) */}
            <div className="space-y-2 opacity-30 pt-1">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div
          className={cn(
            "flex-1 flex flex-col transition-all duration-300",
            type === "file-handler" || type === "folder-handler"
              ? "bg-primary/5"
              : ""
          )}
        >
          {/* Header */}
          <div className="h-8 border-b bg-muted/5 w-full shrink-0" />

          {/* Content Area */}
          <div className="flex-1 p-6 flex flex-col">
            <div
              className={cn(
                "flex-1 rounded border border-dashed border-muted-foreground/20 flex flex-col items-center justify-center gap-2 p-4",
                type === "file-handler" || type === "folder-handler"
                  ? "border-primary/40 bg-primary/5 shadow-[inset_0_0_20px_rgba(var(--primary),0.05)]"
                  : ""
              )}
            >
              {type === "file-handler" ? (
                <>
                  <div className="h-12 w-16 rounded bg-primary/20 flex items-center justify-center animate-pulse border border-primary/20">
                    <span className="text-[10px] text-primary font-bold">
                      FILE
                    </span>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="text-xs text-primary font-medium">
                      Opens in Editor
                    </div>
                    <Skeleton className="h-2 w-24 bg-primary/10 mx-auto" />
                  </div>
                </>
              ) : type === "folder-handler" ? (
                <>
                  <div className="h-12 w-16 rounded bg-primary/20 flex items-center justify-center animate-pulse border border-primary/20">
                    <span className="text-[10px] text-primary font-bold">
                      📁
                    </span>
                  </div>
                  <div className="text-center space-y-2">
                    <div className="text-xs text-primary font-medium">
                      Browses Folders
                    </div>
                    <Skeleton className="h-2 w-24 bg-primary/10 mx-auto" />
                  </div>
                </>
              ) : (
                <div className="space-y-4 w-full px-8 opacity-20">
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-2 w-[80%]" />
                  <Skeleton className="h-2 w-[90%]" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 text-xs text-muted-foreground text-center h-4 flex items-center justify-center">
        {type === "sidebar" && (
          <span className="flex items-center gap-1 text-primary">
            Adds a new tab to sidebar
          </span>
        )}
        {type === "file-handler" && (
          <span className="flex items-center gap-1 text-primary">
            Handles opening files
          </span>
        )}
        {type === "folder-handler" && (
          <span className="flex items-center gap-1 text-primary">
            Handles browsing folders
          </span>
        )}
      </div>
    </div>
  )
}
