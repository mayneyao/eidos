import type { Metadata } from "next"

import { CodeBlock } from "../components/code-block"
import { DocPage } from "../components/doc-page"
import { installCommand, minimalHostCode, viewCode } from "../site-config"

export const metadata: Metadata = { title: "Quickstart" }

export default function Quickstart() {
  return (
    <DocPage
      index="01 / Quickstart"
      title="From an empty Vite app to a custom view."
      lead="Install exact public versions, create one host-owned session, open a file through an adapter, and register trusted React code."
    >
      <section>
        <h2>1. Install the runtime and React host</h2>
        <p>
          The UI package expects React, Glide Data Grid, and Marked from your
          application. Import its compiled stylesheet once; no Tailwind setup is
          required.
        </p>
        <CodeBlock code={installCommand} language="shell" label="Terminal" />
      </section>

      <section>
        <h2>2. Create the host boundary</h2>
        <p>
          Your application owns the session and its cleanup. The browser runtime
          keeps SQLite in the current JavaScript realm; long-running hosts may
          put the same adapter contract behind a Worker.
        </p>
        <CodeBlock code={minimalHostCode} label="FileEditor.tsx" />
      </section>

      <section>
        <h2>3. Add a typed renderer</h2>
        <p>
          View type keys are persisted in the file. If a host does not register
          a matching renderer, Eidos File keeps the descriptor intact and shows
          an unsupported-view state.
        </p>
        <CodeBlock code={viewCode} label="timeline-view.tsx" />
      </section>

      <aside className="note-block">
        <strong>Browser bundling</strong>
        <p>
          SQLite WASM uses WebAssembly and top-level await. Vite hosts need
          <code> vite-plugin-wasm </code> and
          <code> vite-plugin-top-level-await</code>, and should exclude
          <code> @sqlite.org/sqlite-wasm </code> from dependency optimization.
        </p>
      </aside>
    </DocPage>
  )
}
