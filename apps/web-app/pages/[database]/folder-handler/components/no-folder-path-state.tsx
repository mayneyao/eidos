import { AlertCircleIcon } from "lucide-react"

export function NoFolderPathState() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center max-w-md">
        <AlertCircleIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Folder Specified</h2>
        <p className="text-muted-foreground mb-4">
          Please provide a folder path in the URL hash (e.g., #~/documents)
        </p>
      </div>
    </div>
  )
}
