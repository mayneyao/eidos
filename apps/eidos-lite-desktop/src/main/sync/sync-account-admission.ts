/** Covers the local drain before an account service transition starts. */
export class SyncAccountAdmission {
  private generation = 0
  private changes = 0

  beginChange(): { assertCurrent(): void; finish(): void } {
    const generation = ++this.generation
    this.changes += 1
    let finished = false
    return {
      assertCurrent: () => {
        if (finished || generation !== this.generation) throw this.changed()
      },
      finish: () => {
        if (finished) return
        finished = true
        this.changes -= 1
      },
    }
  }

  private changed(): Error {
    return Object.assign(
      new Error(
        "The Sync account changed. Try again with the current account."
      ),
      {
        code: "authentication-required",
      }
    )
  }

  capture(): () => void {
    const generation = this.generation
    const assertCurrent = () => {
      if (this.changes || generation !== this.generation) throw this.changed()
    }
    assertCurrent()
    return assertCurrent
  }
}
