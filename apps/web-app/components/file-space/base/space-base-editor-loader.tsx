import { type ComponentType, useCallback, useEffect, useState } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

interface SpaceBaseEditorComponentProps {
  filePath: string
}

export type SpaceBaseEditorComponent =
  ComponentType<SpaceBaseEditorComponentProps>

type SpaceBaseEditorModuleLoader = () => Promise<SpaceBaseEditorComponent>

let spaceBaseEditorPromise: Promise<SpaceBaseEditorComponent> | null = null

export function preloadSpaceBaseEditor(): Promise<SpaceBaseEditorComponent> {
  if (!spaceBaseEditorPromise) {
    spaceBaseEditorPromise = import("./space-base-editor")
      .then((module) => module.SpaceBaseEditor)
      .catch((error: unknown) => {
        spaceBaseEditorPromise = null
        throw error
      })
  }
  return spaceBaseEditorPromise
}

function loadErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Unable to load the Base workspace"
}

export function SpaceBaseEditorLoader({
  filePath,
  loadEditor = preloadSpaceBaseEditor,
}: SpaceBaseEditorComponentProps & {
  loadEditor?: SpaceBaseEditorModuleLoader
}) {
  const [Editor, setEditor] = useState<SpaceBaseEditorComponent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setError(null)

    void loadEditor()
      .then((LoadedEditor) => {
        if (active) setEditor(() => LoadedEditor)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setEditor(null)
        setError(loadErrorMessage(loadError))
      })

    return () => {
      active = false
    }
  }, [attempt, loadEditor])

  const retry = useCallback(() => {
    setAttempt((current) => current + 1)
  }, [])

  if (Editor) return <Editor key={filePath} filePath={filePath} />

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div
          className="flex max-w-md flex-col items-center gap-3 text-center"
          role="alert"
        >
          <AlertTriangle
            className="h-5 w-5 text-destructive"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium">Unable to open Base</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={retry}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex h-full items-center justify-center gap-3 p-8 text-sm text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <RefreshCw
        className="h-4 w-4 animate-spin motion-reduce:animate-none"
        aria-hidden="true"
      />
      Opening Base…
    </div>
  )
}
