import { AlertCircleIcon, ExternalLinkIcon } from "lucide-react"

import { EIDOS_SPACE_BASE_URL } from "@/lib/const"
import { Button } from "@/components/ui/button"

interface NoHandlerStateProps {
  fileExtension: string
  fileName: string
}

export function NoHandlerState({
  fileExtension,
  fileName,
}: NoHandlerStateProps) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center max-w-md">
        <AlertCircleIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Handler Available</h2>
        <p className="text-muted-foreground mb-2">
          No file handler is installed for{" "}
          <span className="font-mono">{fileExtension}</span> files.
        </p>
        <p className="text-sm text-muted-foreground mb-4">File: {fileName}</p>
        <p className="text-sm text-muted-foreground mb-4">
          You can install or create a file handler extension to handle this file
          type.
        </p>
        <Button asChild variant="default" className="mt-2">
          <a
            href={`${EIDOS_SPACE_BASE_URL}/extensions?type=block%2FfileHandler`}
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
