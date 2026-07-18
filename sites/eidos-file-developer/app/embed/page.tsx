import type { Metadata } from "next"

import { CodeBlock } from "../components/code-block"
import { DocPage } from "../components/doc-page"
import { embedCode } from "../site-config"

export const metadata: Metadata = { title: "Embed" }

const conflictCode = `try {
  await session.save()
} catch (error) {
  if (error instanceof EidosFileHostError && error.code === "conflict") {
    // Let the person choose: reload, overwrite, restore, or Save As.
    showConflictActions(error.conflict)
  }
}`

export default function Embed() {
  return (
    <DocPage
      index="03 / Embed"
      title="Your application remains the file host."
      lead="Eidos File supplies adapters and lifecycle state; it does not choose permissions, silently overwrite external changes, or upload a file."
    >
      <section>
        <h2>Open, render, save</h2>
        <CodeBlock code={embedCode} label="host-lifecycle.tsx" />
      </section>

      <section>
        <h2>Browser authority and fallback</h2>
        <div
          className="comparison-table"
          role="table"
          aria-label="Browser file support"
        >
          <div role="row">
            <strong role="columnheader">Host</strong>
            <strong role="columnheader">Open</strong>
            <strong role="columnheader">Write</strong>
          </div>
          <div role="row">
            <span>Chromium + permission</span>
            <span>Native picker</span>
            <span>Compare-and-swap to original</span>
          </div>
          <div role="row">
            <span>Imported browser file</span>
            <span>File input / File</span>
            <span>Save As or download copy</span>
          </div>
          <div role="row">
            <span>Node / Electron</span>
            <span>Host path adapter</span>
            <span>Native integration owned by host</span>
          </div>
        </div>
        <p>
          Imported bytes remain in browser memory. Persistent handles are
          requested only after a user gesture; a view itself cannot request that
          permission.
        </p>
      </section>

      <section>
        <h2>Conflict is a first-class state</h2>
        <p>
          Every writable adapter supplies an opaque revision. Save performs a
          compare-and-swap against the revision observed at open time. The
          session retains the dirty working copy when a write fails or
          conflicts.
        </p>
        <CodeBlock code={conflictCode} label="conflict-ui.ts" />
      </section>
    </DocPage>
  )
}
