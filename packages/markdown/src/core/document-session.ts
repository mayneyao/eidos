import { preserveMarkdownSourceEdits } from "../markdown/source-fidelity"

export interface SourceRangeCommit {
  end: number
  expectedSource: string
  source: string
  start: number
}

export interface DocumentSessionSnapshot {
  readonly activeDrafts: number
  readonly externalMarkdownConflict: boolean
}

/** One editor document's source authority. No React, Lexical, or dialect state. */
export class DocumentSession {
  private accepted: string
  private canonical: string | null = null
  private observed: string
  private pendingExternal: string | null = null
  private suppressedExternal: string | null = null
  private sourceRangeCommit: SourceRangeCommit | null = null
  private snapshot: DocumentSessionSnapshot = {
    activeDrafts: 0,
    externalMarkdownConflict: false,
  }
  private listeners = new Set<() => void>()

  constructor(markdown: string) {
    this.accepted = markdown
    this.observed = markdown
  }

  getSnapshot = (): DocumentSessionSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private updateSnapshot(patch: Partial<DocumentSessionSnapshot>): void {
    const next = { ...this.snapshot, ...patch }
    if (
      next.activeDrafts === this.snapshot.activeDrafts &&
      next.externalMarkdownConflict === this.snapshot.externalMarkdownConflict
    )
      return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  getAcceptedMarkdown = (): string => this.accepted
  setCanonical(markdown: string): void {
    this.canonical = markdown
  }

  registerDraft = (): (() => void) => {
    let registered = true
    this.updateSnapshot({ activeDrafts: this.snapshot.activeDrafts + 1 })
    return () => {
      if (!registered) return
      registered = false
      this.updateSnapshot({ activeDrafts: this.snapshot.activeDrafts - 1 })
    }
  }

  /** Returns a source to import, or a newly raised conflict to report once. */
  observeExternal(markdown: string): {
    importMarkdown?: string
    newConflict?: boolean
  } {
    const propChanged = markdown !== this.observed
    this.observed = markdown
    if (markdown === this.accepted) {
      this.pendingExternal = null
      this.suppressedExternal = null
      this.updateSnapshot({ externalMarkdownConflict: false })
      return {}
    }
    if (this.snapshot.activeDrafts > 0) {
      if (markdown === this.suppressedExternal) return {}
      this.pendingExternal = markdown
      const newConflict = !this.snapshot.externalMarkdownConflict
      this.updateSnapshot({ externalMarkdownConflict: true })
      return { newConflict }
    }
    if (!propChanged && this.pendingExternal === null) return {}
    const next = this.pendingExternal ?? markdown
    this.pendingExternal = null
    this.accepted = next
    this.updateSnapshot({ externalMarkdownConflict: false })
    return { importMarkdown: next }
  }

  clearSourceRangeCommit = (): void => {
    this.sourceRangeCommit = null
  }
  queueSourceRangeCommit = (commit: SourceRangeCommit): void => {
    this.sourceRangeCommit = { ...commit }
  }

  previewCanonical(nextCanonical: string): string {
    return this.canonical !== null
      ? preserveMarkdownSourceEdits(
          this.accepted,
          this.canonical,
          nextCanonical
        )
      : nextCanonical
  }

  commitCanonical(
    nextCanonical: string,
    useSourceRange = false
  ): { markdown: string | null; error?: Error } {
    const commit = useSourceRange ? this.sourceRangeCommit : null
    if (useSourceRange) this.clearSourceRangeCommit()
    let error: Error | undefined
    let next: string
    if (
      commit &&
      Number.isInteger(commit.start) &&
      Number.isInteger(commit.end) &&
      commit.start >= 0 &&
      commit.end >= commit.start &&
      commit.end <= this.accepted.length &&
      this.accepted.slice(commit.start, commit.end) === commit.expectedSource
    ) {
      next =
        this.accepted.slice(0, commit.start) +
        commit.source +
        this.accepted.slice(commit.end)
    } else {
      if (commit)
        error = new Error(
          "The selected Markdown source changed before the edit could be committed."
        )
      next = this.previewCanonical(nextCanonical)
    }
    this.canonical = nextCanonical
    if (next === this.accepted) return { markdown: null, error }
    this.pendingExternal = null
    if (this.snapshot.externalMarkdownConflict)
      this.suppressedExternal = this.observed
    this.accepted = next
    this.updateSnapshot({ externalMarkdownConflict: false })
    return { markdown: next, error }
  }
}
