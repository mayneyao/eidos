import { AlertCircleIcon, ExternalLinkIcon } from "lucide-react"

import { EIDOS_SPACE_BASE_URL } from "@/lib/const"
import { Button } from "@/components/ui/button"

interface NoHandlerStateProps {
  folderPath: string
  folderName: string
}

export function NoHandlerState({
  folderPath,
  folderName,
}: NoHandlerStateProps) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center max-w-md">
        <AlertCircleIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Handler Available</h2>
        <p className="text-muted-foreground mb-2">
          No folder handler is available for this folder.
        </p>
        <p className="text-sm text-muted-foreground mb-4">Path: {folderPath}</p>
        <p className="text-sm text-muted-foreground mb-4">
          You can install or create a folder handler extension to customize how
          this folder is displayed.
        </p>
        <Button asChild variant="default" className="mt-2">
          <a
            href={`${EIDOS_SPACE_BASE_URL}/extensions?type=block`}
            target="_blank"
            className="inline-flex items-center gap-2"
          >
            Browse Extensions
            <ExternalLinkIcon className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  )
}
