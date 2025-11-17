import { AlertCircleIcon } from "lucide-react"

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
      </div>
    </div>
  )
}
