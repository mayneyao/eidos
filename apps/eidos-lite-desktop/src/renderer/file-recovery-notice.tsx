import { FolderOpen, History, RotateCw, ShieldAlert, X } from "lucide-react"

import type { EidosFileIssue } from "../shared/contracts"

interface FileRecoveryNoticeProps {
  issue: EidosFileIssue
  canRetry: boolean
  canReviewHistory: boolean
  onRetry(): void
  onReveal(): void
  onReviewHistory(): void
  onDismiss(): void
}

export function FileRecoveryNotice({
  issue,
  canRetry,
  canReviewHistory,
  onRetry,
  onReveal,
  onReviewHistory,
  onDismiss,
}: FileRecoveryNoticeProps) {
  return (
    <section
      className="file-recovery-notice"
      data-file-issue={issue.reason}
      data-file-local-safe="true"
      role="alert"
    >
      <ShieldAlert />
      <div>
        <header>
          <div>
            <strong>{issue.title}</strong>
            <code>{issue.relativePath}</code>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onDismiss}
            aria-label="Dismiss file recovery"
          >
            <X />
          </button>
        </header>
        <p>{issue.message}</p>
        <small>Original local file preserved · No automatic repair</small>
        <div className="file-recovery-actions">
          {issue.retryable && canRetry ? (
            <button type="button" onClick={onRetry} data-file-retry>
              <RotateCw /> Retry open
            </button>
          ) : null}
          {issue.canReveal ? (
            <button type="button" onClick={onReveal} data-file-reveal>
              <FolderOpen /> Reveal file
            </button>
          ) : null}
          {issue.canReviewHistory && canReviewHistory ? (
            <button type="button" onClick={onReviewHistory} data-file-history>
              <History /> Review History
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
