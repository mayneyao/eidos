import { useEffect, useMemo, useState } from "react"
import { EidosFileSession } from "@eidos.space/eidos-file"
import {
  downloadEidosFile,
  EidosFileBrowserRuntime,
  IndexedDbEidosFileRecoveryStore,
  openBrowserEidosFile,
  pickBrowserEidosFile,
  pickBrowserEidosFileDestination,
} from "@eidos.space/eidos-file/browser"
import {
  EidosFileProvider,
  EidosFileViewHost,
  useEidosFile,
} from "@eidos.space/eidos-file-ui"

import { timelineView } from "./timeline-view"

function Workspace() {
  const { session, state, snapshot } = useEidosFile()
  const [viewId, setViewId] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const table = snapshot?.tables[0]

  useEffect(() => {
    if (!table || table.views.some((view) => view.type === "timeline")) return
    void session
      .getState()
      .source?.createView(table.table.id, {
        name: timelineView.create.defaultName,
        type: timelineView.type,
        properties: timelineView.create.properties?.(),
      })
      .then((next) => session.markDirty(next))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause))
      )
  }, [session, table])

  async function save() {
    setError(null)
    try {
      if (state.capabilities?.write) {
        await session.save()
        return
      }
      const destination = await pickBrowserEidosFileDestination(
        state.descriptor?.name ?? "project-tracker.eidos"
      )
      if (destination) {
        await session.saveAs(destination)
        return
      }
      const recovery = await session.checkpoint()
      if (recovery) downloadEidosFile(recovery.bytes, recovery.descriptor.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <main>
      <header className="workbar">
        <div>
          <span className="eyebrow">External npm consumer</span>
          <h1>{snapshot?.metadata.title ?? "Opening Eidos File…"}</h1>
        </div>
        <div className="workbar-actions">
          <span className="phase" data-phase={state.phase}>
            {state.phase}
          </span>
          <button
            type="button"
            disabled={!state.dirty}
            onClick={() => void save()}
          >
            {state.capabilities?.write ? "Save" : "Save a copy"}
          </button>
        </div>
      </header>

      <nav className="view-tabs" aria-label="Views">
        {table?.views.map((view) => (
          <button
            key={view.id}
            type="button"
            aria-pressed={viewId === view.id}
            onClick={() => setViewId(view.id)}
          >
            {view.name}
          </button>
        ))}
      </nav>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="view-surface">
        <EidosFileViewHost
          viewId={viewId}
          renderers={{ timeline: timelineView.renderer }}
          onError={(cause) =>
            setError(cause instanceof Error ? cause.message : String(cause))
          }
        />
      </div>
    </main>
  )
}

export function App() {
  const session = useMemo(
    () =>
      new EidosFileSession(
        new EidosFileBrowserRuntime(),
        new IndexedDbEidosFileRecoveryStore()
      ),
    []
  )

  useEffect(() => {
    let active = true
    async function openSample() {
      const response = await fetch("/project-tracker.eidos")
      const blob = await response.blob()
      const handle = await openBrowserEidosFile(
        new File([blob], "project-tracker.eidos", { type: blob.type })
      )
      if (active) await session.open(handle)
    }
    void openSample()
    return () => {
      active = false
      void session.close()
    }
  }, [session])

  async function openLocalFile() {
    const handle = await pickBrowserEidosFile()
    if (handle) await session.open(handle)
  }

  return (
    <div className="app-shell">
      <aside>
        <span className="package-version">Eidos File 0.1.0</span>
        <p>
          This app imports only the public registry packages. The sample stays
          in your browser.
        </p>
        <button type="button" onClick={() => void openLocalFile()}>
          Open local .eidos
        </button>
      </aside>
      <EidosFileProvider session={session} themeName="light">
        <Workspace />
      </EidosFileProvider>
    </div>
  )
}
