import type {
  EidosSyncFailure,
  EidosSyncFailureCode,
  EidosSyncPhase,
} from "../../shared/contracts"

type FailureDefinition = Omit<
  EidosSyncFailure,
  "code" | "status" | "retryAfterMs"
> & {
  retryAfterMs?: number
}

const FAILURE_DEFINITIONS: Record<EidosSyncFailureCode, FailureDefinition> = {
  offline: {
    state: "offline",
    title: "Eidos Sync is offline",
    message:
      "The service could not be reached. Your local files and checkpoints remain safe.",
    action: "retry-now",
    actionLabel: "Retry now",
    retryable: true,
    retryAfterMs: 1_000,
    localSafe: true,
  },
  "authentication-required": {
    state: "paused-sign-in",
    title: "Sign in again to resume Sync",
    message:
      "The account session is no longer authorized. Local editing remains available.",
    action: "sign-in",
    actionLabel: "Sign in again",
    retryable: false,
    localSafe: true,
  },
  "device-revoked": {
    state: "paused-sign-in",
    title: "This device no longer has Sync access",
    message:
      "The device was revoked or its binding changed. Sign in again to register it.",
    action: "sign-in",
    actionLabel: "Register and sign in",
    retryable: false,
    localSafe: true,
  },
  "entitlement-inactive": {
    state: "paused-subscription",
    title: "Eidos Sync is paused",
    message:
      "This account does not currently have Sync access. Local changes will remain on this device.",
    action: "manage-account",
    actionLabel: "Manage account",
    retryable: false,
    localSafe: true,
  },
  "quota-exceeded": {
    state: "paused-storage-full",
    title: "Cloud storage is full",
    message:
      "Your changes were not uploaded. Free some storage or increase your limit, then try again. Local work remains safe.",
    action: "manage-account",
    actionLabel: "Manage storage",
    retryable: false,
    localSafe: true,
  },
  "upload-too-large": {
    state: "needs-attention",
    title: "This upload is too large",
    message:
      "Eidos Sync could not accept this upload yet. Keep working locally; your files and checkpoints remain safe.",
    action: "work-locally",
    actionLabel: "Keep working locally",
    retryable: false,
    localSafe: true,
  },
  "protocol-version-mismatch": {
    state: "needs-attention",
    title: "Eidos Lite needs an update",
    message:
      "This version cannot connect to Eidos Sync. Update Eidos Lite and try again; no local files were replaced.",
    action: "update",
    actionLabel: "Get the latest Eidos Lite",
    retryable: false,
    localSafe: true,
  },
  "remote-not-found": {
    state: "needs-attention",
    title: "Cloud Space is unavailable",
    message:
      "This Space is no longer available to the signed-in account. Open another synced Space or contact support.",
    action: "clone-hosted",
    actionLabel: "Open Hosted Spaces",
    retryable: false,
    localSafe: true,
  },
  "remote-conflict": {
    state: "needs-attention",
    title: "Cloud updates changed",
    message:
      "Another device uploaded a newer version. Try again to get it; no local files were overwritten.",
    action: "retry-now",
    actionLabel: "Fetch again",
    retryable: true,
    retryAfterMs: 0,
    localSafe: true,
  },
  "remote-persistence-failed": {
    state: "service-unavailable",
    title: "Upload did not complete",
    message:
      "The cloud service did not confirm your changes. Your local work remains safe and can be retried.",
    action: "retry-now",
    actionLabel: "Retry now",
    retryable: true,
    retryAfterMs: 2_000,
    localSafe: true,
  },
  "rate-limited": {
    state: "service-unavailable",
    title: "Eidos Sync is busy",
    message:
      "The service asked this device to slow down. Local files remain safe while you wait and retry.",
    action: "retry-now",
    actionLabel: "Retry now",
    retryable: true,
    retryAfterMs: 5_000,
    localSafe: true,
  },
  "repository-invalid": {
    state: "needs-attention",
    title: "This Space needs attention",
    message:
      "Eidos Lite could not safely read this Space’s sync history. Keep working locally, then open a fresh cloud copy.",
    action: "clone-hosted",
    actionLabel: "Open a fresh copy",
    retryable: false,
    localSafe: true,
  },
  "sync-process-crashed": {
    state: "service-unavailable",
    title: "Sync process stopped",
    message:
      "The isolated Sync process stopped unexpectedly. Local files were not discarded and the session can reopen.",
    action: "retry-now",
    actionLabel: "Reopen and retry",
    retryable: true,
    retryAfterMs: 0,
    localSafe: true,
  },
  "service-unavailable": {
    state: "service-unavailable",
    title: "Eidos Sync is temporarily unavailable",
    message:
      "The service did not complete the request. Continue working locally and retry later.",
    action: "retry-now",
    actionLabel: "Retry now",
    retryable: true,
    retryAfterMs: 2_000,
    localSafe: true,
  },
  "local-changes": {
    state: "needs-attention",
    title: "Create a checkpoint first",
    message:
      "The Space changed locally after the last checkpoint. Save a checkpoint before trying Sync again.",
    action: "review-local",
    actionLabel: "Review local changes",
    retryable: false,
    localSafe: true,
  },
  unknown: {
    state: "needs-attention",
    title: "Sync needs attention",
    message:
      "Eidos Sync stopped without changing your local files. Work locally and retry after reviewing Space status.",
    action: "work-locally",
    actionLabel: "Keep working locally",
    retryable: false,
    localSafe: true,
  },
}

const failureCodes = new Set<EidosSyncFailureCode>(
  Object.keys(FAILURE_DEFINITIONS) as EidosSyncFailureCode[]
)

function errorRecord(error: unknown): Record<string, unknown> {
  return typeof error === "object" && error !== null
    ? (error as Record<string, unknown>)
    : {}
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function failure(
  code: EidosSyncFailureCode,
  status?: number,
  retryAfterMs?: number
): EidosSyncFailure {
  return {
    code,
    ...FAILURE_DEFINITIONS[code],
    ...(status === undefined ? {} : { status }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  }
}

function statusFailure(status: number): EidosSyncFailureCode | null {
  if (status === 401) return "authentication-required"
  if (status === 403) return "device-revoked"
  if (status === 404) return "remote-not-found"
  if (status === 409) return "remote-conflict"
  if (status === 413) return "upload-too-large"
  if (status === 426) return "protocol-version-mismatch"
  if (status === 429) return "rate-limited"
  if (status === 500) return "remote-persistence-failed"
  if ([502, 503, 504].includes(status)) return "service-unavailable"
  return null
}

function statusFromMessage(message: string): number | undefined {
  const match = message.match(
    /\b(?:HTTP(?:\s+remote)?(?:\s+returned)?|status)\s*[:=]?\s*(\d{3})\b/i
  )
  return match ? Number(match[1]) : undefined
}

export function classifySyncFailure(
  error: unknown,
  phase?: EidosSyncPhase
): EidosSyncFailure {
  const record = errorRecord(error)
  const code = typeof record.code === "string" ? record.code : ""
  const name = error instanceof Error ? error.name : ""
  const explicitStatus =
    typeof record.status === "number" && Number.isInteger(record.status)
      ? record.status
      : undefined
  const retryAfterMs =
    typeof record.retryAfterMs === "number" &&
    Number.isFinite(record.retryAfterMs) &&
    record.retryAfterMs >= 0
      ? record.retryAfterMs
      : undefined
  const message = errorMessage(error)
  const status = explicitStatus ?? statusFromMessage(message)
  const normalized = `${code} ${message}`.toLowerCase()

  if (failureCodes.has(code as EidosSyncFailureCode)) {
    return failure(code as EidosSyncFailureCode, status, retryAfterMs)
  }
  if (code === "EIDOS_LITE_GRAFT_WORKER_CRASHED") {
    return failure("sync-process-crashed", status)
  }
  if (code === "GRAFT_SDK_REMOTE_TRANSPORT_TIMEOUT") {
    return failure("offline", status)
  }
  if (
    code === "GRAFT_SDK_REMOTE_PUBLICATION_UNCONFIRMED" ||
    code === "GRAFT_SDK_REMOTE_PUBLICATION_OUTCOME_UNKNOWN"
  ) {
    return failure("remote-persistence-failed", status)
  }
  if (code === "device-conflict" || code === "access-denied") {
    return failure("device-revoked", status)
  }
  if (code === "authentication-required") {
    return failure("authentication-required", status)
  }
  if (
    name === "EidosOAuthError" &&
    (status === 400 || status === 401 || status === 403)
  ) {
    return failure("authentication-required", status)
  }
  if (code === "quota-exceeded") return failure("quota-exceeded", status)
  if (code === "protocol-version-mismatch") {
    return failure("protocol-version-mismatch", status)
  }
  if (code === "remote-conflict") return failure("remote-conflict", status)
  if (code === "service-unavailable" || code === "unavailable") {
    return failure("service-unavailable", status)
  }
  if (
    code === "request-timeout" ||
    code === "timeout" ||
    normalized.includes("timed out")
  ) {
    return failure("offline", status)
  }

  const byStatus = status === undefined ? null : statusFailure(status)
  if (byStatus) return failure(byStatus, status, retryAfterMs)

  if (
    normalized.includes("create a checkpoint") ||
    normalized.includes("space changed before") ||
    normalized.includes("space changed after fetch")
  ) {
    return failure("local-changes", status)
  }
  if (
    normalized.includes("diverged") ||
    normalized.includes("hosted history changed") ||
    normalized.includes("ref conflict")
  ) {
    return failure("remote-conflict", status)
  }
  if (normalized.includes("quota") || normalized.includes("storage full")) {
    return failure("quota-exceeded", status)
  }
  if (
    normalized.includes("payload too large") ||
    normalized.includes("content too large") ||
    normalized.includes("request entity too large")
  ) {
    return failure("upload-too-large", status)
  }
  if (
    normalized.includes("protocol") ||
    normalized.includes("newer eidos") ||
    normalized.includes("graft version") ||
    normalized.includes("materialization contract")
  ) {
    return failure("protocol-version-mismatch", status)
  }
  if (
    normalized.includes("remote not found") ||
    normalized.includes("hosted remote is not available")
  ) {
    return failure("remote-not-found", status)
  }
  if (
    phase === "fetch" &&
    code === "GRAFT_SDK_REPOSITORY_COMMAND" &&
    normalized.includes("remote `origin` has no branch `main`")
  ) {
    return failure("remote-not-found", status)
  }
  if (
    normalized.includes("repository") &&
    (normalized.includes("invalid") ||
      normalized.includes("corrupt") ||
      normalized.includes("does not match"))
  ) {
    return failure("repository-invalid", status)
  }
  if (
    normalized.includes("sign in to eidos sync") ||
    normalized.includes("session expired")
  ) {
    return failure("authentication-required", status)
  }
  if (
    normalized.includes("could not be reached") ||
    normalized.includes("network") ||
    normalized.includes("offline") ||
    normalized.includes("connection refused") ||
    normalized.includes("connection reset") ||
    normalized.includes("dns")
  ) {
    return failure("offline", status)
  }
  if (normalized.includes("temporarily unavailable")) {
    return failure("service-unavailable", status)
  }
  if (
    code === "GRAFT_SDK_REPOSITORY_BUSY" ||
    code === "EIDOS_LITE_GRAFT_WORKER_CLOSED"
  ) {
    return failure("service-unavailable", status)
  }
  if (
    code === "GRAFT_SDK_REPOSITORY_COMMAND" &&
    ["fetch", "pull", "push"].includes(phase ?? "")
  ) {
    return failure("remote-persistence-failed", status)
  }
  return failure("unknown", status)
}

export interface PackagedSyncFault {
  code: EidosSyncFailureCode
  phase: EidosSyncPhase
  status?: number
  retryAfterMs?: number
}

export const PACKAGED_SYNC_FAILURE_SEQUENCE: readonly PackagedSyncFault[] = [
  { code: "offline", phase: "fetch" },
  { code: "authentication-required", phase: "authorization" },
  { code: "device-revoked", phase: "authorization" },
  { code: "entitlement-inactive", phase: "authorization" },
  { code: "remote-not-found", phase: "fetch", status: 404 },
  { code: "remote-conflict", phase: "push", status: 409 },
  { code: "quota-exceeded", phase: "push", status: 413 },
  { code: "protocol-version-mismatch", phase: "fetch", status: 426 },
  {
    code: "rate-limited",
    phase: "push",
    status: 429,
    retryAfterMs: 250,
  },
  { code: "remote-persistence-failed", phase: "push", status: 500 },
  { code: "service-unavailable", phase: "fetch", status: 502 },
  { code: "service-unavailable", phase: "fetch", status: 503 },
  { code: "service-unavailable", phase: "fetch", status: 504 },
  { code: "sync-process-crashed", phase: "fetch" },
] as const

export function createPackagedSyncFault({
  code,
  status,
  retryAfterMs,
}: PackagedSyncFault): Error {
  return Object.assign(new Error(`Packaged Sync fault: ${code}`), {
    code,
    ...(status === undefined ? {} : { status }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  })
}
