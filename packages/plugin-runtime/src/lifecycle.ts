import type { ActionContext, Disposable, Lifetime } from "./contracts"
import { PluginError } from "./errors"

/** Host-owned scopes. Guest code never receives the controller or this object. */
export class Scope implements Lifetime, Disposable {
  private readonly controller = new AbortController()
  private readonly owned = new Set<Disposable>()
  readonly signal = this.controller.signal
  readonly subscriptions = {
    add: <T extends Disposable>(item: T): T => {
      if (this.signal.aborted) {
        this.release(item)
        this.assertActive()
      }
      this.owned.add(item)
      return item
    },
  }
  constructor(
    private readonly diagnostic: (error: unknown) => void = () => {}
  ) {}
  assertActive(): void {
    if (this.signal.aborted)
      throw new PluginError("INSTANCE_CLOSED", "Plugin lifetime has ended")
  }
  private release(item: Disposable) {
    try {
      item.dispose()
    } catch (error) {
      this.diagnostic(error)
    }
  }
  dispose(): void {
    if (this.signal.aborted) return
    this.controller.abort()
    const items = [...this.owned].reverse()
    this.owned.clear()
    for (const item of items) this.release(item)
  }
}

type Handler = (context: ActionContext) => void | Promise<void>
/** Registration is private until commit. Failed activations never publish handlers. */
export class ActionRegistry implements Disposable {
  private readonly handlers = new Map<string, Handler>()
  private state: "staging" | "active" | "closed" = "staging"
  constructor(
    private readonly declared: ReadonlySet<string>,
    private readonly scope: Scope
  ) {
    scope.subscriptions.add(this)
  }
  register(id: string, handler: Handler): Disposable {
    this.scope.assertActive()
    if (
      this.state !== "staging" ||
      !this.declared.has(id) ||
      this.handlers.has(id)
    )
      throw new PluginError(
        "REGISTRATION_CONFLICT",
        "Undeclared, duplicate or late action registration"
      )
    this.handlers.set(id, handler)
    let disposed = false
    return this.scope.subscriptions.add({
      dispose: () => {
        if (!disposed) {
          disposed = true
          this.handlers.delete(id)
        }
      },
    })
  }
  commit(): void {
    this.scope.assertActive()
    if (this.state !== "staging" || this.handlers.size !== this.declared.size) {
      this.dispose()
      throw new PluginError(
        "REGISTRATION_CONFLICT",
        "Activation did not register every action"
      )
    }
    this.state = "active"
  }
  async invoke(
    id: string,
    context: ActionContext,
    invocation: Scope
  ): Promise<void> {
    this.scope.assertActive()
    invocation.assertActive()
    const handler = this.handlers.get(id)
    if (this.state !== "active" || !handler)
      throw new PluginError("REGISTRATION_CONFLICT", "Action is not available")
    const abort = () => invocation.dispose()
    this.scope.signal.addEventListener("abort", abort, { once: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    let rejectAbort: (() => void) | undefined
    try {
      await Promise.race([
        Promise.resolve().then(() => {
          invocation.assertActive()
          return handler(context)
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new PluginError("TIMEOUT", "Action exceeded 30 seconds"))
            invocation.dispose()
          }, 30000)
          rejectAbort = () =>
            reject(new PluginError("INSTANCE_CLOSED", "Action lifetime ended"))
          invocation.signal.addEventListener("abort", rejectAbort, {
            once: true,
          })
        }),
      ])
    } finally {
      clearTimeout(timer)
      if (rejectAbort)
        invocation.signal.removeEventListener("abort", rejectAbort)
      this.scope.signal.removeEventListener("abort", abort)
      invocation.dispose()
    }
  }
  dispose(): void {
    this.state = "closed"
    this.handlers.clear()
  }
}
