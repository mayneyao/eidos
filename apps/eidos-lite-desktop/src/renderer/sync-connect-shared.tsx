import { AlertTriangle, ChevronRight, LoaderCircle } from "lucide-react"
import { useId, type ReactNode } from "react"
import { syncProgressPresentation } from "./sync-progress-presentation"
import type { EidosSyncPreflight, EidosSyncProgress } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"

export function IndeterminateSyncProgress({ label }: { label: string }) {
  return (
    <div className="sync-progress-track" role="progressbar" aria-label={label}>
      <span className="sync-progress-indeterminate" />
    </div>
  )
}

export function SyncTransferStatus({
  progress,
}: {
  progress: EidosSyncProgress
}) {
  const { t } = useEidosLiteI18n()
  const model = syncProgressPresentation(progress)
  const transfer = progress.transfer
  const detail =
    progress.state !== "active"
      ? (model.detail ?? progress.detail)
      : progress.nativePhase
        ? {
            preparing: "Preparing this Space…",
            uploading: "Uploading",
            downloading: "Receiving",
            verifying: "Checking the cloud copy…",
            applying: "Applying files…",
          }[progress.nativePhase]
        : progress.detail
  return (
    <div
      className="sync-minimal-transfer"
      data-sync-native-phase={progress.nativePhase}
    >
      {model.percent !== null && transfer?.totalBytes ? (
        <progress
          aria-label={t("Transfer progress")}
          max={transfer.totalBytes}
          value={transfer.transferredBytes}
        />
      ) : progress.state === "active" ? (
        <IndeterminateSyncProgress label={t("Transfer progress")} />
      ) : null}
      <p>
        {t(detail)}
        {model.transferring &&
        transfer &&
        (transfer.transferredBytes > 0 || model.percent !== null) ? (
          <>
            {" · "}
            {progress.nativePhase
              ? model.percent !== null
                ? t("{size} of {total}", {
                    size: formatBytes(transfer.transferredBytes),
                    total: formatBytes(transfer.totalBytes!),
                  })
                : t(
                    transfer.direction === "upload"
                      ? "{size} sent"
                      : "{size} downloaded",
                    { size: formatBytes(transfer.transferredBytes) }
                  )
              : t(
                  transfer.direction === "upload"
                    ? "Uploaded {size}"
                    : "Downloaded {size}",
                  { size: formatBytes(transfer.transferredBytes) }
                )}
            {model.percent !== null
              ? `${progress.nativePhase ? "" : ` / ${formatBytes(transfer.totalBytes!)}`} · ${model.percent}%`
              : ""}
          </>
        ) : null}
      </p>
    </div>
  )
}

export function SyncConnectProgress({
  progress,
  serverName = "Eidos Sync",
}: {
  progress: EidosSyncProgress
  serverName?: string
}) {
  const { t } = useEidosLiteI18n()
  const legacyDetail =
    progress.transfer?.direction === "download" && progress.phase === "push"
      ? "Receiving data from server"
      : {
          authorization: "Checking cloud access…",
          analyze: "Preparing the first cloud copy…",
          drain: "Preparing local files…",
          push: "Uploading this Space for the first time…",
          validate: "Confirming the cloud copy…",
          fetch: "Checking cloud access…",
          pull: "Getting cloud updates…",
          reopen: "Finishing the connection…",
        }[progress.phase]
  return (
    <div
      className="custom-sync-progress"
      role="status"
      data-sync-progress={progress.state}
      data-sync-operation={progress.operation}
      data-sync-native-phase={progress.nativePhase}
    >
      <strong>
        {t(
          progress.state === "completed"
            ? "Space is connected"
            : progress.state === "failed"
              ? "Connection interrupted"
              : progress.nativePhase
                ? "Connecting…"
                : "Connecting this Space"
        )}
      </strong>
      <div className="sync-minimal-server">
        <span>{t("Server")}</span>
        <strong>{serverName}</strong>
      </div>
      <SyncTransferStatus
        progress={
          progress.nativePhase
            ? progress
            : { ...progress, detail: legacyDetail }
        }
      />
    </div>
  )
}

export function SyncServerSelect({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string
  onChange(value: string): void
  children: ReactNode
  disabled?: boolean
}) {
  const { t } = useEidosLiteI18n()
  const id = useId()
  return (
    <section className="sync-provider-options" aria-label={t("Sync service")}>
      <label htmlFor={id}>{t("Server")}</label>
      <select
        id={id}
        aria-label={t("Sync service")}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </section>
  )
}

export function SyncFileScope({
  preflight,
  onRefresh,
  refreshing,
  compact,
}: {
  preflight: EidosSyncPreflight | null
  onRefresh(): void
  refreshing: boolean
  compact: boolean
}) {
  const { t } = useEidosLiteI18n()
  return (
    <section
      className="sync-section sync-safety-review"
      data-sync-preflight
      data-sync-preflight-blocked={preflight?.blockerCount ? "true" : "false"}
    >
      <details className="sync-file-scope sync-scope-details">
        <summary className="sync-section-head">
          <h3>{t("Files to sync")}</h3>
          {preflight ? (
            <span className="sync-section-count">
              {t("{count} files · {size}", {
                count: preflight.fileCount.toLocaleString(),
                size: formatBytes(preflight.totalBytes),
              })}
            </span>
          ) : null}
          <ChevronRight className="sync-file-scope-caret" />
        </summary>
        {preflight?.excludedCount ? (
          <>
            <p>
              {t("Not included ({count})", { count: preflight.excludedCount })}
            </p>
            <ul>
              {preflight.excluded.map((entry) => (
                <li key={entry.relativePath}>
                  <span>{entry.relativePath}</span>
                  <small>{t(exclusionLabel(entry.reason))}</small>
                </li>
              ))}
            </ul>
            {preflight.excludedCount > preflight.excluded.length ? (
              <p>+{preflight.excludedCount - preflight.excluded.length} more</p>
            ) : null}
          </>
        ) : preflight ? (
          <p>{t("No files are excluded.")}</p>
        ) : null}
        {compact ? (
          <button
            type="button"
            className="sync-text-action"
            disabled={refreshing}
            onClick={onRefresh}
          >
            {t("Recheck files")}
          </button>
        ) : null}
      </details>
      {preflight && !compact ? (
        <p className="sync-caption">
          {t("Checked before the first upload. Nothing has been sent yet.")}
        </p>
      ) : null}
      {preflight ? (
        <>
          {preflight.blockerCount > 0 ? (
            <div className="sync-flag-list" role="alert">
              <header>
                <AlertTriangle />
                <strong>{t("Fix these files before connecting")}</strong>
              </header>
              <PreflightEntries
                entries={preflight.blockers}
                total={preflight.blockerCount}
              />
              {compact ? (
                <button
                  type="button"
                  className="sync-text-action"
                  disabled={refreshing}
                  onClick={onRefresh}
                >
                  {t("Recheck files")}
                </button>
              ) : null}
            </div>
          ) : null}

          {preflight.warningCount > 0 ? (
            <details className="sync-more sync-review-details">
              <summary>
                <ChevronRight />
                {t("Already in version history ({count})", {
                  count: preflight.warningCount,
                })}
              </summary>
              <p>
                {t(
                  "These files remain included because they are already in version history. Ignore rules apply to untracked files."
                )}
              </p>
              <PreflightEntries
                entries={preflight.warnings}
                total={preflight.warningCount}
              />
            </details>
          ) : null}
        </>
      ) : (
        <p className="sync-loading" role="status">
          <LoaderCircle className="spin" /> Checking files in this Space…
        </p>
      )}
    </section>
  )
}

function PreflightEntries({
  entries,
  total,
}: {
  entries: EidosSyncPreflight["warnings"]
  total: number
}) {
  const { t } = useEidosLiteI18n()
  return (
    <>
      <ul>
        {entries.slice(0, 12).map((entry) => (
          <li key={entry.relativePath}>
            <span title={entry.relativePath}>{entry.relativePath}</span>
            <small>
              {entry.concerns
                .map((concern) => t(concernLabel(concern)))
                .join(" · ")}
              {entry.size > 0 ? ` · ${formatBytes(entry.size)}` : ""}
            </small>
          </li>
        ))}
      </ul>
      {total > 12 ? (
        <p>{t("{count} more files", { count: total - 12 })}</p>
      ) : null}
    </>
  )
}

function concernLabel(
  concern: EidosSyncPreflight["warnings"][number]["concerns"][number]
) {
  return {
    "tracked-ignored":
      "already in version history; .graftignore does not exclude it from sync",
    "file-too-large": "too large to sync",
    symlink: "linked file",
    "unsupported-entry": "unsupported file type",
  }[concern]
}

function exclusionLabel(
  reason: EidosSyncPreflight["excluded"][number]["reason"]
) {
  return {
    "graft-metadata": "version history data",
    "graft-ignore": "ignored by Space settings",
    "os-noise": "system file",
    "temporary-file": "temporary file",
  }[reason]
}

export function formatBytes(value: number): string {
  if (value === 0) return "0 bytes"
  const units = ["bytes", "KiB", "MiB", "GiB", "TiB"]
  const unit = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024))
  )
  const scaled = value / 1024 ** unit
  return `${scaled.toLocaleString(undefined, {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  })} ${units[unit]}`
}
