import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  createTextLineBuffer,
  EidosLiteLogger,
  logCorrelationKey,
  sanitizeLogContext,
  sanitizeLogText,
} from "./logging"

describe("Eidos Lite structured logging", () => {
  it("decodes complete stderr lines across arbitrary process chunks", () => {
    const lines: string[] = []
    const buffer = createTextLineBuffer((line) => lines.push(line))

    buffer.write("trace one\ntrace")
    buffer.write(" two\r\ntrace three\npartial")
    buffer.end()

    expect(lines).toEqual(["trace one", "trace two", "trace three", "partial"])
  })

  it("redacts secrets, user paths, emails, and Remote identifiers", () => {
    const message = sanitizeLogText(
      "Bearer secret-token accessToken=abc me@example.com " +
        "/Users/mayne/Desktop/private-space/file.eidos " +
        "https://sync-staging.eidos.space/u-12345678901234567890/7d2b94ed6e9f772cbf65dc2a/raw/segments/8H251JbDVJ-2jrQWnJC8CxJB"
    )

    expect(message).toContain("Bearer [redacted]")
    expect(message).toContain("accessToken=[redacted]")
    expect(message).toContain("[email]")
    expect(message).toContain("<path>")
    expect(message).toContain(
      "<service>/<namespace>/<repository>/raw/segments/<object>"
    )
    expect(message).not.toContain("secret-token")
    expect(message).not.toContain("mayne")
    expect(message).not.toContain("7d2b94")
    expect(message).not.toContain("8H251")
  })

  it("retains numeric directory timing without exposing directory paths", () => {
    expect(
      sanitizeLogContext({
        serverTimingMs: { auth: 318, directory: 324, total: 811 },
        directory: "/Users/mayne/private",
      })
    ).toEqual({
      serverTimingMs: { auth: 318, directory: 324, total: 811 },
      directory: "<path>",
    })
  })

  it("writes JSONL, rotates bounded files, and returns recent safe entries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-log-"))
    try {
      let tick = 0
      const logger = new EidosLiteLogger(root, {
        maxBytes: 1_024,
        maxFiles: 3,
        now: () => new Date(1_800_000_000_000 + tick++),
      })
      for (let index = 0; index < 30; index += 1) {
        logger.info("sync.push.phase", {
          index,
          spaceId: "private-space-id",
          spaceKey: logCorrelationKey("private-space-id"),
          detail: "x".repeat(80),
        })
      }
      logger.error(
        "sync.push.failed",
        { remoteUrl: "https://sync.eidos.space/user/repository" },
        Object.assign(
          new Error(
            "request failed for /Users/mayne/private and Bearer token-value"
          ),
          { code: "transport" }
        )
      )

      const summary = logger.summary(5)
      const serialized = JSON.stringify(summary)
      expect(summary.format).toBe("jsonl")
      expect(summary.retainedFiles).toBeGreaterThan(1)
      expect(summary.retainedFiles).toBeLessThanOrEqual(3)
      expect(summary.recent).toHaveLength(5)
      expect(summary.recent.at(-1)).toMatchObject({
        event: "sync.push.failed",
        level: "error",
        error: { code: "transport" },
      })
      expect(serialized).not.toContain("private-space-id")
      expect(serialized).not.toContain("/Users/")
      expect(serialized).not.toContain("token-value")
      expect(serialized).not.toContain("/user/repository")
      expect(serialized).not.toContain("https://")
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
