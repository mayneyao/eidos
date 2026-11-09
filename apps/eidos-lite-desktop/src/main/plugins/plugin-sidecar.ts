import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { constants } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { StringDecoder } from "node:string_decoder"
import type {
  BackgroundMessage,
  PluginManifest,
  SidecarEvent,
  SidecarLaunch,
  SidecarStatus,
} from "@eidos.space/plugin-sdk"
import { PluginError } from "@eidos.space/plugin-runtime/rpc"

const FRAME_LIMIT = 1024 * 1024
function untilAborted<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Native process startup cancelled"))
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort))
  })
}
export interface SidecarBinding {
  owner: number
  space: string
  hash: string
  cwd: string
  manifest: PluginManifest
  authorize(): Promise<void>
}
interface Run {
  binding: SidecarBinding
  controller: AbortController
  ready: Promise<ChildProcessWithoutNullStreams>
  child?: ChildProcessWithoutNullStreams
  finished: Promise<void>
  finish(): void
}

/** Only an explicitly configurable package may supply a reviewed argv vector. */
export function configuredSidecar(binding: SidecarBinding, value: unknown) {
  if (value === undefined) return binding
  if (!binding.manifest.sidecar?.configurable)
    throw new PluginError(
      "PERMISSION_DENIED",
      "This plugin does not declare configurable native startup"
    )
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PluginError(
      "INVALID_REQUEST",
      "Invalid native launch configuration"
    )
  const launch = value as Record<string, unknown>
  if (
    Object.keys(launch).sort().join() !== "args,command" ||
    typeof launch.command !== "string" ||
    launch.command.length > 4096 ||
    launch.command.includes("\0") ||
    (!path.isAbsolute(launch.command) &&
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(launch.command)) ||
    !Array.isArray(launch.args) ||
    launch.args.length > 64 ||
    launch.args.some(
      (arg) =>
        typeof arg !== "string" || arg.length > 8192 || arg.includes("\0")
    )
  )
    throw new PluginError(
      "INVALID_REQUEST",
      "Use an executable name or absolute path and up to 64 arguments"
    )
  return {
    ...binding,
    manifest: {
      ...binding.manifest,
      sidecar: {
        ...binding.manifest.sidecar,
        command: launch.command,
        args: [...launch.args] as string[],
      },
    },
  }
}
const launchOf = (binding: SidecarBinding): SidecarLaunch => ({
  command: binding.manifest.sidecar!.command,
  args: binding.manifest.sidecar!.args ?? [],
})

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return (
    !relative ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  )
}
async function searchDirectories(
  environment: NodeJS.ProcessEnv,
  spaceRoot?: string
): Promise<string[]> {
  const directories = [
    ...new Set([
      ...(environment.PATH ?? "")
        .split(path.delimiter)
        .filter((entry) => path.isAbsolute(entry)),
      path.join(os.homedir(), ".local", "bin"),
      path.join(os.homedir(), ".vite-plus", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
    ]),
  ]
  const trusted: string[] = []
  for (const directory of directories) {
    try {
      const canonical = await fs.realpath(directory)
      if (!spaceRoot || !inside(spaceRoot, canonical)) trusted.push(canonical)
    } catch {
      /* Missing PATH entries do not grant executable authority. */
    }
  }
  return [...new Set(trusted)]
}
/** Neither relative PATH entries nor executables inside a Space can shadow a program. */
export async function findSidecarCommand(
  command: string,
  environment = process.env,
  spaceRoot?: string
): Promise<string | null> {
  if (path.isAbsolute(command)) {
    try {
      await fs.access(command, constants.X_OK)
      if (
        spaceRoot &&
        inside(await fs.realpath(spaceRoot), await fs.realpath(command))
      )
        return null
      return (await fs.stat(command)).isFile() ? command : null
    } catch {
      return null
    }
  }
  const directories = await searchDirectories(environment, spaceRoot)
  // Shell shims (.cmd/.bat) are deliberately unsupported; no shell interprets argv.
  const names =
    process.platform === "win32" && !command.endsWith(".exe")
      ? [command + ".exe", command]
      : [command]
  for (const directory of directories)
    for (const name of names) {
      const candidate = path.join(directory, name)
      try {
        await fs.access(candidate, constants.X_OK)
        if (spaceRoot && inside(spaceRoot, await fs.realpath(candidate)))
          continue
        if ((await fs.stat(candidate)).isFile()) return candidate
      } catch {
        /* Try the next explicit search directory. */
      }
    }
  return null
}

/** Local native programs are trusted code, outside the JavaScript capability sandbox. */
export class PluginSidecarHost {
  private runs = new Map<string, Run>()
  private listeners = new Map<string, Set<(event: SidecarEvent) => void>>()
  private closed = false
  private stopping = new Map<
    ChildProcessWithoutNullStreams,
    ReturnType<typeof setTimeout>
  >()
  constructor(
    private readonly approve: (
      binding: SidecarBinding,
      executable: string,
      signal: AbortSignal
    ) => Promise<boolean>
  ) {}
  private key(binding: SidecarBinding) {
    return JSON.stringify([
      binding.owner,
      binding.space,
      binding.manifest.id,
      binding.hash,
    ])
  }
  private emit(binding: SidecarBinding, event: SidecarEvent) {
    for (const listener of this.listeners.get(this.key(binding)) ?? []) {
      try {
        listener(event)
      } catch {
        /* One observer cannot break process ownership. */
      }
    }
  }
  async status(binding: SidecarBinding): Promise<SidecarStatus> {
    await binding.authorize()
    const run = this.runs.get(this.key(binding))
    const command =
      run?.binding.manifest.sidecar!.command ??
      binding.manifest.sidecar!.command
    return {
      command,
      ...(run ? { launch: launchOf(run.binding) } : {}),
      available: !!(await findSidecarCommand(
        command,
        process.env,
        binding.cwd
      )),
      running:
        !!this.runs.get(this.key(binding))?.child &&
        !this.runs.get(this.key(binding))?.controller.signal.aborted,
    }
  }
  observe(
    binding: SidecarBinding,
    listener: (event: SidecarEvent) => void
  ): () => void {
    const key = this.key(binding)
    const listeners = this.listeners.get(key) ?? new Set()
    listeners.add(listener)
    this.listeners.set(key, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.listeners.delete(key)
    }
  }
  async start(
    binding: SidecarBinding,
    signal?: AbortSignal,
    launch?: unknown
  ): Promise<void> {
    await binding.authorize()
    binding = configuredSidecar(binding, launch)
    signal?.throwIfAborted()
    if (this.closed) throw new Error("Sidecar host is closed")
    const key = this.key(binding)
    const existing = this.runs.get(key)
    if (existing) {
      if (
        JSON.stringify(launchOf(existing.binding)) !==
        JSON.stringify(launchOf(binding))
      )
        throw new PluginError(
          "BUSY",
          "Native launch settings changed; stop the current process before applying them"
        )
      if (existing.controller.signal.aborted)
        throw new Error("Native process is stopping; reconnect after it exits")
      await existing.ready
      return
    }
    if (this.runs.size >= 16)
      throw new Error("Too many native plugin processes")
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener("abort", abort, { once: true })
    let finish!: () => void
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    const run: Run = {
      binding,
      controller,
      ready: Promise.resolve().then(() => this.launch(run)),
      finished,
      finish,
    }
    this.runs.set(key, run)
    try {
      await run.ready
    } catch (error) {
      if (this.runs.get(key) === run) this.runs.delete(key)
      if (!run.child) run.finish()
      throw error
    } finally {
      signal?.removeEventListener("abort", abort)
    }
  }
  private async launch(run: Run): Promise<ChildProcessWithoutNullStreams> {
    const { binding, controller } = run
    const executable = await findSidecarCommand(
      binding.manifest.sidecar!.command,
      process.env,
      binding.cwd
    )
    if (!executable)
      throw new Error(
        `${binding.manifest.sidecar!.command} is not installed. Install it separately, then reconnect.`
      )
    controller.signal.throwIfAborted()
    const deadline = setTimeout(() => controller.abort(), 5 * 60_000)
    try {
      if (
        !(await untilAborted(
          this.approve(binding, executable, controller.signal),
          controller.signal
        ))
      )
        throw new Error("Native process permission declined")
      await binding.authorize()
      controller.signal.throwIfAborted()
    } finally {
      clearTimeout(deadline)
    }
    const nativePath = await searchDirectories(process.env, binding.cwd)
    await binding.authorize()
    controller.signal.throwIfAborted()
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: [path.dirname(executable), ...nativePath].join(path.delimiter),
    }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_NO_ASAR
    delete env.NODE_OPTIONS
    const child = spawn(executable, binding.manifest.sidecar!.args ?? [], {
      cwd: binding.cwd,
      env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    })
    run.child = child
    const stop = () => this.kill(child)
    controller.signal.addEventListener("abort", stop, { once: true })
    if (controller.signal.aborted) stop()
    let pending = ""
    let bytes = 0
    let stderrBytes = 0
    const decoder = new StringDecoder("utf8")
    const stderrDecoder = new StringDecoder("utf8")
    const rate = setInterval(() => {
      bytes = 0
      stderrBytes = 0
    }, 1000)
    rate.unref()
    const fail = (message: string) => {
      this.emit(binding, { type: "error", message })
      controller.abort()
    }
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > 16 * FRAME_LIMIT) {
        fail("Native process output rate exceeded")
        return
      }
      pending += decoder.write(chunk)
      let newline: number
      while ((newline = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, newline).replace(/\r$/, "")
        pending = pending.slice(newline + 1)
        if (Buffer.byteLength(line) > FRAME_LIMIT) {
          fail("Native process frame exceeded 1 MiB")
          return
        }
        if (!line.trim()) continue
        try {
          this.emit(binding, {
            type: "message",
            data: JSON.parse(line) as BackgroundMessage,
          })
        } catch {
          fail(
            "Native process stdout must contain JSON records separated by LF"
          )
          return
        }
      }
      if (Buffer.byteLength(pending) > FRAME_LIMIT)
        fail("Native process frame exceeded 1 MiB")
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length
      if (stderrBytes <= FRAME_LIMIT)
        this.emit(binding, { type: "stderr", text: stderrDecoder.write(chunk) })
    })
    child.once("exit", () => controller.abort())
    child.once("close", (code, signal) => {
      clearInterval(rate)
      controller.signal.removeEventListener("abort", stop)
      if (pending.trim())
        this.emit(binding, {
          type: "error",
          message: "Native process exited with an incomplete JSON frame",
        })
      if (this.runs.get(this.key(binding)) === run)
        this.runs.delete(this.key(binding))
      this.emit(binding, { type: "exit", code, signal })
      run.finish()
    })
    child.on("error", (error) => fail(error.message))
    child.stdin.on("error", () => {})
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve)
      child.once("error", reject)
    })
    return child
  }
  async send(binding: SidecarBinding, data: BackgroundMessage): Promise<void> {
    await binding.authorize()
    const run = this.runs.get(this.key(binding))
    if (!run || run.controller.signal.aborted)
      throw new Error("Native process is not running")
    const child = await run.ready
    await binding.authorize()
    if (run.controller.signal.aborted) throw new Error("Native process stopped")
    const frame = JSON.stringify(data) + "\n"
    if (
      Buffer.byteLength(frame) > FRAME_LIMIT ||
      child.stdin.writableLength + Buffer.byteLength(frame) > 4 * FRAME_LIMIT
    )
      throw new Error("Native process input is too large or busy")
    await new Promise<void>((resolve, reject) =>
      child.stdin.write(frame, (error) => (error ? reject(error) : resolve()))
    )
  }
  async stop(binding: SidecarBinding): Promise<void> {
    const run = this.runs.get(this.key(binding))
    if (!run) return
    run.controller.abort()
    await run.ready.catch(() => {})
    await run.finished
  }
  private kill(child: ChildProcessWithoutNullStreams, force = false): void {
    const signal = (name: NodeJS.Signals) => {
      try {
        if (process.platform === "win32") {
          if (child.pid)
            spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
              windowsHide: true,
              stdio: "ignore",
            }).on("error", () => {})
        } else if (child.pid) process.kill(-child.pid, name)
      } catch {
        /* It may already have exited. */
      }
    }
    if (force) {
      clearTimeout(this.stopping.get(child))
      this.stopping.delete(child)
      signal("SIGKILL")
      return
    }
    if (this.stopping.has(child)) return
    signal("SIGTERM")
    const timer = setTimeout(() => {
      this.stopping.delete(child)
      signal("SIGKILL")
    }, 2000)
    this.stopping.set(child, timer)
    timer.unref()
    // Keep escalation even when the parent exits: descendants may ignore SIGTERM.
  }
  closeOwner(owner: number): void {
    for (const run of this.runs.values())
      if (run.binding.owner === owner) run.controller.abort()
  }
  revoke(pluginId: string, space?: string): void {
    for (const run of this.runs.values())
      if (
        run.binding.manifest.id === pluginId &&
        (!space || run.binding.space === space)
      )
        run.controller.abort()
  }
  close(): void {
    this.closed = true
    for (const run of this.runs.values()) run.controller.abort()
    // App shutdown cannot depend on an unref'ed grace timer surviving Electron exit.
    for (const child of this.stopping.keys()) this.kill(child, true)
  }
}
