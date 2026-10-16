import http from "node:http"

const CALLBACK_PATH = "/oauth/callback"
const CALLBACK_TIMEOUT_MS = 10 * 60_000

export class OAuthLoopbackCallback {
  private closing: Promise<void> | null = null
  private timeout: ReturnType<typeof setTimeout> | undefined
  private constructor(
    readonly redirectUri: string,
    private readonly server: http.Server,
    private readonly result: Promise<string>,
    private readonly cancel: (reason: Error) => boolean
  ) {}

  static async listen(
    expectedState: string,
    port = 13_128
  ): Promise<OAuthLoopbackCallback> {
    let resolveCode: (code: string) => void = () => undefined
    let rejectCode: (error: Error) => void = () => undefined
    let settled = false
    const result = new Promise<string>((resolve, reject) => {
      resolveCode = (code) => {
        if (settled) return
        settled = true
        resolve(code)
      }
      rejectCode = (error) => {
        if (settled) return
        settled = true
        reject(error)
      }
    })
    void result.catch(() => undefined)
    const server = http.createServer((request, response) => {
      if (settled) {
        response.writeHead(410).end("This sign-in request has ended")
        return
      }
      const url = new URL(request.url ?? "/", "http://127.0.0.1")
      if (url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end("Not found")
        return
      }
      if (url.searchParams.get("state") !== expectedState) {
        response.writeHead(400).end("Invalid OAuth state")
        return
      }
      const oauthError = url.searchParams.get("error")
      if (oauthError) {
        response
          .writeHead(400, { "Content-Type": "text/plain; charset=utf-8" })
          .end("Eidos Lite sign-in was not completed. You can close this tab.")
        rejectCode(new Error(`Eidos account sign-in failed: ${oauthError}`))
        return
      }
      const code = url.searchParams.get("code")
      if (!code) {
        response.writeHead(400).end("Missing OAuth code")
        return
      }
      response
        .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(
          "<!doctype html><meta charset=utf-8><title>Eidos Lite</title><p>Signed in to Eidos Lite. You can close this tab.</p>"
        )
      resolveCode(code)
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(port, "127.0.0.1", () => resolve())
    })
    const address = server.address()
    if (!address || typeof address === "string") {
      server.close()
      throw new Error("Eidos Lite could not start the sign-in callback.")
    }
    const callback = new OAuthLoopbackCallback(
      `http://127.0.0.1:${address.port}${CALLBACK_PATH}`,
      server,
      result,
      (reason) => {
        if (settled) return false
        rejectCode(reason)
        return true
      }
    )
    callback.timeout = setTimeout(
      () => void callback.close(new Error("Eidos account sign-in timed out.")),
      CALLBACK_TIMEOUT_MS
    )
    void result.then(
      () => callback.close(),
      () => callback.close()
    )
    return callback
  }

  waitForCode(): Promise<string> {
    return this.result
  }

  close(
    reason = new Error("Eidos account sign-in was cancelled.")
  ): Promise<void> {
    const interrupted = this.cancel(reason)
    if (this.timeout) clearTimeout(this.timeout)
    if (!this.closing) {
      this.closing = new Promise<void>((resolve) => {
        this.server.close(() => resolve())
        if (interrupted) this.server.closeAllConnections()
      })
    }
    return this.closing
  }
}
