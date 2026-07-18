import type { Metadata } from "next"

import { DocPage } from "../components/doc-page"

export const metadata: Metadata = { title: "API / Contracts" }

const sessionStates = [
  ["idle", "No handle has been opened."],
  ["opening", "Adapter read and runtime validation are in progress."],
  ["ready", "Working copy matches the adapter revision."],
  ["dirty", "Data changed in the working copy."],
  ["saving", "Export, integrity check, and adapter write are running."],
  ["conflict", "The adapter revision changed; dirty bytes remain available."],
  [
    "error",
    "Open or save failed; the error and working copy remain inspectable.",
  ],
  ["closed", "Runtime and handle cleanup completed."],
] as const

export default function ApiContracts() {
  return (
    <DocPage
      index="04 / API"
      title="Small interfaces, explicit ownership."
      lead="The public surface separates file authority, runtime execution, async data operations, React rendering, and trusted host capabilities."
    >
      <section>
        <h2>Dependency graph</h2>
        <pre
          className="dependency-graph"
          aria-label="Package dependency graph"
        >{`your React app
  ├─ @eidos.space/eidos-file-ui@0.1.0
  │    └─ @eidos.space/eidos-file@^0.1.0
  └─ @eidos.space/eidos-file@0.1.0
       ├─ browser → @sqlite.org/sqlite-wasm
       └─ better-sqlite3 → optional peer`}</pre>
      </section>

      <section>
        <h2>Headless contracts</h2>
        <div className="contract-list expanded">
          <div>
            <code>EidosFileDescriptor</code>
            <span>
              Opaque identity, name, format, size, revision, and metadata
            </span>
          </div>
          <div>
            <code>EidosFileHandle</code>
            <span>Read, permission, optional verified write, and cleanup</span>
          </div>
          <div>
            <code>EidosFileRuntimeAdapter</code>
            <span>Turns read bytes into a document and async data source</span>
          </div>
          <div>
            <code>EidosFileDataSource</code>
            <span>Snapshot, page, mutation, schema, and view operations</span>
          </div>
          <div>
            <code>EidosFileRecoveryStore</code>
            <span>Host-selected checkpoint persistence</span>
          </div>
          <div>
            <code>EidosFileHandlerRegistry</code>
            <span>
              Matches format candidates; never installs executable extensions
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2>Session lifecycle</h2>
        <ol className="state-list">
          {sessionStates.map(([state, meaning]) => (
            <li key={state}>
              <code>{state}</code>
              <span>{meaning}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>First-release boundary</h2>
        <p>
          Included: `.eidos` format/runtime, browser and optional Node adapters,
          file session state, recovery contract, React provider, view host,
          Grid, trusted custom renderers, scoped light/dark styles, and typed
          data access.
        </p>
        <p>
          Excluded: the complete Eidos application, remote sync, sandboxed
          extension installation, arbitrary binary/Markdown handlers, Desktop
          IPC, global app routes or stores, and an automatic conflict-merging
          policy.
        </p>
      </section>
    </DocPage>
  )
}
