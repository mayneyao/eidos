import { describe, expect, it, vi } from "vitest"
import type { IDisposable, IPty } from "node-pty"

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

  it("replaces an existing owner session and rejects unsafe dimensions", () => {
    const { manager, ptys } = setup()
    const options = {
      ownerId: 2,
      cwd: "/spaces/two",
      cols: 80,
      rows: 24,
      onData: vi.fn(),
      onExit: vi.fn(),
    }
    manager.start(options)
    manager.start(options)
    expect(ptys[0]?.kill).toHaveBeenCalledOnce()

    expect(() => manager.start({ ...options, cols: 0 })).toThrow(
      "Invalid terminal columns"
    )
    expect(() => manager.resize(2, "missing", 80, 24)).toThrow(
      "Terminal session is unavailable"
    )
  })
})
