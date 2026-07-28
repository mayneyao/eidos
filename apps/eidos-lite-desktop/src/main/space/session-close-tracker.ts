export interface ClosableSpaceSession {
  close(): Promise<void>
}

export class SessionCloseTracker<Session extends ClosableSpaceSession> {
  private readonly inFlight = new Map<Session, Promise<void>>()

  close(session: Session): Promise<void> {
    const existing = this.inFlight.get(session)
    if (existing) return existing

    let tracked!: Promise<void>
    tracked = session.close().finally(() => {
      if (this.inFlight.get(session) === tracked) {
        this.inFlight.delete(session)
      }
    })
    this.inFlight.set(session, tracked)
    return tracked
  }

  async waitForAll(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight.values()])
    }
  }
}
