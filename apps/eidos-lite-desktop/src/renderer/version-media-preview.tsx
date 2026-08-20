import { useEffect, useState } from "react"
import { CircleAlert, FileWarning, LoaderCircle } from "lucide-react"

import type { TextFilePreviewResult } from "../shared/contracts"
import { MediaFilePreview } from "./media-file-preview"

type MediaPreview = Extract<TextFilePreviewResult, { type: "media" }>

type PreviewState =
  | { phase: "loading" }
  | { phase: "ready"; preview: MediaPreview }
  | { phase: "unavailable" }
  | { phase: "error"; message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function VersionWorkingMediaPreview({ path }: { path: string }) {
  const [state, setState] = useState<PreviewState>({ phase: "loading" })

  useEffect(() => {
    let active = true
    setState({ phase: "loading" })
    void window.eidosLite.previewTextFile(path).then(
      (preview) => {
        if (!active) return
        setState(
          preview.type === "media"
            ? { phase: "ready", preview }
            : { phase: "unavailable" }
        )
      },
      (error) => {
        if (!active) return
        setState({ phase: "error", message: errorMessage(error) })
      }
    )
    return () => {
      active = false
    }
  }, [path])

  if (state.phase === "ready") {
    return <MediaFilePreview preview={state.preview} />
  }
  if (state.phase === "loading") {
    return (
      <div className="version-inspector-loading" role="status">
        <LoaderCircle className="spin" aria-hidden="true" />
        <div>
          <strong>Loading local media…</strong>
          <p>Preparing a preview from the current Space file.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="version-inspector-empty"
      role={state.phase === "error" ? "alert" : undefined}
    >
      {state.phase === "error" ? (
        <CircleAlert aria-hidden="true" />
      ) : (
        <FileWarning aria-hidden="true" />
      )}
      <div>
        <strong>
          {state.phase === "error"
            ? "Media preview could not be loaded"
            : "Preview not available"}
        </strong>
        <p>
          {state.phase === "error"
            ? state.message
            : "This local binary format does not have an in-app preview."}
        </p>
        <dl>
          <div>
            <dt>Path</dt>
            <dd>{path}</dd>
          </div>
          <div>
            <dt>Kind</dt>
            <dd>binary file</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
