import { lazy, Suspense, useEffect, useState } from "react"
import type { FileDiffMetadata } from "@pierre/diffs"
import { CircleAlert, LoaderCircle, RotateCcw } from "lucide-react"

import type {
  SpaceVersionTextContentDiff,
  SpaceVersionTextContentState,
} from "../shared/contracts"
import type { VersionTextDiffComputationResponse } from "./version-text-diff-computation"

const PierreTextDiffSurface = lazy(() => import("./pierre-text-diff-surface"))

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function byteCount(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value)
}

function contentStateMessage(
  state: SpaceVersionTextContentState
): string | null {
  switch (state.state) {
    case "absent":
    case "utf8":
      return null
    case "too_large":
      return `This version is ${byteCount(state.size)}B and exceeds the 1 MB preview limit.`
    case "missing_payload":
      return "The file metadata exists, but its historical payload is not available locally."
    case "invalid_utf8":
      return "This file version is not valid UTF-8 text."
    case "unsafe_path":
      return "The working path is not a regular file or was replaced by a symbolic link."
    case "changed_during_read":
      return "The working file changed while it was being read. Retry to compare its latest contents."
  }
}

function contentValue(state: SpaceVersionTextContentState): string | null {
  if (state.state === "absent") return ""
  return state.state === "utf8" ? state.content : null
}

function VersionTextDiffUnavailable({
  before,
  after,
}: Pick<SpaceVersionTextContentDiff, "before" | "after">) {
  const message = contentStateMessage(before) ?? contentStateMessage(after)
  return (
    <div className="version-text-diff-message" role="status">
      <CircleAlert aria-hidden="true" />
      <div>
        <strong>Text preview unavailable</strong>
        <p>{message ?? "This checkpoint does not contain readable text."}</p>
      </div>
    </div>
  )
}

function ComputedTextDiff({
  content,
}: {
  content: SpaceVersionTextContentDiff
}) {
  const [layout, setLayout] = useState<"split" | "unified">("split")
  const [diff, setDiff] = useState<FileDiffMetadata | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const before = contentValue(content.before)
  const after = contentValue(content.after)

  useEffect(() => {
    if (before === null || after === null) return
    setDiff(null)
    setFailure(null)
    const worker = new Worker(
      new URL("./version-text-diff-worker.ts", import.meta.url),
      { type: "module" }
    )
    worker.onmessage = (
      event: MessageEvent<VersionTextDiffComputationResponse>
    ) => {
      worker.terminate()
      if (event.data.diff) setDiff(event.data.diff)
      else setFailure(event.data.error ?? "Unable to compute this text diff")
    }
    worker.onerror = () => {
      worker.terminate()
      setFailure("Unable to compute this text diff")
    }
    worker.postMessage({ before, after, path: content.path })
    return () => worker.terminate()
  }, [after, before, content.path])

  if (before === null || after === null) {
    return (
      <VersionTextDiffUnavailable
        before={content.before}
        after={content.after}
      />
    )
  }

  return (
    <div className="version-text-diff" data-version-text-diff>
      <header>
        <div>
          <strong>Text changes</strong>
          <span>
            {byteCount(
              content.before.state === "utf8" ? content.before.size : 0
            )}
            B<span aria-hidden="true"> → </span>
            {byteCount(content.after.state === "utf8" ? content.after.size : 0)}
            B
          </span>
        </div>
        <div className="version-text-diff-layout" aria-label="Diff layout">
          <button
            type="button"
            aria-pressed={layout === "split"}
            onClick={() => setLayout("split")}
          >
            Split
          </button>
          <button
            type="button"
            aria-pressed={layout === "unified"}
            onClick={() => setLayout("unified")}
          >
            Unified
          </button>
        </div>
      </header>
      <div className="version-text-diff-surface">
        {failure ? (
          <div className="version-text-diff-message" role="alert">
            <CircleAlert aria-hidden="true" />
            <div>
              <strong>Could not render text changes</strong>
              <p>{failure}</p>
            </div>
          </div>
        ) : diff ? (
          <Suspense
            fallback={
              <div className="version-text-diff-loading" role="status">
                <LoaderCircle className="spin" aria-hidden="true" />
                Loading text renderer…
              </div>
            }
          >
            <PierreTextDiffSurface diff={diff} layout={layout} />
          </Suspense>
        ) : (
          <div className="version-text-diff-loading" role="status">
            <LoaderCircle className="spin" aria-hidden="true" />
            Computing text changes…
          </div>
        )}
      </div>
    </div>
  )
}

export function VersionTextDiff({
  mode,
  commitId,
  parentId,
  expectedHead,
  path,
}: {
  path: string
} & (
  | {
      mode: "history"
      commitId: string
      parentId: string | null
      expectedHead?: never
    }
  | {
      mode: "changes"
      expectedHead: string | null
      commitId?: never
      parentId?: never
    }
)) {
  const [content, setContent] = useState<SpaceVersionTextContentDiff | null>(
    null
  )
  const [failure, setFailure] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    setContent(null)
    setFailure(null)
    const request =
      mode === "history"
        ? window.eidosLite.getVersionTextDiff(commitId, parentId, path)
        : window.eidosLite.getWorkingTextDiff(expectedHead, path)
    void request
      .then((result) => {
        if (current) setContent(result)
      })
      .catch((error) => {
        if (current) setFailure(errorMessage(error))
      })
    return () => {
      current = false
    }
  }, [attempt, commitId, expectedHead, mode, parentId, path])

  if (failure) {
    return (
      <div className="version-text-diff-message" role="alert">
        <CircleAlert aria-hidden="true" />
        <div>
          <strong>
            {mode === "history"
              ? "Could not read checkpoint text"
              : "Could not read local text"}
          </strong>
          <p>{failure}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            <RotateCcw aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!content) {
    return (
      <div className="version-text-diff-loading" role="status">
        <LoaderCircle className="spin" aria-hidden="true" />
        {mode === "history"
          ? "Reading checkpoint text…"
          : "Reading local text…"}
      </div>
    )
  }

  return <ComputedTextDiff content={content} />
}
