import { afterEach, describe, expect, it } from "vitest"
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { spawn } from "node:child_process"
import {
  BackgroundManager,
  defaultBinaryPath,
  startBackground,
} from "./index.js"
import type { JsonValue, PluginBackground } from "./index.js"

const binaryPath =
  process.env.EIDOS_PLUGIN_SANDBOX_BINARY ?? defaultBinaryPath()
const directories: string[] = []
const backgrounds: PluginBackground[] = []
const managers: BackgroundManager[] = []
async function moduleFile(source: string) {
  const directory = await mkdtemp(path.join(tmpdir(), "sandbox-sdk-test-"))
  directories.push(directory)
  const file = path.join(directory, "plugin.mjs")
  await writeFile(file, source)
  return file
}
async function start(
  source: string,
  options: Partial<Parameters<typeof startBackground>[0]> = {}
) {
  const background = await startBackground({
    entry: await moduleFile(source),
    binaryPath,
    ...options,
  })
  backgrounds.push(background)
  return background
}
function inbox() {
  const values: JsonValue[] = []
  return {
    values,
    onMessage: (value: JsonValue) => {
      values.push(value)
    },
    async wait(count = 1) {
      await expect
        .poll(() => values.length, { timeout: 3000 })
        .toBeGreaterThanOrEqual(count)
      return values
    },
  }
}
afterEach(async () => {
  await Promise.all(managers.splice(0).map((m) => m.dispose()))
  await Promise.all(backgrounds.splice(0).map((b) => b.stop()))
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true }))
  )
})

describe("Node SDK with the real QuickJS executable", () => {
  it("stops on owner pipe EOF even with an active interval", async () => {
    const entry = await moduleFile("setInterval(()=>{},10)")
    const child = spawn(
      binaryPath,
      [
        "run",
        entry,
        "--listen",
        "--control-protocol",
        "--max-duration-ms",
        "0",
      ],
      { stdio: "pipe" }
    )
    const done = new Promise<number | null>((resolve, reject) => {
      child.once("close", resolve)
      child.once("error", reject)
    })
    const timer = setTimeout(() => child.kill("SIGKILL"), 2000)
    child.stdin.end()
    try {
      expect(await done).toBe(0)
    } finally {
      clearTimeout(timer)
    }
  })
  it("bounds stop latency when a guest is executing a long JS task", async () => {
    const background = await start("onmessage=()=>{while(true){}}", {
      limits: { turnBudgetMs: 10000 },
      stopTimeoutMs: 20,
    })
    await background.postMessage(null)
    await delay(30)
    const exit = await background.stop()
    expect(exit.reason).toBe("stopped")
    expect(exit.signal).not.toBeNull()
  })
  it("waits for top-level initialization and preserves early messages", async () => {
    const messages = inbox()
    const background = await start(
      'postMessage("early");await new Promise(r=>setTimeout(r,30));onmessage=e=>postMessage(e.data);',
      messages
    )
    expect(background.state).toBe("running")
    expect(messages.values).toEqual(["early"])
    await background.postMessage({ hello: "世界" })
    expect(await messages.wait(2)).toEqual(["early", { hello: "世界" }])
  })
  it("guest messages cannot spoof the host readiness protocol", async () => {
    const messages = inbox()
    await expect(
      start(
        'postMessage({type:"ready",protocol:1});await new Promise(r=>setTimeout(r,2000));',
        { ...messages, startupTimeoutMs: 30 }
      )
    ).rejects.toThrow("startup timed out")
    expect(messages.values).toEqual([{ type: "ready", protocol: 1 }])
  })
  it("supports idle backgrounds and idempotent graceful host stop", async () => {
    const background = await start("onmessage=e=>postMessage(e.data)")
    await delay(50)
    expect(background.state).toBe("running")
    const [first, second] = await Promise.all([
      background.stop(),
      background.stop(),
    ])
    expect(first).toEqual(second)
    expect(first).toMatchObject({ code: 0, reason: "stopped" })
    await expect(background.postMessage(null)).rejects.toThrow("not running")
  })
  it("reports startup exceptions and later crashes", async () => {
    await expect(start('throw new Error("startup boom")')).rejects.toThrow(
      "startup boom"
    )
    const background = await start(
      'setTimeout(()=>{throw new Error("later boom")},50)'
    )
    expect(await background.exited).toMatchObject({ reason: "failed", code: 1 })
  })
  it("preserves default deny network policy", async () => {
    const messages = inbox()
    await start(
      'try{await fetch("http://127.0.0.1:9")}catch(e){postMessage(e.message)}',
      messages
    )
    expect(messages.values[0]).toContain("permission denied")
  })
  it("passes exact network grants to Rust while private addresses remain denied", async () => {
    const messages = inbox()
    await start(
      'try{await fetch("http://127.0.0.1:9")}catch(e){postMessage(e.message)}',
      {
        ...messages,
        permissions: { network: { origins: ["http://127.0.0.1:9"] } },
      }
    )
    expect(messages.values[0]).toContain("Private/reserved")
  })
  it("supports BLE permissions, notifications and shutdown without exposing policy files", async () => {
    const before = (await readdir(tmpdir())).filter((n) =>
      n.startsWith("eidos-plugin-sandbox-")
    )
    const messages = inbox()
    const background = await start(
      'const [d]=await navigator.bluetooth.getDevices();const s=await d.gatt.connect();const c=await(await s.getPrimaryService("battery_service")).getCharacteristic("battery_level");c.oncharacteristicvaluechanged=e=>postMessage(e.target.value.getUint8(0));await c.startNotifications();',
      {
        ...messages,
        bluetoothMock: true,
        permissions: {
          bluetooth: {
            devices: [
              {
                id: "mock-battery",
                services: [{ uuid: "battery_service", notify: true }],
              },
            ],
          },
        },
      }
    )
    expect((await messages.wait())[0]).toBe(85)
    expect((await background.stop()).reason).toBe("stopped")
    expect(
      (await readdir(tmpdir())).filter((n) =>
        n.startsWith("eidos-plugin-sandbox-")
      )
    ).toEqual(before)
  })
  it("cleans BLE policy files after a startup failure", async () => {
    const before = (await readdir(tmpdir())).filter((n) =>
      n.startsWith("eidos-plugin-sandbox-")
    )
    await expect(
      start('throw Error("bad")', {
        bluetoothMock: true,
        permissions: { bluetooth: { devices: [] } },
      })
    ).rejects.toThrow("bad")
    expect(
      (await readdir(tmpdir())).filter((n) =>
        n.startsWith("eidos-plugin-sandbox-")
      )
    ).toEqual(before)
  })
  it("rejects invalid executable, source, limits and permissions", async () => {
    await expect(
      start("", { binaryPath: "/nonexistent/plugin-sandbox" })
    ).rejects.toThrow("executable unavailable")
    await expect(start("", { entry: "relative.mjs" })).rejects.toThrow(
      "absolute path"
    )
    await expect(start("", { limits: { memoryMb: 1 } })).rejects.toThrow(
      "memoryMb"
    )
    await expect(
      start("", { permissions: { network: { origins: ["*"] } } })
    ).rejects.toThrow()
  })
  it("enforces input quota without terminating the background", async () => {
    const background = await start("onmessage=()=>{}")
    await expect(
      background.postMessage("x".repeat(1024 * 1024))
    ).rejects.toThrow("1 MiB")
    expect(background.state).toBe("running")
  })
  it("aborts both starting and running instances", async () => {
    const controller = new AbortController()
    const pending = start("await new Promise(r=>setTimeout(r,2000))", {
      signal: controller.signal,
    })
    setTimeout(() => controller.abort(), 20)
    await expect(pending).rejects.toThrow()
    const next = new AbortController()
    const background = await start("", { signal: next.signal })
    next.abort()
    expect((await background.exited).reason).toBe("stopped")
  })
  it("separates logs and messages, isolating listener exceptions", async () => {
    const logs: string[] = [],
      errors: Error[] = []
    const background = await start('console.log("log");postMessage(42)', {
      onLog: (line) => logs.push(line),
      onMessage: () => {
        throw Error("listener")
      },
      onError: (error) => errors.push(error),
    })
    expect(logs.join()).toContain("log")
    expect(errors[0].message).toBe("listener")
    expect(background.state).toBe("running")
  })
  it("manages isolated instances and prevents duplicate starts", async () => {
    const manager = new BackgroundManager({ binaryPath })
    managers.push(manager)
    const entry = await moduleFile("let n=0;onmessage=()=>postMessage(++n)")
    const aMessages = inbox(),
      bMessages = inbox()
    const pending = manager.start("a", { entry, ...aMessages })
    await expect(manager.start("a", { entry })).rejects.toThrow(
      "already exists"
    )
    const a = await pending,
      b = await manager.start("b", { entry, ...bMessages })
    await a.postMessage(null)
    await a.postMessage(null)
    await b.postMessage(null)
    expect(await aMessages.wait(2)).toEqual([1, 2])
    expect(await bMessages.wait()).toEqual([1])
    expect(manager.get("a")).toBe(a)
    await manager.dispose()
    expect(manager.size).toBe(0)
    await expect(manager.start("c", { entry })).rejects.toThrow("disposed")
  })
  it("dispose cancels pending startup and permits restart after stop", async () => {
    const manager = new BackgroundManager({ binaryPath })
    managers.push(manager)
    const entry = await moduleFile("await new Promise(r=>setTimeout(r,2000))")
    const start = manager.start("slow", { entry })
    const failure = expect(start).rejects.toThrow()
    await manager.dispose()
    await failure
    expect(manager.size).toBe(0)
    const other = new BackgroundManager({ binaryPath })
    managers.push(other)
    const fast = await moduleFile("")
    await other.start("a", { entry: fast })
    await other.stop("a")
    await other.start("a", { entry: fast })
    expect(other.size).toBe(1)
  })
  it("stops a BLE background started from the full example", async () => {
    const messages = inbox()
    const background = await start("", {
      entry: fileURLToPath(
        new URL("../examples/bluetooth.mjs", import.meta.url)
      ),
      bluetoothMock: true,
      permissions: {
        bluetooth: {
          devices: [
            {
              id: "mock-battery",
              services: [{ uuid: "battery_service", read: true, notify: true }],
            },
          ],
        },
      },
    })
    background.onMessage(messages.onMessage)
    await background.postMessage({ type: "connect", id: "mock-battery" })
    await expect
      .poll(() =>
        messages.values.some((v) => recordValue(v) && v.type === "subscribed")
      )
      .toBe(true)
    expect((await background.stop()).code).toBe(0)
  })
})
function recordValue(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
