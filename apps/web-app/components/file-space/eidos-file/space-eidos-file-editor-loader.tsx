import { type ComponentType, useCallback, useEffect, useState } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

import type { SpaceEidosFileRecordTarget } from "@/apps/web-app/components/file-space/file-path"
import { Button } from "@/components/ui/button"

interface SpaceEidosFileEditorComponentProps {
  filePath: string
  recordTarget?: SpaceEidosFileRecordTarget
}

export type SpaceEidosFileEditorComponent =
  ComponentType<SpaceEidosFileEditorComponentProps>

type SpaceEidosFileEditorModuleLoader =
  () => Promise<SpaceEidosFileEditorComponent>

let spaceEidosFileEditorPromise: Promise<SpaceEidosFileEditorComponent> | null =
  null

export function preloadSpaceEidosFileEditor(): Promise<SpaceEidosFileEditorComponent> {
  if (!spaceEidosFileEditorPromise) {
    spaceEidosFileEditorPromise = import("./space-eidos-file-editor")
      .then((module) => module.SpaceEidosFileEditor)
      .catch((error: unknown) => {
        spaceEidosFileEditorPromise = null
        throw error
      })
  }
  return spaceEidosFileEditorPromise
}

function loadErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Unable to load the Eidos File workspace"
}

export function SpaceEidosFileEditorLoader({
  filePath,
  recordTarget,
  loadEditor = preloadSpaceEidosFileEditor,
}: SpaceEidosFileEditorComponentProps & {
  loadEditor?: SpaceEidosFileEditorModuleLoader
}) {
  const [Editor, setEditor] = useState<SpaceEidosFileEditorComponent | null>(
    null
  )
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

  if (Editor) {
    return (
      <Editor
        key={`${filePath}:${recordTarget?.tableId ?? ""}:${
          recordTarget?.recordId ?? ""
        }`}
        filePath={filePath}
        recordTarget={recordTarget}
      />
    )
  }

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
            <p className="text-sm font-medium">Unable to open Eidos File</p>
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
      Opening Eidos File…
    </div>
  )
}
