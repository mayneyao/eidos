import { it, expect } from "vitest"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import ts from "typescript"
import { startBackground, type JsonValue } from "./index.js"

it("routes concurrent file replies through one real background WebSocket", async () => {
  const fixture = new URL(
    "../examples/lite-file-websocket/server.py",
    import.meta.url
  ).pathname
  const server = spawn("python3", [
    "-u",
    "-c",
    "import runpy,sys; s=runpy.run_path(sys.argv[1])['server'](0); print(s.server_port, flush=True); s.serve_forever()",
    fixture,
  ])
  const directory = await mkdtemp(path.join(tmpdir(), "file-ws-example-"))
  let background: Awaited<ReturnType<typeof startBackground>> | undefined
  try {
    const [chunk] = await Promise.race([
      once(server.stdout, "data"),
      once(server, "exit").then(([code]) => {
        throw new Error(`Python server exited: ${code}`)
      }),
    ])
    const origin = `ws://127.0.0.1:${Number(String(chunk).trim())}`
    const source = (
      await readFile(
        new URL(
          "../examples/lite-file-websocket/background.ts",
          import.meta.url
        ),
        "utf8"
      )
    ).replace("ws://127.0.0.1:8787/echo", `${origin}/echo`)
    const entry = path.join(directory, "background.mjs")
    await writeFile(
      entry,
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText
    )
    const replies = new Map<string, (data: Record<string, JsonValue>) => void>()
    background = await startBackground({
      entry,
      // Trusted test host; packaged Lite never grants private network access.
      permissions: {
        network: { origins: [origin], allowPrivateAddresses: true },
      },
      onMessage(value) {
        const envelope = value as {
          requestId: string
          data: Record<string, JsonValue>
        }
        replies.get(envelope.requestId)?.(envelope.data)
      },
    })
    const request = (id: string, text: string) =>
      new Promise<Record<string, JsonValue>>((resolve, reject) => {
        replies.set(id, resolve)
        void background!
          .postMessage({ requestId: id, data: { command: "send", text } })
          .catch(reject)
      })
    const [a, b] = await Promise.all([
      request("file-a", "hello A"),
      request("file-b", "hello B"),
    ])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(a.text).toBe("hello A")
    expect(b.text).toBe("hello B")
    expect(a.connection).toBe(b.connection)
    expect([a.messageNumber, b.messageNumber].sort()).toEqual([1, 2])
    expect([a.reused, b.reused]).toContain(false)
    expect([a.reused, b.reused]).toContain(true)
    const reopened = await request("reopened-a", "new view, same socket")
    expect(reopened.connection).toBe(a.connection)
    expect(reopened.messageNumber).toBe(3)
    expect(reopened.reused).toBe(true)
    expect(reopened.connectedAt).toBe(a.connectedAt)
    const oversized = await request("large", "x".repeat(16001))
    expect(oversized.ok).toBe(false)
    expect(oversized.error).toContain("16,000")
    const afterError = await request("after-error", "still alive")
    expect(afterError.connection).toBe(a.connection)
  } finally {
    await background?.stop()
    server.kill()
    await rm(directory, { recursive: true, force: true })
  }
})
