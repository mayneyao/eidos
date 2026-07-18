import type { Metadata } from "next"
import Link from "next/link"

import { CodeBlock } from "./components/code-block"
import { Playground } from "./components/playground"
import { SiteShell } from "./components/site-shell"
import { RELEASE_VERSION, installCommand, minimalHostCode } from "./site-config"

export const metadata: Metadata = {
  title: "Eidos File Developer Platform",
  description:
    "Install a local-first file runtime, render a built-in view, then register your own typed React view.",
}

export default function Home() {
  return (
    <SiteShell>
      <section className="hero">
        <div className="hero-copy">
          <div className="release-line">
            <span>Developer platform</span>
            <span>npm · {RELEASE_VERSION}</span>
            <span>browser + Node</span>
          </div>
          <h1>
            A local file,
            <br />a typed data source,
            <br />
            <em>your view.</em>
          </h1>
          <p>
            Eidos File turns portable SQLite files into a host-neutral data
            contract. Build a Grid, Timeline, or Preview—or embed the existing
            React view host in your own application.
          </p>
          <div className="hero-actions">
            <Link className="text-action primary" href="/quickstart">
              Start with npm <span aria-hidden="true">→</span>
            </Link>
            <Link className="text-action" href="/playground">
              Open the live file <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>

        <div className="minute-model" aria-label="One minute mental model">
          <span className="section-index">00 / One minute model</span>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Install</strong>
                <code>@eidos.space/eidos-file</code>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Open through an adapter</strong>
                <code>session.open(handle)</code>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Render or register a view</strong>
                <code>{"<EidosFileViewHost renderers={…} />"}</code>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section className="install-strip" aria-label="Install Eidos File">
        <span>$</span>
        <code>{installCommand}</code>
        <CodeBlock
          code={installCommand}
          language="shell"
          label="Copy install"
        />
      </section>

      <section className="home-playground">
        <div className="section-heading">
          <span className="section-index">01 / Real file, real runtime</span>
          <div>
            <h2>The documentation is the consumer.</h2>
            <p>
              This playground opens a 2,500-row `.eidos` file with SQLite WASM,
              switches between the built-in Grid and a host-registered Timeline,
              and exercises save, failure, conflict, and recovery states.
            </p>
          </div>
        </div>
        <Playground compact />
      </section>

      <section className="journeys">
        <div className="journey">
          <span className="section-index">02 / Build a View</span>
          <h2>Receive data and context, never private app state.</h2>
          <p>
            A renderer gets the selected table and view descriptor, normalized
            query, paged async data source, selection, commands, local state,
            and explicit host capabilities.
          </p>
          <Link href="/build-a-view">Read the view contract →</Link>
        </div>
        <div className="journey">
          <span className="section-index">03 / Embed</span>
          <h2>Keep file authority in your application.</h2>
          <p>
            The host chooses browser or native adapters, permissions, recovery,
            conflict UI, trusted React views, and when bytes may be written.
          </p>
          <Link href="/embed">Follow the host lifecycle →</Link>
        </div>
      </section>

      <section className="home-code">
        <div>
          <span className="section-index">04 / Minimal host</span>
          <h2>Two packages. One explicit boundary.</h2>
          <p>
            The headless package owns format, runtime, adapters, session state,
            and the async data source. The UI package owns React context, view
            routing, built-ins, and scoped styles.
          </p>
        </div>
        <CodeBlock code={minimalHostCode} label="FileEditor.tsx" />
      </section>
    </SiteShell>
  )
}
