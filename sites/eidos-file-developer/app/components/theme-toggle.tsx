"use client"

import { useEffect } from "react"

export function ThemeToggle() {
  useEffect(() => {
    const stored = window.localStorage.getItem("eidos-file-theme")
    const initial =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
    document.documentElement.dataset.theme = initial
  }, [])

  function toggle() {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark"
    document.documentElement.dataset.theme = next
    window.localStorage.setItem("eidos-file-theme", next)
  }

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark theme"
    >
      <span aria-hidden="true">◐</span>
      <span>Theme</span>
    </button>
  )
}
