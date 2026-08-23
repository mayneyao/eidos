import { useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  ExternalLink,
  Inbox,
  LoaderCircle,
  RotateCcw,
  Upload,
  X,
} from "lucide-react"

import type {
  EidosPublishProgress,
  EidosPublishResponse,
  EidosPublishResult,
  SpaceTreeEntry,
} from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

export type PublishTaskFailure = Extract<
  EidosPublishResponse,
  { ok: false }
>["failure"]

export interface PublishTaskState {
  requestId: string
  entry: SpaceTreeEntry
  anchorX: number
  anchorY: number
  slug: string
  status: "running" | "succeeded" | "failed"
  progress: EidosPublishProgress
  result?: EidosPublishResult
  failure?: PublishTaskFailure
  collection?: {
    status: "running" | "succeeded" | "failed"
    imported?: number
    message?: string
  }
}

export function updatePublishTaskProgress(
  task: PublishTaskState | null,
  progress: EidosPublishProgress
): PublishTaskState | null {
  if (!task || task.requestId !== progress.requestId) return task
  return { ...task, progress }
}

function humanBytes(value: string): string {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return value
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${bytes} B`
}

interface PublishTaskDockProps {
  task: PublishTaskState
  expanded: boolean
  onExpandedChange(expanded: boolean): void
  onDismiss(): void
  onRetry(): void
  onCollect(): void
}

export function PublishTaskDock({
  task,
  expanded,
  onExpandedChange,
  onDismiss,
  onRetry,
  onCollect,
}: PublishTaskDockProps) {
  const { t } = useEidosLiteI18n()
  const [copied, setCopied] = useState(false)
  const progressMessage =
    task.progress.kind === "bytes"
      ? `${t(task.progress.label)} · ${humanBytes(task.progress.currentBytes)} / ${humanBytes(task.progress.totalBytes)}`
      : t(task.progress.message)
  const compactMessage =
    task.status === "running"
      ? progressMessage
      : task.status === "succeeded"
        ? task.result?.versionCreated === false
          ? t("Already up to date")
          : t("Published successfully")
        : t("Publish failed")
  const percent =
    task.progress.kind === "bytes"
      ? Math.max(0, Math.min(100, task.progress.percent))
      : null
  const upgradeRequired =
    task.failure?.status === 403 ||
    task.failure?.code.includes("limit") ||
    task.failure?.code.includes("pro")
  const authenticationRequired =
    task.failure?.code === "authentication-required"

  if (!expanded) {
    return (
      <aside
        className={`publish-task-dock is-compact is-${task.status}`}
        aria-label={t("Publish activity")}
      >
        <button
          type="button"
          className="publish-task-summary"
          aria-label={t("Expand Publish")}
          onClick={() => onExpandedChange(true)}
        >
          <span className="publish-task-state-icon" aria-hidden="true">
            {task.status === "running" ? (
              <LoaderCircle className="spin" />
            ) : task.status === "succeeded" ? (
              <Check />
            ) : (
              <CircleAlert />
            )}
          </span>
          <span className="publish-task-summary-copy">
            <strong>{task.entry.name}</strong>
            <small>{compactMessage}</small>
          </span>
          <ChevronUp aria-hidden="true" />
        </button>
        {task.status !== "running" ? (
          <button
            type="button"
            className="publish-task-dismiss"
            aria-label={t("Dismiss Publish")}
            onClick={onDismiss}
          >
            <X />
          </button>
        ) : null}
        {task.status === "running" ? (
          <span className="publish-task-compact-progress" aria-hidden="true">
            <span
              className={percent === null ? "is-indeterminate" : undefined}
              style={percent === null ? undefined : { width: `${percent}%` }}
            />
          </span>
        ) : null}
      </aside>
    )
  }

  return (
    <aside
      className={`publish-task-dock is-expanded is-${task.status}`}
      aria-label={t("Publish activity")}
    >
      <header>
        <span className="publish-panel-heading">
          <Upload />
          <span>
            <strong>{t("Publish")}</strong>
            <small title={task.entry.relativePath}>{task.entry.name}</small>
          </span>
        </span>
        <span className="publish-task-header-actions">
          <button
            type="button"
            className="publish-icon-button"
            aria-label={t("Minimize Publish")}
            onClick={() => onExpandedChange(false)}
          >
            <ChevronDown />
          </button>
          {task.status !== "running" ? (
            <button
              type="button"
              className="publish-icon-button"
              aria-label={t("Dismiss Publish")}
              onClick={onDismiss}
            >
              <X />
            </button>
          ) : null}
        </span>
      </header>

      {task.status === "running" ? (
        <section className="publish-running" aria-live="polite">
          <div className="publish-running-target">
            <span>{t("Resource slug")}</span>
            <strong>/{task.slug}</strong>
          </div>
          <div className="publish-progress" role="status">
            <span>
              <LoaderCircle className="spin" /> {progressMessage}
            </span>
            <progress max={100} value={percent ?? undefined} />
          </div>
          <small className="publish-background-note">
            {t("Publish continues in the background while you work.")}
          </small>
        </section>
      ) : task.status === "succeeded" && task.result ? (
        <section className="publish-result" aria-live="polite">
          <span className="publish-success-icon">
            <Check />
          </span>
          <div>
            <strong>
              {task.result.versionCreated
                ? t("Published successfully")
                : t("Already up to date")}
            </strong>
            <span className="publish-result-url">{task.result.url}</span>
          </div>
          <div className="publish-result-actions">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  .writeText(task.result?.url ?? "")
                  .then(() => {
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1_500)
                  })
              }}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? t("Copied") : t("Copy link")}
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={() =>
                void window.eidosLite.openExternalUrl(task.result?.url ?? "")
              }
            >
              <ExternalLink /> {t("Open")}
            </button>
          </div>
          {task.result.driverId === "org.eidos.driver.form" ? (
            <div className="publish-collect-actions">
              <span>
                {task.collection?.status === "succeeded"
                  ? t("{count} responses collected", {
                      count: task.collection.imported ?? 0,
                    })
                  : task.collection?.status === "failed"
                    ? task.collection.message
                    : t("Collect new responses into the local Eidos File.")}
              </span>
              <button
                type="button"
                disabled={task.collection?.status === "running"}
                onClick={onCollect}
              >
                {task.collection?.status === "running" ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <Inbox />
                )}
                {task.collection?.status === "running"
                  ? t("Collecting…")
                  : t("Collect now")}
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="publish-task-error" aria-live="assertive">
          <div className="publish-failure" role="alert">
            <strong>
              {upgradeRequired
                ? t("Publish Pro is required")
                : authenticationRequired
                  ? t("Sign in to publish")
                  : t("Publish failed")}
            </strong>
            <span>{task.failure?.message ?? t("Publish failed")}</span>
            {upgradeRequired || authenticationRequired ? (
              <button
                type="button"
                onClick={() => {
                  if (authenticationRequired) {
                    void window.eidosLite.beginSyncSignIn()
                  } else {
                    void window.eidosLite.openExternalUrl(
                      "https://eidos.space/pricing#publish"
                    )
                  }
                }}
              >
                {authenticationRequired ? t("Sign in") : t("View plans")}
              </button>
            ) : null}
          </div>
          <footer>
            <button type="button" onClick={onDismiss}>
              {t("Dismiss")}
            </button>
            <button type="button" className="primary-action" onClick={onRetry}>
              <RotateCcw /> {t("Try again")}
            </button>
          </footer>
        </section>
      )}
    </aside>
  )
}
