import { useCallback, useEffect, useRef, useState } from "react"
import {
  Eraser,
  PanelBottom,
  PanelRight,
  Plus,
  RefreshCw,
  SquareTerminal,
  X,
} from "lucide-react"
import { FitAddon } from "@xterm/addon-fit"
import { WebLinksAddon } from "@xterm/addon-web-links"
import { Terminal, type ITheme } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"

import { EIDOS_LITE_TERMINAL_SESSIONS_PER_WINDOW_MAX } from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"
import { hasSpacePathDragData, spacePathDragData } from "./space-path-drag"

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
    // xterm applies 30% opacity to opaque selection colors. Keeping this
    // opaque also avoids its parser falling back to white for modern CSS colors.
    selectionBackground: color("--lite-accent", "#4ec9b0"),
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

interface TerminalTab {
  id: number
  number: number
}

function availableTerminalTabNumber(tabs: TerminalTab[]): number {
  const usedNumbers = new Set(tabs.map((tab) => tab.number))
  for (let number = 1; number <= tabs.length + 1; number += 1) {
    if (!usedNumbers.has(number)) return number
  }
  return tabs.length + 1
}

interface TerminalTabState {
  status: TerminalStatus
  shell: string
  issue: string
}

interface TerminalTabController {
  clear(): void
  restart(): void
  writePath(relativePath: string): void
}

interface TerminalSessionDeliveryTarget {
  exit(): void
  write(data: string): void
}

interface PendingTerminalSessionDelivery {
  exited: boolean
  output: string
}

interface TerminalSessionViewportProps {
  active: boolean
  open: boolean
  placement: "bottom" | "right"
  tab: TerminalTab
  theme: "light" | "dark"
  onControllerChange(
    tabId: number,
    controller: TerminalTabController | null
  ): void
  onSessionClosed(sessionId: string): void
  onSessionOpened(
    sessionId: string,
    target: TerminalSessionDeliveryTarget
  ): PendingTerminalSessionDelivery
  onStateChange(tabId: number, state: TerminalTabState): void
}

const INITIAL_TERMINAL_TAB_STATE: TerminalTabState = {
  status: "starting",
  shell: "",
  issue: "",
}

function TerminalSessionViewport({
  active,
  open,
  placement,
  tab,
  theme,
  onControllerChange,
  onSessionClosed,
  onSessionOpened,
  onStateChange,
}: TerminalSessionViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const generationRef = useRef(0)
  const dimensionsRef = useRef({ cols: 80, rows: 24 })
  const activeRef = useRef(active)
  activeRef.current = active

  const reportState = useCallback(
    (state: TerminalTabState) => onStateChange(tab.id, state),
    [onStateChange, tab.id]
  )

  const beginSession = useCallback(
    async (terminal: Terminal) => {
      const generation = generationRef.current + 1
      generationRef.current = generation
      const previousSession = sessionIdRef.current
      sessionIdRef.current = null
      if (previousSession) {
        onSessionClosed(previousSession)
        void window.eidosLite.closeTerminal(previousSession).catch(() => {})
      }
      reportState(INITIAL_TERMINAL_TAB_STATE)
      try {
        const { cols, rows } = dimensionsRef.current
        const session = await window.eidosLite.startTerminal(cols, rows)
        if (
          terminalRef.current !== terminal ||
          generationRef.current !== generation
        ) {
          onSessionClosed(session.id)
          void window.eidosLite.closeTerminal(session.id).catch(() => {})
          return
        }
        sessionIdRef.current = session.id
        const pending = onSessionOpened(session.id, {
          exit: () => {
            if (sessionIdRef.current !== session.id) return
            sessionIdRef.current = null
            reportState({ status: "exited", shell: session.shell, issue: "" })
          },
          write: (data) => {
            if (
              sessionIdRef.current === session.id &&
              terminalRef.current === terminal
            ) {
              terminal.write(data)
            }
          },
        })
        if (pending.output) terminal.write(pending.output)
        if (pending.exited) {
          sessionIdRef.current = null
          onSessionClosed(session.id)
          reportState({ status: "exited", shell: session.shell, issue: "" })
        } else {
          reportState({ status: "running", shell: session.shell, issue: "" })
          if (activeRef.current) terminal.focus()
        }
      } catch (error) {
        if (
          terminalRef.current !== terminal ||
          generationRef.current !== generation
        ) {
          return
        }
        reportState({
          status: "error",
          shell: "",
          issue: error instanceof Error ? error.message : String(error),
        })
      }
    },
    [onSessionClosed, onSessionOpened, reportState]
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    const mount = document.createElement("div")
    mount.className = "terminal-emulator"
    mount.setAttribute("role", "textbox")
    mount.setAttribute("aria-labelledby", `eidos-terminal-tab-${tab.id}`)
    mount.setAttribute("aria-multiline", "true")
    host.appendChild(mount)
    reportState(INITIAL_TERMINAL_TAB_STATE)

    const fontFamily =
      window.getComputedStyle(mount).getPropertyValue("--font-code").trim() ||
      '"SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", monospace'
    const openTerminalUrl = (uri: string) => {
      void window.eidosLite.openExternalUrl(uri).catch(() => {})
    }
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
          openTerminalUrl(uri)
        },
      },
    })
    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      openTerminalUrl(uri)
    })
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.open(mount)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown" || event.altKey) return true
      const copyRequested =
        event.key.toLowerCase() === "c" && (event.metaKey || event.ctrlKey)
      if (!copyRequested) return true
      if (!terminal.hasSelection()) {
        return event.ctrlKey && !event.metaKey && !event.shiftKey
      }
      const selection = terminal.getSelection()
      if (!selection) return true
      void window.eidosLite.writeClipboardText(selection).catch(() => {})
      return false
    })

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
      if (!cancelled && activeRef.current && terminalRef.current === terminal) {
        fitAddon.fit()
      }
    })
    resizeObserver.observe(host)

    const controller: TerminalTabController = {
      clear: () => terminal.clear(),
      restart: () => {
        terminal.reset()
        void beginSession(terminal)
      },
      writePath: (relativePath) => {
        const sessionId = sessionIdRef.current
        if (!sessionId) return
        void window.eidosLite
          .writeTerminalPath(sessionId, relativePath)
          .catch(() => {})
        terminal.focus()
      },
    }
    onControllerChange(tab.id, controller)

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
      onControllerChange(tab.id, null)
      terminal.dispose()
      mount.remove()
      if (terminalRef.current === terminal) {
        terminalRef.current = null
        fitAddonRef.current = null
        generationRef.current += 1
        const sessionId = sessionIdRef.current
        sessionIdRef.current = null
        if (sessionId) {
          onSessionClosed(sessionId)
          void window.eidosLite.closeTerminal(sessionId).catch(() => {})
        }
      }
    }
  }, [beginSession, onControllerChange, onSessionClosed, reportState, tab.id])

  useEffect(() => {
    const terminal = terminalRef.current
    const mount =
      hostRef.current?.querySelector<HTMLElement>(".terminal-emulator")
    if (!terminal || !mount) return
    terminal.options.theme = terminalTheme(mount, theme)
  }, [theme])

  useEffect(() => {
    if (!active || !open) return
    const frame = window.requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      terminalRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [active, open, placement])

  return (
    <div
      ref={hostRef}
      id={`eidos-terminal-panel-${tab.id}`}
      className="terminal-session-viewport"
      data-active={active ? "true" : "false"}
      role="tabpanel"
      aria-labelledby={`eidos-terminal-tab-${tab.id}`}
      hidden={!active}
    />
  )
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
  const [tabs, setTabs] = useState<TerminalTab[]>([{ id: 1, number: 1 }])
  const [activeTabId, setActiveTabId] = useState<number | null>(1)
  const [tabStates, setTabStates] = useState(
    () => new Map<number, TerminalTabState>([[1, INITIAL_TERMINAL_TAB_STATE]])
  )
  const nextTabIdRef = useRef(2)
  const previousOpenRef = useRef(open)
  const controllersRef = useRef(new Map<number, TerminalTabController>())
  const deliveriesRef = useRef(new Map<string, TerminalSessionDeliveryTarget>())
  const pendingOutputRef = useRef(new Map<string, string>())
  const pendingExitRef = useRef(new Set<string>())

  useEffect(() => {
    const unsubscribeData = window.eidosLite.onTerminalData(
      (sessionId, data) => {
        const delivery = deliveriesRef.current.get(sessionId)
        if (delivery) {
          delivery.write(data)
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
      const delivery = deliveriesRef.current.get(exit.sessionId)
      if (delivery) {
        deliveriesRef.current.delete(exit.sessionId)
        delivery.exit()
        return
      }
      pendingExitRef.current.add(exit.sessionId)
    })
    return () => {
      unsubscribeData()
      unsubscribeExit()
      deliveriesRef.current.clear()
      pendingOutputRef.current.clear()
      pendingExitRef.current.clear()
    }
  }, [])

  const handleControllerChange = useCallback(
    (tabId: number, controller: TerminalTabController | null) => {
      if (controller) controllersRef.current.set(tabId, controller)
      else controllersRef.current.delete(tabId)
    },
    []
  )

  const handleSessionOpened = useCallback(
    (
      sessionId: string,
      target: TerminalSessionDeliveryTarget
    ): PendingTerminalSessionDelivery => {
      const output = pendingOutputRef.current.get(sessionId) ?? ""
      pendingOutputRef.current.delete(sessionId)
      const exited = pendingExitRef.current.delete(sessionId)
      if (!exited) deliveriesRef.current.set(sessionId, target)
      return { exited, output }
    },
    []
  )

  const handleSessionClosed = useCallback((sessionId: string) => {
    deliveriesRef.current.delete(sessionId)
    pendingOutputRef.current.delete(sessionId)
    pendingExitRef.current.delete(sessionId)
  }, [])

  const handleTabStateChange = useCallback(
    (tabId: number, state: TerminalTabState) => {
      setTabStates((current) => {
        const previous = current.get(tabId)
        if (
          previous?.status === state.status &&
          previous.shell === state.shell &&
          previous.issue === state.issue
        ) {
          return current
        }
        const next = new Map(current)
        next.set(tabId, state)
        return next
      })
    },
    []
  )

  const addTerminalTab = useCallback(() => {
    if (tabs.length >= EIDOS_LITE_TERMINAL_SESSIONS_PER_WINDOW_MAX) return
    const tab = {
      id: nextTabIdRef.current,
      number: availableTerminalTabNumber(tabs),
    }
    nextTabIdRef.current += 1
    setTabs((current) => [...current, tab])
    setTabStates((current) =>
      new Map(current).set(tab.id, INITIAL_TERMINAL_TAB_STATE)
    )
    setActiveTabId(tab.id)
  }, [tabs.length])

  useEffect(() => {
    const wasOpen = previousOpenRef.current
    previousOpenRef.current = open
    if (open && !wasOpen && tabs.length === 0) addTerminalTab()
  }, [addTerminalTab, open, tabs.length])

  const closeTerminalTab = (tabId: number) => {
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId)
    if (closingIndex < 0) return
    const remaining = tabs.filter((tab) => tab.id !== tabId)
    setTabs(remaining)
    setTabStates((current) => {
      const next = new Map(current)
      next.delete(tabId)
      return next
    })
    if (activeTabId === tabId) {
      const nextActive =
        remaining[Math.min(closingIndex, remaining.length - 1)] ?? null
      setActiveTabId(nextActive?.id ?? null)
    }
    if (remaining.length === 0) onClose()
  }

  const activeState =
    (activeTabId === null ? undefined : tabStates.get(activeTabId)) ??
    INITIAL_TERMINAL_TAB_STATE
  const { status, shell, issue } = activeState

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
        <div className="terminal-panel-tab-strip">
          <div
            className="terminal-panel-tabs"
            role="tablist"
            aria-label={t("Terminal")}
          >
            {tabs.map((tab) => {
              const active = tab.id === activeTabId
              const label = t("Terminal {number}", { number: tab.number })
              return (
                <div
                  key={tab.id}
                  className="terminal-panel-tab"
                  data-active={active ? "true" : "false"}
                >
                  <button
                    id={`eidos-terminal-tab-${tab.id}`}
                    type="button"
                    className="terminal-panel-tab-select"
                    role="tab"
                    aria-controls={`eidos-terminal-panel-${tab.id}`}
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    <SquareTerminal aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                  <button
                    type="button"
                    className="terminal-panel-tab-close"
                    onClick={() => closeTerminalTab(tab.id)}
                    aria-label={`${t("Close terminal tab")}: ${label}`}
                    title={t("Close terminal tab")}
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </div>
          <button
            type="button"
            className="terminal-panel-tab-add"
            onClick={addTerminalTab}
            disabled={
              tabs.length >= EIDOS_LITE_TERMINAL_SESSIONS_PER_WINDOW_MAX
            }
            aria-label={t("New terminal")}
            title={t("New terminal")}
          >
            <Plus />
          </button>
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
              onClick={() =>
                activeTabId === null
                  ? undefined
                  : controllersRef.current.get(activeTabId)?.restart()
              }
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
            onClick={() =>
              activeTabId === null
                ? undefined
                : controllersRef.current.get(activeTabId)?.clear()
            }
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
        className="terminal-viewport"
        data-space-name={spaceName}
        onDragOverCapture={(event) => {
          if (
            activeTabId === null ||
            !hasSpacePathDragData(event.dataTransfer)
          ) {
            return
          }
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = "copy"
        }}
        onDropCapture={(event) => {
          const relativePath = spacePathDragData(event.dataTransfer)
          if (activeTabId === null || !relativePath) return
          event.preventDefault()
          event.stopPropagation()
          controllersRef.current.get(activeTabId)?.writePath(relativePath)
        }}
      >
        {tabs.map((tab) => (
          <TerminalSessionViewport
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            open={open}
            placement={placement}
            theme={theme}
            onControllerChange={handleControllerChange}
            onSessionClosed={handleSessionClosed}
            onSessionOpened={handleSessionOpened}
            onStateChange={handleTabStateChange}
          />
        ))}
      </div>
    </section>
  )
}
