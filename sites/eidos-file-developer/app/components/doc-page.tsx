import type { ReactNode } from "react"

import { SiteShell } from "./site-shell"

export function DocPage({
  index,
  title,
  lead,
  children,
}: {
  index: string
  title: string
  lead: string
  children: ReactNode
}) {
  return (
    <SiteShell>
      <article className="doc-layout">
        <header className="doc-intro">
          <span className="section-index">{index}</span>
          <h1>{title}</h1>
          <p>{lead}</p>
        </header>
        <div className="doc-body">{children}</div>
      </article>
    </SiteShell>
  )
}
