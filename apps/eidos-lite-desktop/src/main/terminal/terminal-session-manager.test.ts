import { describe, expect, it, vi } from "vitest"
import type { IDisposable, IPty } from "node-pty"

import { EIDOS_LITE_TERMINAL_SESSIONS_PER_WINDOW_MAX } from "../../shared/contracts"
import {
  TerminalSessionManager,
  type TerminalPtySpawner,
} from "./terminal-session-manager"

class FakePty {
  readonly write = vi.fn()
  readonly resize = vi.fn()
  readonly kill = vi.fn()
  private dataListener: ((data: string) => void) | null = null
  private exitListener:
    | ((event: { exitCode: number; signal?: number }) => void)
    | null = null

  onData(listener: (data: string) => void): IDisposable {
    this.dataListener = listener
    return { dispose: () => (this.dataListener = null) }
  }

  onExit(
    listener: (event: { exitCode: number; signal?: number }) => void
  ): IDisposable {
    this.exitListener = listener
    return { dispose: () => (this.exitListener = null) }
  }

  emitData(data: string): void {
    this.dataListener?.(data)
  }

  emitExit(exitCode: number, signal?: number): void {
    this.exitListener?.({ exitCode, signal })
  }
}

function setup() {
  const ptys: FakePty[] = []
  const spawn = vi.fn<TerminalPtySpawner>(() => {
    const pty = new FakePty()
    ptys.push(pty)
    return pty as unknown as IPty
  })
  return { manager: new TerminalSessionManager(spawn), ptys, spawn }
}

describe("TerminalSessionManager", () => {
  it("starts a login shell in the Space with a clean terminal environment", () => {
    const { manager, spawn, ptys } = setup()
    const onData = vi.fn()
    const onExit = vi.fn()
    const session = manager.start({
      ownerId: 7,
      cwd: "/spaces/notes",
      cols: 100,
      rows: 32,
      environment: {
        SHELL: "/bin/zsh",
        PATH: "/usr/bin",
        ELECTRON_RUN_AS_NODE: "1",
      },
      platform: "darwin",
      onData,
      onExit,
    })

    expect(session.shell).toBe("zsh")
    expect(spawn).toHaveBeenCalledWith(
      "/bin/zsh",
      ["-l"],
      expect.objectContaining({
        cwd: "/spaces/notes",
        cols: 100,
        rows: 32,
        name: "xterm-256color",
        env: expect.objectContaining({
          PATH: "/usr/bin",
          LANG: "en_US.UTF-8",
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          TERM_PROGRAM: "Eidos Lite",
        }),
      })
    )
    const environment = spawn.mock.calls[0]?.[2].env
    expect(environment).not.toHaveProperty("ELECTRON_RUN_AS_NODE")

    ptys[0]?.emitData("ready")
    ptys[0]?.emitExit(0)
    expect(onData).toHaveBeenCalledWith(session.id, "ready")
    expect(onExit).toHaveBeenCalledWith({
      sessionId: session.id,
      exitCode: 0,
      signal: undefined,
    })
  })

  it("keeps input, resize, and termination scoped to the owning window", () => {
    const { manager, ptys } = setup()
    const session = manager.start({
      ownerId: 4,
      cwd: "/spaces/one",
      cols: 80,
      rows: 24,
      onData: vi.fn(),
      onExit: vi.fn(),
    })

    manager.write(4, session.id, "pwd\r")
    manager.resize(4, session.id, 120, 40)
    expect(ptys[0]?.write).toHaveBeenCalledWith("pwd\r")
    expect(ptys[0]?.resize).toHaveBeenCalledWith(120, 40)
    expect(() => manager.write(5, session.id, "whoami\r")).toThrow(
      "Terminal session is unavailable"
    )

    manager.closeSession(4, session.id)
    expect(ptys[0]?.kill).toHaveBeenCalledOnce()
  })

  it("preserves an inherited locale", () => {
    const { manager, spawn } = setup()
    manager.start({
      ownerId: 8,
      cwd: "/spaces/notes",
      cols: 80,
      rows: 24,
      environment: {
        SHELL: "/bin/zsh",
        LANG: "zh_CN.UTF-8",
      },
      platform: "darwin",
      onData: vi.fn(),
      onExit: vi.fn(),
    })

    expect(spawn.mock.calls[0]?.[2].env).toEqual(
      expect.objectContaining({ LANG: "zh_CN.UTF-8" })
    )
  })

  it("starts a configured PowerShell profile on Windows", () => {
    const { manager, spawn } = setup()
    manager.start({
      ownerId: 9,
      cwd: "C:\\spaces\\notes",
      cols: 80,
      rows: 24,
      environment: {
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
      },
      platform: "win32",
      shellExecutable: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      onData: vi.fn(),
      onExit: vi.fn(),
    })

    expect(spawn).toHaveBeenCalledWith(
      "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
      ["-NoLogo"],
      expect.objectContaining({ cwd: "C:\\spaces\\notes" })
    )
  })

  it("keeps multiple sessions per owner and rejects unsafe dimensions", () => {
    const { manager, ptys } = setup()
    const options = {
      ownerId: 2,
      cwd: "/spaces/two",
      cols: 80,
      rows: 24,
      onData: vi.fn(),
      onExit: vi.fn(),
    }
    const first = manager.start(options)
    const second = manager.start(options)
    expect(ptys[0]?.kill).not.toHaveBeenCalled()
    manager.write(2, first.id, "first")
    manager.write(2, second.id, "second")
    expect(ptys[0]?.write).toHaveBeenCalledWith("first")
    expect(ptys[1]?.write).toHaveBeenCalledWith("second")

    manager.closeOwner(2)
    expect(ptys[0]?.kill).toHaveBeenCalledOnce()
    expect(ptys[1]?.kill).toHaveBeenCalledOnce()

    expect(() => manager.start({ ...options, cols: 0 })).toThrow(
      "Invalid terminal columns"
    )
    expect(() => manager.resize(2, "missing", 80, 24)).toThrow(
      "Terminal session is unavailable"
    )
  })

  it("bounds the number of sessions owned by one window", () => {
    const { manager, ptys } = setup()
    const options = {
      ownerId: 12,
      cwd: "/spaces/bounded",
      cols: 80,
      rows: 24,
      onData: vi.fn(),
      onExit: vi.fn(),
    }
    for (
      let index = 0;
      index < EIDOS_LITE_TERMINAL_SESSIONS_PER_WINDOW_MAX;
      index += 1
    ) {
      manager.start(options)
    }

    expect(ptys).toHaveLength(EIDOS_LITE_TERMINAL_SESSIONS_PER_WINDOW_MAX)
    expect(() => manager.start(options)).toThrow("Too many terminal sessions")
    expect(() => manager.start({ ...options, ownerId: 13 })).not.toThrow()
  })
})
