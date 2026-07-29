import type {
  EidosFileIssue,
  EidosFileIssueReason,
} from "../../shared/contracts"

const definitions: Record<
  EidosFileIssueReason,
  Omit<EidosFileIssue, "relativePath" | "sessionId" | "reason">
> = {
  missing: {
    title: "Eidos File is missing",
    message:
      "The file no longer exists at this path. Eidos Lite closed its old handle and did not recreate anything; restore the file here, then retry.",
    retryable: true,
    canReveal: false,
    canReviewHistory: true,
    localSafe: true,
  },
  replaced: {
    title: "Eidos File was replaced",
    message:
      "Another process replaced this path. The previous handle was closed; review the new file before reopening it.",
    retryable: true,
    canReveal: true,
    canReviewHistory: true,
    localSafe: true,
  },
  "unsafe-link": {
    title: "Eidos File path is now a symlink",
    message:
      "Eidos Lite will not follow a new symlink from an open Space. The linked target was not opened or changed.",
    retryable: false,
    canReveal: true,
    canReviewHistory: true,
    localSafe: true,
  },
  unsupported: {
    title: "Eidos File path is not an ordinary file",
    message:
      "This path now points to a directory or special filesystem entry. Eidos Lite left it unchanged.",
    retryable: false,
    canReveal: true,
    canReviewHistory: true,
    localSafe: true,
  },
  unreadable: {
    title: "Eidos File cannot be read",
    message:
      "The operating system denied access. Restore file permissions, then retry; Eidos Lite did not modify the file.",
    retryable: true,
    canReveal: true,
    canReviewHistory: true,
    localSafe: true,
  },
  locked: {
    title: "Eidos File is busy",
    message:
      "Another process is holding a conflicting SQLite lock. Close that operation and retry; the local file remains unchanged.",
    retryable: true,
    canReveal: true,
    canReviewHistory: true,
    localSafe: true,
  },
  corrupt: {
    title: "Eidos File did not pass SQLite validation",
    message:
      "The file appears damaged or is not a SQLite database. Keep the original file, review History, or make a copy before attempting repair.",
    retryable: false,
    canReveal: true,
    canReviewHistory: true,
    localSafe: true,
  },
  "open-failed": {
    title: "Eidos File could not be opened",
    message:
      "The runtime could not open this file. The original remains unchanged; retry or inspect it in its folder.",
    retryable: true,
    canReveal: true,
    canReviewHistory: true,
    localSafe: true,
  },
}

export function createEidosFileIssue(
  relativePath: string,
  reason: EidosFileIssueReason,
  sessionId?: string
): EidosFileIssue {
  return {
    relativePath,
    reason,
    ...definitions[reason],
    ...(sessionId ? { sessionId } : {}),
  }
}

export function classifyEidosFileIssue(
  relativePath: string,
  error: unknown,
  sessionId?: string
): EidosFileIssue {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code).toUpperCase()
      : ""
  const message = (error instanceof Error ? error.message : String(error))
    .toLowerCase()
    .slice(0, 2_000)
  let reason: EidosFileIssueReason = "open-failed"
  if (code === "ENOENT") reason = "missing"
  else if (["EACCES", "EPERM", "SQLITE_PERM"].includes(code)) {
    reason = "unreadable"
  } else if (
    ["EBUSY", "SQLITE_BUSY", "SQLITE_LOCKED"].includes(code) ||
    message.includes("database is locked") ||
    message.includes("database is busy")
  ) {
    reason = "locked"
  } else if (
    code === "SQLITE_CORRUPT" ||
    code === "SQLITE_NOTADB" ||
    message.includes("database disk image is malformed") ||
    message.includes("file is not a database") ||
    message.includes("database corruption")
  ) {
    reason = "corrupt"
  }
  return createEidosFileIssue(relativePath, reason, sessionId)
}

export class EidosFileRuntimeError extends Error {
  constructor(readonly issue: EidosFileIssue) {
    super(issue.message)
    this.name = "EidosFileRuntimeError"
  }
}
