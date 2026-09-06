import type {
  TextFileSaveRequest,
  TextFileSaveResult,
} from "../shared/contracts"

export interface TextDraft {
  content: string
  revision: string
}

/** Renderer-owned drafts, including documents no longer mounted in the editor. */
export class TextDraftLifecycle {
  private readonly drafts = new Map<string, TextDraft>()
  private readonly pending = new Set<Promise<void>>()
  private locked = false
  private readonly conflictListeners = new Set<
    (
      path: string,
      result: Extract<TextFileSaveResult, { status: "conflict" }>
    ) => void
  >()

  onConflict(
    listener: (
      path: string,
      result: Extract<TextFileSaveResult, { status: "conflict" }>
    ) => void
  ): () => void {
    this.conflictListeners.add(listener)
    return () => {
      this.conflictListeners.delete(listener)
    }
  }

  update(path: string, draft: TextDraft | null): void {
    if (draft) this.drafts.set(path, draft)
    else this.drafts.delete(path)
  }

  track(save: Promise<void>): Promise<void> {
    this.pending.add(save)
    void save.then(
      () => this.pending.delete(save),
      () => this.pending.delete(save)
    )
    return save
  }

  get isLocked(): boolean {
    return this.locked
  }

  release(): void {
    this.locked = false
  }

  async prepare(options: {
    choose: (paths: string[]) => Promise<"save" | "discard" | "cancel">
    save: (request: TextFileSaveRequest) => Promise<TextFileSaveResult>
    saved: (path: string, result: TextFileSaveResult) => void
  }): Promise<boolean> {
    this.locked = true
    try {
      while (this.pending.size) await Promise.allSettled([...this.pending])
      if (!this.drafts.size) return true
      const choice = await options.choose([...this.drafts.keys()])
      if (choice === "cancel") {
        this.release()
        return false
      }
      // Keep discarded drafts until destruction: another window may cancel quit.
      if (choice === "discard") return true
      for (const [relativePath, draft] of this.drafts) {
        const result = await options.save({
          relativePath,
          content: draft.content,
          expectedRevision: draft.revision,
        })
        options.saved(relativePath, result)
        if (result.status !== "saved") {
          for (const listener of this.conflictListeners)
            listener(relativePath, result)
          throw new Error(
            `Changed on disk: ${relativePath}. Save a copy or reload before closing.`
          )
        }
        this.drafts.delete(relativePath)
      }
      return true
    } catch (error) {
      this.release()
      throw error
    }
  }
}

export const textDraftLifecycle = new TextDraftLifecycle()
