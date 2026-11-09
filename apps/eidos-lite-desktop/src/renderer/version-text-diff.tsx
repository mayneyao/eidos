import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { FileDiffMetadata } from "@pierre/diffs"
import type * as PierreModule from "./pierre-text-diff-surface"
import {
  ArrowRight,
  CircleAlert,
  FileSymlink,
  LoaderCircle,
  RotateCcw,
} from "lucide-react"

import type {
  SpaceVersionTextContentDiff,
  SpaceVersionTextContentState,
} from "../shared/contracts"
import type { ResolvedAppearance } from "./app-appearance"
import type { VersionTextDiffComputationResponse } from "./version-text-diff-computation"
import { VersionTextRecovery } from "./version-text-recovery"

interface PreparedTextDiff {
  content: SpaceVersionTextContentDiff
  diff: FileDiffMetadata | null
  Surface?: typeof PierreModule.default
}

let textDiffSnapshot = 0

// Reading and inline-only callers share the existing worker preparation. The
// caller retains its displayed snapshot until both computation and renderer
// preparation finish; cancellation also covers a late module/language load.
function prepareTextDiff(
  content: SpaceVersionTextContentDiff,
  ready: (result: PreparedTextDiff) => void,
  fail: (message: string) => void,
  renameOnly = false
): () => void {
  const before = contentValue(content.before),
    after = contentValue(content.after)
  if (before === null || after === null || renameOnly) {
    ready({ content, diff: null })
    return () => undefined
  }
  let active = true
  const worker = new Worker(
    new URL("./version-text-diff-worker.ts", import.meta.url),
    { type: "module" }
  )
  worker.onmessage = (
    event: MessageEvent<VersionTextDiffComputationResponse>
  ) => {
    worker.terminate()
    if (!active) return
    if (!event.data.diff) {
      fail(event.data.error ?? "Unable to compute this text diff")
      return
    }
    const diff = event.data.diff
    // Pierre defaults to the path as its identity. A mounted surface must also
    // distinguish two computations for changed contents of the same path.
    diff.cacheKey = `eidos-text-diff:${++textDiffSnapshot}`
    void import("./pierre-text-diff-surface")
      .then(async (renderer) => {
        await renderer.preparePierreTextDiff(diff)
        if (active) ready({ content, diff, Surface: renderer.default })
      })
      .catch((cause: unknown) => {
        if (active) fail(errorMessage(cause))
      })
  }
  worker.onerror = () => {
    worker.terminate()
    if (active) fail("Unable to compute this text diff")
  }
  worker.postMessage({ before, after, path: content.path })
  return () => {
    active = false
    worker.terminate()
  }
}

function OpeningStatus({ path }: { path?: string }) {
  const [visible, setVisible] = useState<string>()
  useEffect(() => {
    setVisible(undefined)
    if (!path) return
    const timer = window.setTimeout(() => setVisible(path), 200)
    return () => window.clearTimeout(timer)
  }, [path])
  return (
    <span
      className="version-diff-opening-slot"
      role="status"
      aria-live="polite"
    >
      {path && visible === path ? (
        <>
          <LoaderCircle className="spin" aria-hidden="true" />
          <span title={path}>Opening {path}…</span>
        </>
      ) : null}
    </span>
  )
}

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

function textContentMatches(content: SpaceVersionTextContentDiff): boolean {
  const before = contentValue(content.before)
  const after = contentValue(content.after)
  return before !== null && after !== null && before === after
}

export function VersionDiffWrapControl({
  checked,
  onCheckedChange,
}: {
  checked: boolean
  onCheckedChange(checked: boolean): void
}) {
  return (
    <div className="version-diff-wrap-control">
      <span>Wrap</span>
      <button
        type="button"
        role="switch"
        className="version-diff-wrap-switch"
        aria-label="Wrap lines"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
      >
        <span />
      </button>
    </div>
  )
}

export function VersionRenameSummary({
  previousPath,
  path,
  compact = false,
}: {
  previousPath: string
  path: string
  compact?: boolean
}) {
  return (
    <div
      className="version-rename-summary"
      data-compact={compact ? "true" : undefined}
      aria-label={`Renamed from ${previousPath} to ${path}`}
    >
      <FileSymlink aria-hidden="true" />
      <div className="version-rename-paths">
        <span title={previousPath}>{previousPath}</span>
        <ArrowRight aria-hidden="true" />
        <strong title={path}>{path}</strong>
      </div>
    </div>
  )
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

export function InlineTextDiff({
  content,
  theme,
  title = "Text changes",
  defaultLayout,
  defaultSoftWrap,
  fixedLayout,
  fixedSoftWrap,
  toolbarEnd,
  toolbarStart,
  prepared,
  pendingPath,
  error,
  onRetry,
}: {
  content?: SpaceVersionTextContentDiff
  theme: ResolvedAppearance
  title?: string
  defaultLayout?: "split" | "unified"
  defaultSoftWrap?: boolean
  fixedLayout?: "split" | "unified"
  fixedSoftWrap?: boolean
  toolbarEnd?: ReactNode
  toolbarStart?: ReactNode
  prepared?: PreparedTextDiff
  pendingPath?: string
  error?: string
  onRetry?(): void
}) {
  const [layout, setLayout] = useState<"split" | "unified">(
    fixedLayout ?? defaultLayout ?? "split"
  )
  const [softWrap, setSoftWrap] = useState(defaultSoftWrap ?? false)
  const resolvedLayout = fixedLayout ?? layout
  const resolvedSoftWrap = fixedSoftWrap ?? softWrap
  const [displayed, setDisplayed] = useState<PreparedTextDiff>()
  const [failure, setFailure] = useState<string | null>(null)
  const before = content ? contentValue(content.before) : null
  const after = content ? contentValue(content.after) : null

  useEffect(() => {
    if (!content || prepared) return
    setFailure(null)
    return prepareTextDiff(content, setDisplayed, setFailure)
  }, [
    after,
    before,
    content?.path,
    content?.before.state,
    content?.after.state,
    prepared,
  ])
  const shown = prepared ?? displayed
  const shownContent = shown?.content
  const Surface = shown?.Surface
  const preparing =
    !prepared &&
    Boolean(content) &&
    (!shownContent ||
      shownContent.path !== content?.path ||
      contentValue(shownContent.before) !== before ||
      contentValue(shownContent.after) !== after) &&
    !failure
  const opening = pendingPath ?? (preparing ? content?.path : undefined)
  const message = error ?? failure

  return (
    <div
      className="version-text-diff"
      data-version-text-diff
      aria-busy={Boolean(opening)}
    >
      <header className="version-inspector-diff-bar version-text-diff-toolbar">
        {toolbarStart ?? (
          <div>
            <strong>{title}</strong>
            <span>
              {byteCount(
                shownContent?.before.state === "utf8"
                  ? shownContent.before.size
                  : 0
              )}
              B<span aria-hidden="true"> → </span>
              {byteCount(
                shownContent?.after.state === "utf8"
                  ? shownContent.after.size
                  : 0
              )}
              B
            </span>
          </div>
        )}
        <OpeningStatus path={opening} />
        {toolbarEnd ??
          (!fixedLayout ||
          (defaultSoftWrap !== undefined && fixedSoftWrap === undefined) ? (
            <div className="version-text-diff-display-controls">
              {defaultSoftWrap !== undefined && fixedSoftWrap === undefined ? (
                <VersionDiffWrapControl
                  checked={resolvedSoftWrap}
                  onCheckedChange={setSoftWrap}
                />
              ) : null}
              {!fixedLayout ? (
                <div
                  className="version-text-diff-layout"
                  aria-label="Diff layout"
                >
                  <button
                    type="button"
                    aria-pressed={resolvedLayout === "split"}
                    onClick={() => setLayout("split")}
                  >
                    Split
                  </button>
                  <button
                    type="button"
                    aria-pressed={resolvedLayout === "unified"}
                    onClick={() => setLayout("unified")}
                  >
                    Unified
                  </button>
                </div>
              ) : null}
            </div>
          ) : null)}
      </header>
      <div className="version-text-diff-surface">
        {message ? (
          <div className="version-text-diff-message" role="alert">
            <CircleAlert aria-hidden="true" />
            <div>
              <strong>Could not render text changes</strong>
              <p>{message}</p>
              {onRetry ? (
                <button type="button" onClick={onRetry}>
                  <RotateCcw aria-hidden="true" />
                  Retry
                </button>
              ) : null}
            </div>
          </div>
        ) : shownContent && !shown?.diff ? (
          <VersionTextDiffUnavailable
            before={shownContent.before}
            after={shownContent.after}
          />
        ) : shown?.diff && Surface ? (
          <Surface
            diff={shown.diff}
            layout={resolvedLayout}
            softWrap={resolvedSoftWrap}
            theme={theme}
          />
        ) : (
          <div className="version-text-diff-empty" aria-label="Text preview" />
        )}
      </div>
    </div>
  )
}

export function VersionTextDiffContent({
  content,
  previousPath,
  theme,
  actions,
  prepared,
  pendingPath,
  error,
  onRetry,
}: {
  content?: SpaceVersionTextContentDiff
  previousPath?: string
  theme: ResolvedAppearance
  actions?: ReactNode
  prepared?: PreparedTextDiff
  pendingPath?: string
  error?: string
  onRetry?(): void
}) {
  if (content && previousPath && textContentMatches(content)) {
    return (
      <div>
        <header className="version-inspector-diff-bar version-text-diff-toolbar">
          {actions}
          <OpeningStatus path={pendingPath} />
        </header>
        <VersionRenameSummary previousPath={previousPath} path={content.path} />
      </div>
    )
  }
  if (!previousPath || !content || error) {
    return (
      <InlineTextDiff
        content={content}
        theme={theme}
        defaultSoftWrap={false}
        toolbarStart={actions}
        prepared={prepared}
        pendingPath={pendingPath}
        error={error}
        onRetry={onRetry}
      />
    )
  }
  return (
    <div className="version-text-change-stack">
      <VersionRenameSummary
        previousPath={previousPath}
        path={content?.path ?? ""}
        compact
      />
      <InlineTextDiff
        content={content}
        theme={theme}
        defaultSoftWrap={false}
        toolbarStart={actions}
        prepared={prepared}
        pendingPath={pendingPath}
        error={error}
        onRetry={onRetry}
      />
    </div>
  )
}

export function VersionTextDiff({
  mode,
  commitId,
  parentId,
  expectedHead,
  path,
  previousPath,
  theme,
  onRestoreVersion,
  onDisplay,
}: {
  path: string
  previousPath?: string
  theme: ResolvedAppearance
  onRestoreVersion?(revision: string): Promise<string[]>
  onDisplay?(): void
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
  const [attempt, setAttempt] = useState(0)
  const requestKey = JSON.stringify([
    mode,
    commitId,
    parentId,
    expectedHead,
    path,
    previousPath,
    attempt,
  ])
  const [displayed, setDisplayed] = useState<{
    key: string
    prepared?: PreparedTextDiff
    failure?: string
    mode: "history" | "changes"
    commitId?: string
    parentId?: string | null
    previousPath?: string
  }>()

  useEffect(() => {
    let current = true
    let cancelPreparation = () => undefined as void
    const identity = { key: requestKey, mode, commitId, parentId, previousPath }
    const fail = (message: string) => {
      if (current) setDisplayed({ ...identity, failure: message })
    }
    const request =
      mode === "history"
        ? window.eidosLite.getVersionTextDiff(
            commitId,
            parentId,
            path,
            previousPath
          )
        : window.eidosLite.getWorkingTextDiff(expectedHead, path, previousPath)
    void request
      .then((result) => {
        if (!current) return
        cancelPreparation = prepareTextDiff(
          result,
          (prepared) => {
            if (current) setDisplayed({ ...identity, prepared })
          },
          fail,
          Boolean(previousPath && textContentMatches(result))
        )
      })
      .catch((error) => {
        fail(errorMessage(error))
      })
    return () => {
      current = false
      cancelPreparation()
    }
  }, [
    requestKey,
    attempt,
    commitId,
    expectedHead,
    mode,
    parentId,
    path,
    previousPath,
  ])
  const displayRef = useRef(onDisplay)
  displayRef.current = onDisplay
  useLayoutEffect(() => {
    if (displayed?.key === requestKey) displayRef.current?.()
  }, [displayed, requestKey])
  const opening = displayed?.key !== requestKey ? path : undefined
  const content = displayed?.prepared?.content
  const actions =
    content && displayed ? (
      <VersionTextRecovery
        key={displayed.key}
        content={content}
        disabled={Boolean(opening)}
        onRestore={
          onRestoreVersion &&
          displayed.mode === "history" &&
          (content.after.state === "utf8" ||
            (content.after.state === "absent" && displayed.parentId))
            ? () =>
                onRestoreVersion(
                  content.after.state === "utf8"
                    ? displayed.commitId!
                    : displayed.parentId!
                )
            : undefined
        }
      />
    ) : undefined
  return (
    <VersionTextDiffContent
      content={content}
      previousPath={displayed?.previousPath}
      theme={theme}
      actions={actions}
      prepared={displayed?.prepared}
      pendingPath={opening}
      error={displayed?.failure}
      onRetry={() => setAttempt((value) => value + 1)}
    />
  )
}
