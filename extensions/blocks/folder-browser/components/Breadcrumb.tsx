import { ChevronRightIcon, HomeIcon } from "lucide-react"
import { buildBreadcrumbSegments } from "../utils"

interface BreadcrumbProps {
  folderPath: string
  onNavigate: (path: string) => void
}

export function Breadcrumb({ folderPath, onNavigate }: BreadcrumbProps) {
  const segments = buildBreadcrumbSegments(folderPath)
  const isSystemFolder = folderPath.startsWith("@/")

  // For system folder (@/), @/ is the root and shouldn't be shown as clickable segment
  // For home folder (~/), ~ is the root and should be clickable
  const rootPath = isSystemFolder ? "@/" : "~/"
  const hasSubPath = segments.length > 1

  return (
    <div className="flex items-center flex-1 min-w-0 overflow-hidden">
      {/* Root indicator - clickable for ~/, hidden for @/ */}
      {!isSystemFolder && (
        <button
          onClick={() => onNavigate("~/")}
          className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-accent transition-colors shrink-0"
          title="Home"
        >
          <HomeIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}

      {/* Path segments (skip the root prefix segment) */}
      {segments.slice(1).map((segment, index) => (
        <div key={segment.path} className="flex items-center shrink-0">
          <ChevronRightIcon className="h-4 w-4 text-muted-foreground/50 mx-0.5" />
          <button
            onClick={() => onNavigate(segment.path)}
            className={`text-sm px-1.5 py-0.5 rounded-md transition-colors max-w-[120px] truncate ${
              segment.isLast
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {segment.name}
          </button>
        </div>
      ))}
    </div>
  )
}
