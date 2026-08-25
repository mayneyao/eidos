import { useCallback, useEffect, useRef, useState } from "react"
import {
  Eraser,
  PanelBottom,
  PanelRight,
  RefreshCw,
  SquareTerminal,
  X,
} from "lucide-react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal, type ITheme } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"

import { useEidosLiteI18n } from "./i18n"

type TerminalStatus = "starting" | "running" | "exited" | "error"

interface TerminalPanelProps {
  open: boolean
  placement: "bottom" | "right"
  placementShortcutLabel: string
  spaceName: string
  theme: "light" | "dark"
  onClose(): void
  onTogglePlacement(): void
}

const PENDING_OUTPUT_CHARACTERS_MAX = 1024 * 1024

const TERMINAL_THEME_COLORS = {
  black: ["--term-color-0", "#1e1e1e"],
  red: ["--term-color-1", "#f44747"],
  green: ["--term-color-2", "#6a9955"],
  yellow: ["--term-color-3", "#d7ba7d"],
  blue: ["--term-color-4", "#569cd6"],
  magenta: ["--term-color-5", "#c586c0"],
  cyan: ["--term-color-6", "#4ec9b0"],
  white: ["--term-color-7", "#d4d4d4"],
  brightBlack: ["--term-color-8", "#808080"],
  brightRed: ["--term-color-9", "#f44747"],
  brightGreen: ["--term-color-10", "#6a9955"],
  brightYellow: ["--term-color-11", "#d7ba7d"],
  brightBlue: ["--term-color-12", "#569cd6"],
  brightMagenta: ["--term-color-13", "#c586c0"],
  brightCyan: ["--term-color-14", "#4ec9b0"],
  brightWhite: ["--term-color-15", "#ffffff"],
} as const satisfies Record<
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "brightBlack"
  | "brightRed"
  | "brightGreen"
  | "brightYellow"
  | "brightBlue"
  | "brightMagenta"
  | "brightCyan"
  | "brightWhite",
  readonly [string, string]
>

function resolvedCssColor(
  element: HTMLElement,
  property: string,
  fallback: string,
  colorScheme: "light" | "dark"
): string {
  const probe = element.ownerDocument.createElement("span")
  probe.hidden = true
  probe.style.setProperty("color-scheme", colorScheme)
  probe.style.color = `var(${property}, ${fallback})`
  element.appendChild(probe)
  const color =
    element.ownerDocument.defaultView?.getComputedStyle(probe).color ?? ""
  probe.remove()
  return color || fallback
}

function terminalTheme(
  element: HTMLElement,
  colorScheme: "light" | "dark"
): ITheme {
  const color = (property: string, fallback: string) =>
    resolvedCssColor(element, property, fallback, colorScheme)
  const background = color("--canvas", "#1e1e1e")
  const theme: ITheme = {
    background,
    foreground: color("--ink", "#d4d4d4"),
    cursor: color("--lite-accent", "#4ec9b0"),
    cursorAccent: background,
    selectionBackground: color(
      "--terminal-selection-background",
      "rgba(78, 201, 176, 0.3)"
    ),
  }
  for (const [name, [property, fallback]] of Object.entries(
    TERMINAL_THEME_COLORS
  )) {
    theme[name as keyof typeof TERMINAL_THEME_COLORS] = color(
      property,
      fallback
    )
  }
  return theme
}

export function TerminalPanel({
  open,
  placement,
  placementShortcutLabel,
  spaceName,
  theme,
  onClose,
  onTogglePlacement,
}: TerminalPanelProps) {
  const { t } = useEidosLiteI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const pendingOutputRef = useRef(new Map<string, string>())
  const pendingExitRef = useRef(new Set<string>())
  const dimensionsRef = useRef({ cols: 80, rows: 24 })
  const [status, setStatus] = useState<TerminalStatus>("starting")
  const [shell, setShell] = useState("")
  const [issue, setIssue] = useState("")

  const beginSession = useCallback(async (terminal: Terminal) => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    const previousSession = sessionIdRef.current
    sessionIdRef.current = null
    if (previousSession) {
      void window.eidosLite.closeTerminal(previousSession).catch(() => {})
    }
    setStatus("starting")
    setIssue("")
    try {
      const { cols, rows } = dimensionsRef.current
      const session = await window.eidosLite.startTerminal(cols, rows)
      if (
        terminalRef.current !== terminal ||
        generationRef.current !== generation
      ) {
        void window.eidosLite.closeTerminal(session.id).catch(() => {})
        return
      }
      sessionIdRef.current = session.id
      setShell(session.shell)
      const pending = pendingOutputRef.current.get(session.id)
      if (pending) terminal.write(pending)
      pendingOutputRef.current.clear()
      if (pendingExitRef.current.delete(session.id)) {
        sessionIdRef.current = null
        setStatus("exited")
      } else {
        setStatus("running")
      }
      terminal.focus()
    } catch (error) {
      if (
        terminalRef.current !== terminal ||
        generationRef.current !== generation
      ) {
        return
      }
      setIssue(error instanceof Error ? error.message : String(error))
      setStatus("error")
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    const mount = document.createElement("div")
    mount.className = "terminal-emulator"
    mount.setAttribute("role", "textbox")
    mount.setAttribute("aria-labelledby", "eidos-terminal-panel-label")
    mount.setAttribute("aria-multiline", "true")
    host.appendChild(mount)
    setStatus("starting")
    setIssue("")

    const unsubscribeData = window.eidosLite.onTerminalData(
      (sessionId, data) => {
        if (sessionIdRef.current === sessionId) {
          terminalRef.current?.write(data)
          return
        }
        const next = `${pendingOutputRef.current.get(sessionId) ?? ""}${data}`
        pendingOutputRef.current.set(
          sessionId,
          next.slice(-PENDING_OUTPUT_CHARACTERS_MAX)
        )
      }
    )
    const unsubscribeExit = window.eidosLite.onTerminalExit((exit) => {
      if (sessionIdRef.current === exit.sessionId) {
        sessionIdRef.current = null
        setStatus("exited")
      } else {
        pendingExitRef.current.add(exit.sessionId)
      }
    })

    const fontFamily =
      window.getComputedStyle(mount).getPropertyValue("--font-code").trim() ||
      '"SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace'
    const terminal = new Terminal({
      cols: dimensionsRef.current.cols,
      rows: dimensionsRef.current.rows,
      cursorBlink: true,
      cursorInactiveStyle: "outline",
      customGlyphs: true,
      fontFamily,
      fontSize: 12,
      lineHeight: 1.333,
      macOptionClickForcesSelection: true,
      rightClickSelectsWord: true,
      scrollback: 5_000,
      theme: terminalTheme(mount, theme),
      linkHandler: {
        activate: (_event, uri) => {
          void window.eidosLite.openExternalUrl(uri).catch(() => {})
        },
      },
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(mount)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const dataSubscription = terminal.onData((data) => {
      const sessionId = sessionIdRef.current
      if (sessionId) window.eidosLite.writeTerminal(sessionId, data)
    })
    const resizeSubscription = terminal.onResize(({ cols, rows }) => {
      dimensionsRef.current = { cols, rows }
      const sessionId = sessionIdRef.current
      if (sessionId) {
        window.eidosLite.resizeTerminal(sessionId, cols, rows)
      }
    })
    const resizeObserver = new ResizeObserver(() => {
      if (!cancelled && terminalRef.current === terminal) fitAddon.fit()
    })
    resizeObserver.observe(host)

    const startFrame = window.requestAnimationFrame(() => {
      if (cancelled || terminalRef.current !== terminal) return
      fitAddon.fit()
      void beginSession(terminal)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(startFrame)
      resizeObserver.disconnect()
      dataSubscription.dispose()
      resizeSubscription.dispose()
      unsubscribeData()
      unsubscribeExit()
      terminal.dispose()
      mount.remove()
      if (terminalRef.current === terminal) {
        terminalRef.current = null
        fitAddonRef.current = null
        generationRef.current += 1
        const sessionId = sessionIdRef.current
        sessionIdRef.current = null
        if (sessionId) {
          void window.eidosLite.closeTerminal(sessionId).catch(() => {})
        }
        pendingOutputRef.current.clear()
        pendingExitRef.current.clear()
      }
    }
  }, [beginSession])

  useEffect(() => {
    const terminal = terminalRef.current
    const mount =
      hostRef.current?.querySelector<HTMLElement>(".terminal-emulator")
    if (!terminal || !mount) return
    terminal.options.theme = terminalTheme(mount, theme)
  }, [theme])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      terminalRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, placement])

  const statusLabel =
    status === "starting"
      ? t("Starting terminal…")
      : status === "exited"
        ? t("Terminal exited")
        : status === "error"
          ? t("Terminal could not start")
          : shell
  const placementLabel =
    placement === "bottom"
      ? t("Move terminal to right")
      : t("Move terminal to bottom")
  const placementTitle =
    placementShortcutLabel === "—"
      ? placementLabel
      : `${placementLabel} (${placementShortcutLabel})`

  return (
    <section
      className="terminal-panel"
      data-terminal-status={status}
      data-open={open ? "true" : "false"}
      aria-label={t("Terminal")}
      aria-hidden={!open}
    >
      <header className="terminal-panel-header">
        <div className="terminal-panel-tab" aria-current="page">
          <SquareTerminal aria-hidden="true" />
          <span id="eidos-terminal-panel-label">{t("Terminal")}</span>
        </div>
        <span className="terminal-panel-status" title={issue || statusLabel}>
          <span aria-hidden="true" />
          {statusLabel}
        </span>
        <div
          className="terminal-panel-actions"
          role="toolbar"
          aria-label={t("Terminal actions")}
        >
          {status === "exited" || status === "error" ? (
            <button
              type="button"
              className="icon-button"
              onClick={() => {
                const terminal = terminalRef.current
                if (!terminal) return
                terminal.reset()
                void beginSession(terminal)
              }}
              aria-label={t("Restart terminal")}
              title={t("Restart terminal")}
            >
              <RefreshCw />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            onClick={onTogglePlacement}
            aria-label={placementLabel}
            title={placementTitle}
          >
            {placement === "bottom" ? <PanelRight /> : <PanelBottom />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => terminalRef.current?.clear()}
            aria-label={t("Clear terminal")}
            title={t("Clear terminal")}
          >
            <Eraser />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close terminal")}
            title={t("Close terminal")}
          >
            <X />
          </button>
        </div>
      </header>
      <div
        ref={hostRef}
        className="terminal-viewport"
        data-space-name={spaceName}
      />
    </section>
  )
}
