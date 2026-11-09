import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { SidecarEvent } from "@eidos.space/plugin-sdk"
import {
  findSidecarCommand,
  configuredSidecar,
  PluginSidecarHost,
  type SidecarBinding,
} from "./plugin-sidecar"

let directory: string
const hosts: PluginSidecarHost[] = []
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-sidecar-"))
  directory = await fs.realpath(directory)
})
afterEach(async () => {
  for (const host of hosts.splice(0)) host.close()
  await fs.rm(directory, { recursive: true, force: true })
})
const hostWith = (
  approve: ConstructorParameters<typeof PluginSidecarHost>[0] = async () => true
) => {
  const host = new PluginSidecarHost(approve)
  hosts.push(host)
  return host
}
const binding = (code: string, owner = 1): SidecarBinding => ({
  owner,
  space: "space",
  hash: "a".repeat(64),
  cwd: directory,
  manifest: {
    apiVersion: 1,
    id: "test.native",
    name: "Native",
    version: "1.0.0",
    requires: { pluginApi: "3.8.0" },
    sidecar: { command: "node", args: ["-e", code] },
  },
  authorize: async () => {},
})
const echo = String.raw`process.stdout.write(JSON.stringify({boot:true,cwd:process.cwd()})+'\n');let text='';process.stdin.on('data',chunk=>{text+=chunk;let n;while((n=text.indexOf('\n'))>=0){process.stdout.write(text.slice(0,n+1));text=text.slice(n+1)}});`

it("reviews configured argv, rejects undeclared overrides, and awaits exit before restarting", async () => {
  const native = binding(echo)
  const launch = {
    command: (await findSidecarCommand("node"))!,
    args: ["-e", echo],
  }
  expect(() => configuredSidecar(native, launch)).toThrow("does not declare")
  native.manifest.sidecar!.configurable = true
  const approve = vi.fn(async (_binding: SidecarBinding) => true),
    host = hostWith(approve)
  await host.start(native, undefined, launch)
  expect(approve.mock.calls[0]![0].manifest.sidecar).toMatchObject(launch)
  expect((await host.status(native)).launch).toEqual(launch)
  const changed = { ...launch, args: ["-e", echo + "\n// changed"] }
  await expect(host.start(native, undefined, changed)).rejects.toThrow(
    "stop the current"
  )
  await host.stop(native)
  await host.start(native, undefined, changed)
  expect(approve).toHaveBeenCalledTimes(2)
  await host.stop(native)
  for (const invalid of [
    { command: "pi;echo x", args: [] },
    { command: "pi", args: ["\0"] },
    { ...launch, cwd: "/" },
    { ...launch, maxOutputFrameBytes: 16777216 },
  ])
    expect(() => configuredSidecar(native, invalid)).toThrow()
  expect(
    await findSidecarCommand(
      path.join(directory, "inside"),
      process.env,
      directory
    )
  ).toBeNull()
})

it("status and observers do not execute; closing a View does not stop the owned run", async () => {
  const approve = vi.fn(async () => true)
  const host = hostWith(approve),
    native = binding(echo),
    events: SidecarEvent[] = []
  const unsubscribe = host.observe(native, (event) => events.push(event))
  expect(await host.status(native)).toMatchObject({
    available: true,
    running: false,
  })
  expect(approve).not.toHaveBeenCalled()
  await host.start(native)
  await vi.waitFor(() =>
    expect(events).toContainEqual({
      type: "message",
      data: { boot: true, cwd: directory },
    })
  )
  unsubscribe()
  expect((await host.status(native)).running).toBe(true)
  const again: SidecarEvent[] = []
  host.observe(native, (event) => again.push(event))
  await host.start(native)
  expect(approve).toHaveBeenCalledTimes(1)
  await host.send(native, { text: "中文\u2028line\u2029separator", id: 1 })
  await vi.waitFor(() =>
    expect(again).toContainEqual({
      type: "message",
      data: { text: "中文\u2028line\u2029separator", id: 1 },
    })
  )
  host.stop(native)
  await vi.waitFor(() =>
    expect(again.some((event) => event.type === "exit")).toBe(true)
  )
  expect((await host.status(native)).running).toBe(false)
})

it("assembles split UTF-8 frames and accepts CRLF without splitting Unicode separators", async () => {
  const host = hostWith(),
    native = binding(
      String.raw`const b=Buffer.from(JSON.stringify({text:'中\u2028文'})+'\r\n');process.stdout.write(b.subarray(0,10));setTimeout(()=>process.stdout.write(b.subarray(10)),30);process.stdin.resume()`
    )
  const events: SidecarEvent[] = []
  host.observe(native, (event) => events.push(event))
  await host.start(native)
  await vi.waitFor(() =>
    expect(events).toContainEqual({
      type: "message",
      data: { text: "中\u2028文" },
    })
  )
})

it("accepts an explicitly declared large history response and remains connected", async () => {
  const host = hostWith(),
    native = binding(
      String.raw`process.stdout.write(JSON.stringify({type:'response',data:{messages:[{role:'toolResult',content:'中'.repeat(450000)}]}})+'\n');process.stdin.on('data',()=>process.stdout.write('{"alive":true}\n'))`
    )
  Object.assign(native.manifest.sidecar!, {
    maxOutputFrameBytes: 2 * 1024 * 1024,
  })
  const events: SidecarEvent[] = []
  host.observe(native, (event) => events.push(event))
  await host.start(native)
  await vi.waitFor(() =>
    expect(events.some((event) => event.type === "message")).toBe(true)
  )
  expect(events.some((event) => event.type === "error")).toBe(false)
  expect((await host.status(native)).running).toBe(true)
  await host.send(native, { type: "get_state" })
  await vi.waitFor(() =>
    expect(events).toContainEqual({ type: "message", data: { alive: true } })
  )
})

it.each([undefined, 2 * 1024 * 1024, 16 * 1024 * 1024])(
  "accepts the exact output byte boundary including split CRLF: %s",
  async (declared) => {
    const limit = declared ?? 1024 * 1024
    const native = binding(
      `process.stdout.write('"'+'x'.repeat(${limit}-2)+'"\\r');setTimeout(()=>process.stdout.write('\\n'),30);process.stdin.resume()`
    )
    if (declared !== undefined)
      Object.assign(native.manifest.sidecar!, { maxOutputFrameBytes: declared })
    const host = hostWith(),
      events: SidecarEvent[] = []
    host.observe(native, (event) => events.push(event))
    await host.start(native)
    // Allow the full 16 MiB record to drain through OS pipes on CI.
    await vi.waitFor(
      () =>
        expect(
          events.some(
            (event) =>
              event.type === "message" &&
              typeof event.data === "string" &&
              event.data.length === limit - 2
          )
        ).toBe(true),
      { timeout: 5000 }
    )
    expect(events.some((event) => event.type === "error")).toBe(false)
    expect((await host.status(native)).running).toBe(true)
  },
  10000
)

it.each([
  { declared: undefined, bytes: 1024 * 1024 + 1 },
  { declared: 2 * 1024 * 1024, bytes: 2 * 1024 * 1024 + 1 },
])(
  "rejects a record over its declared limit and reports only the first error: %s",
  async ({ declared, bytes }) => {
    const native = binding(
      `process.stdout.write('"'+'x'.repeat(${bytes}-2)+'"\\n{"after":true}\\n');process.stdin.resume()`
    )
    if (declared !== undefined)
      Object.assign(native.manifest.sidecar!, { maxOutputFrameBytes: declared })
    const host = hostWith(),
      events: SidecarEvent[] = []
    host.observe(native, (event) => events.push(event))
    await host.start(native)
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === "exit")).toBe(true)
    )
    expect(events.filter((event) => event.type === "error")).toEqual([
      {
        type: "error",
        message: `Native process frame exceeded ${declared ?? 1024 * 1024} bytes`,
      },
    ])
    expect(events.some((event) => event.type === "message")).toBe(false)
  }
)

it("keeps malformed JSON and aggregate output rate bounded with large frames enabled", async () => {
  for (const code of [
    String.raw`process.stdout.write('invalid\n{"after":true}\n');process.stdin.resume()`,
    String.raw`const frame='"'+'x'.repeat(1024*1024-2)+'"\n';process.stdout.write(frame.repeat(34));process.stdin.resume()`,
  ]) {
    const host = hostWith(),
      native = binding(code),
      events: SidecarEvent[] = []
    Object.assign(native.manifest.sidecar!, {
      maxOutputFrameBytes: 16 * 1024 * 1024,
    })
    host.observe(native, (event) => events.push(event))
    await host.start(native)
    await vi.waitFor(() =>
      expect(events.some((event) => event.type === "exit")).toBe(true)
    )
    const errors = events.filter((event) => event.type === "error")
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toMatch(/JSON records|output rate exceeded/)
  }
})

it("cancels startup promptly and a late approval cannot launch a process", async () => {
  let finish!: (value: boolean) => void
  const approve = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve
      })
  )
  const host = hostWith(approve),
    native = binding(echo)
  const events: SidecarEvent[] = []
  host.observe(native, (event) => events.push(event))
  const opening = host.start(native)
  const rejected = expect(opening).rejects.toThrow("cancelled")
  await vi.waitFor(() => expect(approve).toHaveBeenCalled())
  host.closeOwner(1)
  await rejected
  finish(true)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(events).toEqual([])
  expect((await host.status(native)).running).toBe(false)
})

it("checks revocation after approval and keeps owners isolated", async () => {
  const host = hostWith(),
    a = binding(echo, 1),
    b = binding(echo, 2)
  await host.start(a)
  await host.start(b)
  host.closeOwner(1)
  await vi.waitFor(async () =>
    expect((await host.status(a)).running).toBe(false)
  )
  expect((await host.status(b)).running).toBe(true)
  b.authorize = async () => {
    throw new Error("revoked")
  }
  await expect(host.send(b, {})).rejects.toThrow("revoked")
  host.revoke(b.manifest.id)
})

it.each([
  "process.stdout.write('invalid\\n');process.stdin.resume()",
  "process.stdout.write('x'.repeat(1024*1024+1));process.stdin.resume()",
])("terminates malformed or oversized protocol output: %s", async (code) => {
  const host = hostWith(),
    native = binding(code),
    events: SidecarEvent[] = []
  host.observe(native, (event) => events.push(event))
  await host.start(native)
  await vi.waitFor(() =>
    expect(events.some((event) => event.type === "error")).toBe(true)
  )
  await vi.waitFor(() =>
    expect(events.some((event) => event.type === "exit")).toBe(true)
  )
})

it("includes the incoming JSON frame in the pending stdin limit", async () => {
  const host = hostWith()
  const native = binding("process.stdin.pause();setInterval(()=>{},1000)")
  await host.start(native)
  const errors: unknown[] = []
  const writes = Array.from({ length: 6 }, () =>
    host.send(native, "x".repeat(1024 * 1024 - 3)).catch((error: unknown) => {
      errors.push(error)
    })
  )
  try {
    await vi.waitFor(() =>
      expect(
        errors.filter(
          (error) => error instanceof Error && error.message.includes("busy")
        )
      ).toHaveLength(2)
    )
  } finally {
    host.stop(native)
    await Promise.all(writes)
  }
})

it("never grants a declined start or resolves a workspace-relative PATH program", async () => {
  const host = hostWith(async () => false)
  await expect(host.start(binding(echo))).rejects.toThrow("declined")
  const command = "eidos-untrusted-native-probe"
  await fs.writeFile(path.join(directory, command), "#!/bin/sh\nexit 0", {
    mode: 0o700,
  })
  expect(await findSidecarCommand(command, { PATH: ".:relative" })).toBeNull()
  expect(
    await findSidecarCommand(command, { PATH: directory }, directory)
  ).toBeNull()
})

it.skipIf(process.platform === "win32").each(["stop", "close"] as const)(
  "cleans up a descendant that ignores SIGTERM on %s",
  async (mode) => {
    const childCode =
      "process.on('SIGTERM',()=>{});process.stdout.write(JSON.stringify({childPid:process.pid})+String.fromCharCode(10));setInterval(()=>{},1000)"
    const code = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000)`
    const host = hostWith(),
      native = binding(code)
    let childPid = 0
    let exited = false
    host.observe(native, (event) => {
      if (
        event.type === "message" &&
        event.data &&
        typeof event.data === "object" &&
        !Array.isArray(event.data) &&
        typeof event.data.childPid === "number"
      )
        childPid = event.data.childPid
      if (event.type === "exit") exited = true
    })
    await host.start(native)
    await vi.waitFor(() => expect(childPid).toBeGreaterThan(0))
    if (mode === "close") host.close()
    else host.stop(native)
    await vi.waitFor(() => expect(exited).toBe(true), { timeout: 5000 })
    expect(() => process.kill(childPid, 0)).toThrow()
  }
)
