import { spawn } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"

interface PasteboardResponse {
  changeCount: number
}
export class ClipboardOwnershipChangedError extends Error {
  constructor() {
    super("The system clipboard changed; copy again")
  }
}
export interface SystemClipboardFiles {
  paths: string[]
  image?: string
  internalOnly?: boolean
}

export function runFileClipboardHelper(
  executable: string,
  request: Record<string, unknown>,
  testPasteboard?: string
): Promise<PasteboardResponse> {
  if (testPasteboard && !testPasteboard.startsWith("eidos-test-"))
    throw new Error("An isolated test pasteboard is required")
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      testPasteboard ? ["--pasteboard", testPasteboard] : [],
      { stdio: ["pipe", "pipe", "ignore"] }
    )
    const failure = () =>
      reject(
        new Error(
          "The system file clipboard is unavailable. Try copying again."
        )
      )
    const timer = setTimeout(() => {
      child.kill()
      failure()
    }, 10000)
    const chunks: Buffer[] = []
    let size = 0
    child.stdout.on("data", (bytes: Buffer) => {
      size += bytes.length
      if (size > 65536) {
        child.kill()
        failure()
      } else chunks.push(bytes)
    })
    child.on("error", () => {
      clearTimeout(timer)
      failure()
    })
    child.stdin.on("error", () => undefined)
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 4) return reject(new ClipboardOwnershipChangedError())
      if (code !== 0) return failure()
      try {
        const value: unknown = JSON.parse(
          Buffer.concat(chunks).toString("utf8")
        )
        if (
          !value ||
          typeof value !== "object" ||
          !("changeCount" in value) ||
          !Number.isSafeInteger(value.changeCount)
        )
          return failure()
        resolve(value as PasteboardResponse)
      } catch {
        failure()
      }
    })
    child.stdin.end(JSON.stringify(request))
  })
}

/** Main-process owner. Neither file paths nor clipboard contents reach renderer. */
export class SystemFileClipboard {
  private readonly salt = randomUUID()
  private generation = 0
  private cancellation = new AbortController()
  private pending: Promise<unknown> = Promise.resolve()
  constructor(
    private readonly executable: string,
    readonly supported = process.platform === "darwin",
    private readonly run = runFileClipboardHelper
  ) {}
  reserve(): number {
    this.cancellation.abort(new Error("File copy was superseded"))
    this.cancellation = new AbortController()
    return ++this.generation
  }
  signal(): AbortSignal {
    return this.cancellation.signal
  }
  async changeCount(): Promise<number> {
    await this.pending.catch(() => undefined)
    return (await this.run(this.executable, { action: "state" })).changeCount
  }
  private token(count: number) {
    return createHash("sha256").update(`${this.salt}:${count}`).digest("hex")
  }
  async write(
    generation: number,
    files: SystemClipboardFiles,
    assertCurrent: () => void,
    expected: number,
    published?: (changeCount: number) => Promise<void>,
    notPublished?: () => Promise<void>
  ): Promise<{
    systemClipboardToken: string
    systemClipboardWarning?: string
  }> {
    let attempted = false
    const operation = this.pending
      .catch(() => undefined)
      .then(async () => {
        if (generation !== this.generation)
          throw new Error("File copy was superseded")
        assertCurrent()
        attempted = true
        const result = await this.run(this.executable, {
          action: "write",
          ...files,
          expected,
        })
        await published?.(result.changeCount)
        if (generation !== this.generation)
          throw new Error("File copy was superseded")
        assertCurrent()
        return {
          systemClipboardToken: this.token(result.changeCount),
          ...(files.internalOnly
            ? {
                systemClipboardWarning:
                  "This selection can currently be copied only within Eidos Lite. System export of folders and Eidos files is not available yet.",
              }
            : {}),
        }
      })
      .catch(async (cause: unknown) => {
        if (!attempted || cause instanceof ClipboardOwnershipChangedError)
          await notPublished?.()
        throw cause
      })
    this.pending = operation
    return operation
  }
  async isCurrent(token: string): Promise<boolean> {
    if (!this.supported || !/^[a-f0-9]{64}$/.test(token)) return false
    await this.pending.catch(() => undefined)
    return (
      token ===
      this.token(
        (await this.run(this.executable, { action: "state" })).changeCount
      )
    )
  }
}
