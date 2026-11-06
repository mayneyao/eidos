/** Renderer-owned input fence, retained through async snapshot reads and React rekey. */
export class AutomaticMaterializationFence {
  readonly pending = new Set<string>()
  private token: string | null = null
  private restores: (() => void)[] = []
  private refreshes = new Set<Promise<unknown>>()
  private refreshed = false
  private compositions = new Set<Element>()
  private disconnect: (() => void) | undefined
  constructor(private readonly setLocked: (locked: boolean) => void) {}
  get locked(): boolean {
    return this.token !== null
  }

  connect(): void {
    if (this.disconnect) return
    const start = (event: Event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-eidos-file-workbench], #portal") &&
        !this.locked
      )
        this.compositions.add(event.target)
    }
    const end = (event: Event) => {
      if (event.target instanceof Element)
        this.compositions.delete(event.target)
    }
    document.addEventListener("compositionstart", start, true)
    document.addEventListener("compositionend", end, true)
    document.addEventListener("blur", end, true)
    this.disconnect = () => {
      document.removeEventListener("compositionstart", start, true)
      document.removeEventListener("compositionend", end, true)
      document.removeEventListener("blur", end, true)
    }
  }

  prepare(
    token: string,
    currentSpaceId: string | null,
    requestedSpaceId: string
  ): boolean {
    for (const element of this.compositions)
      if (!element.isConnected) this.compositions.delete(element)
    if (
      this.token ||
      currentSpaceId !== requestedSpaceId ||
      this.pending.size > 0 ||
      this.compositions.size > 0
    )
      return false
    this.token = token
    this.refreshed = false
    for (const element of document.querySelectorAll<HTMLElement>(
      "[data-eidos-file-workbench], #portal"
    )) {
      const alreadyInert = element.hasAttribute("inert")
      element.setAttribute("inert", "")
      this.restores.push(() => {
        if (!alreadyInert) element.removeAttribute("inert")
      })
    }
    // DOM capture also covers portal editors and prevents React handlers before
    // the disabled render. Native inert blocks actual user input/focus.
    const block = (event: Event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("[data-eidos-file-workbench], #portal")
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    for (const type of [
      "beforeinput",
      "input",
      "change",
      "click",
      "pointerdown",
      "keydown",
      "compositionstart",
    ]) {
      document.addEventListener(type, block, true)
      this.restores.push(() => document.removeEventListener(type, block, true))
    }
    this.setLocked(true)
    return true
  }

  trackRefresh<T>(refresh: Promise<T>): Promise<T> {
    const token = this.token
    this.refreshes.add(refresh)
    void refresh
      .then(() => {
        if (token === this.token) this.refreshed = true
      })
      .finally(() => this.refreshes.delete(refresh))
      .catch(() => undefined)
    return refresh
  }

  async release(
    token: string,
    recoverMissingRefresh?: () => Promise<void>
  ): Promise<void> {
    if (token !== this.token) return
    while (this.refreshes.size > 0)
      await Promise.allSettled([...this.refreshes])
    if (token !== this.token) return
    if (!this.refreshed) await recoverMissingRefresh?.()
    if (token !== this.token) return
    this.reset()
  }

  reset(): void {
    this.token = null
    for (const restore of this.restores.splice(0)) restore()
    this.setLocked(false)
  }

  dispose(): void {
    this.disconnect?.()
    this.disconnect = undefined
    this.token = null
    this.refreshes.clear()
    this.compositions.clear()
    this.pending.clear()
    for (const restore of this.restores.splice(0)) restore()
  }
}
