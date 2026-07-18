import Link from "next/link"
import type { ReactNode } from "react"

import { RELEASE_VERSION, navigation } from "../site-config"
import { ThemeToggle } from "./theme-toggle"

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-frame">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link className="wordmark" href="/" aria-label="Eidos File home">
          <span className="wordmark-mark" aria-hidden="true">
            [e]
          </span>
          <span>Eidos File</span>
          <small>v{RELEASE_VERSION}</small>
        </Link>
        <nav className="site-nav" aria-label="Developer documentation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </header>
      <main id="main-content">{children}</main>
      <footer className="site-footer">
        <span>Eidos File {RELEASE_VERSION} · MIT</span>
        <span>Local-first. Your file never leaves the browser.</span>
      </footer>
    </div>
  )
}
