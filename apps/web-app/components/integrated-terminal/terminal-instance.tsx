"use client"

import { useEffect, useRef, useCallback } from "react"
import { Terminal } from "xterm"
import { FitAddon } from "xterm-addon-fit"
import { WebLinksAddon } from "xterm-addon-web-links"
import "xterm/css/xterm.css"

export interface TerminalInstanceProps {
  sessionId: string
  isActive: boolean
  onData?: (sessionId: string, data: string) => void
  onExit?: (sessionId: string, exitCode: number) => void
  onTitleChange?: (sessionId: string, title: string) => void
}

// Convert HSL to Hex
function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) =>
    Math.round(
      255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))
    )
  return `#${f(0).toString(16).padStart(2, "0")}${f(8).toString(16).padStart(2, "0")}${f(4).toString(16).padStart(2, "0")}`
}

// Get CSS variable value and convert to hex
function getCssVarAsHex(varName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim()
  if (!value) return fallback

  // Check if it's HSL format (e.g., "222.2 84% 4.9%")
  const hslMatch = value.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/)
  if (hslMatch) {
    const [, h, s, l] = hslMatch
    return hslToHex(parseFloat(h), parseFloat(s), parseFloat(l))
  }

  // Check if it's already hex
  if (value.startsWith("#")) return value

  return fallback
}

// Get theme colors from CSS variables
function getTerminalTheme() {
  const isDark = document.documentElement.classList.contains("dark")

  // Get colors from CSS variables
  const background = getCssVarAsHex(
    "--background",
    isDark ? "#0a0a0a" : "#ffffff"
  )
  const foreground = getCssVarAsHex(
    "--foreground",
    isDark ? "#fafafa" : "#09090b"
  )
  const muted = getCssVarAsHex(
    "--muted-foreground",
    isDark ? "#a1a1aa" : "#71717a"
  )
  const primary = getCssVarAsHex("--primary", isDark ? "#3b82f6" : "#2563eb")
  const destructive = getCssVarAsHex(
    "--destructive",
    isDark ? "#ef4444" : "#dc2626"
  )
  const accent = getCssVarAsHex("--accent", isDark ? "#22c55e" : "#16a34a")
  const secondary = getCssVarAsHex(
    "--secondary",
    isDark ? "#71717a" : "#f4f4f5"
  )
  const border = getCssVarAsHex("--border", isDark ? "#27272a" : "#e4e4e7")

  // Generate ANSI colors based on theme
  const ansiColors = {
    black: isDark ? "#18181b" : "#e4e4e7",
    red: destructive,
    green: accent,
    yellow: isDark ? "#f59e0b" : "#d97706",
    blue: primary,
    magenta: isDark ? "#a855f7" : "#9333ea",
    cyan: isDark ? "#06b6d4" : "#0891b2",
    white: foreground,
    brightBlack: muted,
    brightRed: destructive,
    brightGreen: accent,
    brightYellow: isDark ? "#fbbf24" : "#f59e0b",
    brightBlue: primary,
    brightMagenta: isDark ? "#c084fc" : "#a855f7",
    brightCyan: isDark ? "#22d3ee" : "#06b6d4",
    brightWhite: isDark ? "#ffffff" : "#09090b",
  }

  return {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: isDark ? "#3f3f46" : "#d4d4d8",
    selectionForeground: foreground,
    ...ansiColors,
  }
}

export function TerminalInstance({
  sessionId,
  isActive,
  onExit,
  onTitleChange,
}: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const unmountCleanupRef = useRef<(() => void) | null>(null)
  const observerRef = useRef<MutationObserver | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return

    const theme = getTerminalTheme()

    const terminal = new Terminal({
      fontFamily:
        'Menlo, Monaco, "Courier New", monospace, "Apple Color Emoji", "Segoe UI Emoji"',
      fontSize: 13,
      theme,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10000,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)

    terminal.open(containerRef.current)
    fitAddon.fit()

    // Focus the terminal immediately after opening
    terminal.focus()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Handle input from user
    const disposable = terminal.onData((data) => {
      window.eidos?.terminal?.write(sessionId, data)
    })

    // Handle title changes
    const titleDisposable = terminal.onTitleChange((title) => {
      onTitleChange?.(sessionId, title)
    })

    // Watch for theme changes
    observerRef.current = new MutationObserver(() => {
      if (terminalRef.current) {
        const newTheme = getTerminalTheme()
        terminalRef.current.options.theme = newTheme
      }
    })

    observerRef.current.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    // Setup ResizeObserver to handle container size changes
    resizeObserverRef.current = new ResizeObserver(() => {
      if (terminalRef.current && fitAddonRef.current) {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims) {
          window.eidos?.terminal?.resize(sessionId, dims.cols, dims.rows)
        }
      }
    })

    if (containerRef.current) {
      resizeObserverRef.current.observe(containerRef.current)
    }

    // Store cleanup function
    unmountCleanupRef.current = () => {
      disposable.dispose()
      titleDisposable.dispose()
      terminal.dispose()
      observerRef.current?.disconnect()
      resizeObserverRef.current?.disconnect()
    }

    // Initial resize with delay to ensure container is fully rendered
    const initialResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims) {
          window.eidos?.terminal?.resize(sessionId, dims.cols, dims.rows)
        }
      }
    }

    // Trigger resize immediately and after a short delay
    initialResize()
    const timeoutId = setTimeout(initialResize, 100)

    return () => {
      clearTimeout(timeoutId)
      unmountCleanupRef.current?.()
      unmountCleanupRef.current = null
      terminalRef.current = null
      fitAddonRef.current = null
      observerRef.current = null
      resizeObserverRef.current = null
    }
  }, [sessionId, onTitleChange])

  // Setup IPC data handler
  useEffect(() => {
    if (!terminalRef.current) return

    const removeDataListener = window.eidos?.terminal?.onData(
      (recvSessionId, data) => {
        if (recvSessionId === sessionId && terminalRef.current) {
          terminalRef.current.write(data)
        }
      }
    )

    const removeExitListener = window.eidos?.terminal?.onExit(
      (recvSessionId, exitCode) => {
        if (recvSessionId === sessionId) {
          onExit?.(sessionId, exitCode)
        }
      }
    )

    return () => {
      removeDataListener?.()
      removeExitListener?.()
    }
  }, [sessionId, onExit])

  // Handle focus when active
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus()
      // Refit when becoming active
      fitAddonRef.current?.fit()
    }
  }, [isActive])

  // Handle focus when terminal panel becomes visible
  useEffect(() => {
    const handlePanelShown = () => {
      if (isActive && terminalRef.current) {
        terminalRef.current.focus()
      }
    }

    window.addEventListener("terminal-panel-shown", handlePanelShown)
    return () => {
      window.removeEventListener("terminal-panel-shown", handlePanelShown)
    }
  }, [isActive])

  // Handle resize
  const handleResize = useCallback(() => {
    if (!fitAddonRef.current || !terminalRef.current) return

    try {
      fitAddonRef.current.fit()
      const dims = fitAddonRef.current.proposeDimensions()
      if (dims) {
        window.eidos?.terminal?.resize(sessionId, dims.cols, dims.rows)
      }
    } catch (e) {
      // Ignore resize errors during unmount
    }
  }, [sessionId])

  useEffect(() => {
    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [handleResize])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{
        visibility: isActive ? "visible" : "hidden",
        position: isActive ? "relative" : "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    />
  )
}
