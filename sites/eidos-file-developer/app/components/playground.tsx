"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  EIDOS_FILE_MIME_TYPE,
  EidosFileHostError,
  EidosFileSession,
  type EidosFileDescriptor,
  type EidosFileHandle,
  type EidosFileRecoverySnapshot,
  type EidosFileWriteOptions,
} from "@eidos.space/eidos-file"
import {
  EidosFileProvider,
  EidosFileViewHost,
  useEidosFile,
} from "@eidos.space/eidos-file-ui"
import "@eidos.space/eidos-file-ui/styles.css"

import { timelineView } from "./timeline-view"

class DemoEidosFileHandle implements EidosFileHandle {
  readonly capabilities = {
    read: true as const,
    write: true,
    saveAs: true,
    recovery: true,
    persistentFileAccess: false,
  }

  private revision = 1
  private failNext = false

  constructor(
    private bytes: Uint8Array,
    private readonly name = "project-tracker.eidos"
  ) {}

  simulateExternalChange() {
    this.revision += 1
  }

  simulateWriteFailure() {
    this.failNext = true
  }

  async descriptor(): Promise<EidosFileDescriptor> {
    return {
      id: "playground:project-tracker",
      name: this.name,
      format: "eidos-file",
      mimeType: EIDOS_FILE_MIME_TYPE,
      size: this.bytes.byteLength,
      revision: `demo-${this.revision}`,
    }
  }

  async permission() {
    return "granted" as const
  }

  async read() {
    const copy = new Uint8Array(this.bytes.byteLength)
    copy.set(this.bytes)
    return { descriptor: await this.descriptor(), bytes: copy.buffer }
  }

  async write(bytes: Uint8Array, options: EidosFileWriteOptions = {}) {
    const actual = await this.descriptor()
    if (
      !options.force &&
      options.expectedRevision &&
      options.expectedRevision !== actual.revision
    ) {
      const conflict = {
        expectedRevision: options.expectedRevision,
        actual,
      }
      throw new EidosFileHostError(
        "conflict",
        "The demo file changed outside this editor. Reload, overwrite, or restore a checkpoint.",
        conflict
      )
    }
    if (this.failNext) {
      this.failNext = false
      throw new Error("The demo adapter rejected this write once.")
    }
    this.bytes = new Uint8Array(bytes)
    this.revision += 1
    return this.descriptor()
  }
}

function PlaygroundWorkspace({ handle }: { handle: DemoEidosFileHandle }) {
  const { session, state, snapshot } = useEidosFile()
  const [viewId, setViewId] = useState<string>()
  const [checkpoint, setCheckpoint] =
    useState<EidosFileRecoverySnapshot | null>(null)
  const [notice, setNotice] = useState(
    "Advance one Timeline record to make the working copy dirty."
  )
  const table = snapshot?.tables[0]

  const activeViewId =
    viewId ?? table?.views.find((view) => view.type === "timeline")?.id

  const reportError = useCallback((cause: unknown) => {
    const detail =
      cause instanceof EidosFileHostError && cause.cause instanceof Error
        ? ` ${cause.cause.message}`
        : ""
    setNotice(
      cause instanceof Error ? `${cause.message}${detail}` : String(cause)
    )
  }, [])

  async function save(options?: EidosFileWriteOptions) {
    try {
      await session.save(options)
      setNotice(
        options?.force ? "Working copy overwritten." : "Saved in memory."
      )
    } catch (cause) {
      reportError(cause)
    }
  }

  async function createCheckpoint() {
    try {
      const saved = await session.checkpoint()
      setCheckpoint(saved)
      setNotice(saved ? "Recovery checkpoint created." : "Make an edit first.")
    } catch (cause) {
      reportError(cause)
    }
  }

  async function restoreCheckpoint() {
    if (!checkpoint) return
    try {
      await session.restore(checkpoint)
      setNotice("Checkpoint restored to the working copy.")
    } catch (cause) {
      reportError(cause)
    }
  }

  return (
    <section className="playground-panel" aria-label="Eidos File playground">
      <header className="playground-workbar">
        <div>
          <span className="overline">Live registry consumer</span>
          <strong>{snapshot?.metadata.title ?? "Opening sample…"}</strong>
        </div>
        <span className="session-phase" data-phase={state.phase}>
          <i aria-hidden="true" />
          {state.phase}
        </span>
      </header>

      <div className="playground-controls">
        <div className="view-switcher" role="group" aria-label="Choose view">
          {table?.views
            .filter((view) => view.type === "grid" || view.type === "timeline")
            .map((view) => (
              <button
                key={view.id}
                type="button"
                aria-pressed={view.id === activeViewId}
                onClick={() => setViewId(view.id)}
              >
                {view.name}
              </button>
            ))}
        </div>
        <div className="lifecycle-actions">
          <button type="button" onClick={() => void createCheckpoint()}>
            Checkpoint
          </button>
          <button
            type="button"
            disabled={!checkpoint}
            onClick={() => void restoreCheckpoint()}
          >
            Restore
          </button>
          <button
            type="button"
            onClick={() => {
              handle.simulateWriteFailure()
              setNotice(
                "The next save will fail once; your working copy remains."
              )
            }}
          >
            Fail next save
          </button>
          <button
            type="button"
            onClick={() => {
              handle.simulateExternalChange()
              setNotice(
                "External revision advanced. The next normal save will conflict."
              )
            }}
          >
            Create conflict
          </button>
          {state.phase === "conflict" ? (
            <button type="button" onClick={() => void save({ force: true })}>
              Overwrite working copy
            </button>
          ) : (
            <button
              className="primary-action"
              type="button"
              disabled={!state.dirty}
              onClick={() => void save()}
            >
              Save changes
            </button>
          )}
        </div>
      </div>

      <p className="playground-notice" role="status">
        {notice}
      </p>
      <div className="playground-view">
        <EidosFileViewHost
          viewId={activeViewId}
          renderers={{ timeline: timelineView.renderer }}
          onError={reportError}
        />
      </div>
    </section>
  )
}

export function Playground({ compact = false }: { compact?: boolean }) {
  const [session, setSession] = useState<EidosFileSession | null>(null)
  const [handle, setHandle] = useState<DemoEidosFileHandle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" &&
    document.documentElement.dataset.theme === "dark"
      ? "dark"
      : "light"
  )
  const sessionRef = useRef<EidosFileSession | null>(null)

  useEffect(() => {
    const update = () =>
      setTheme(
        document.documentElement.dataset.theme === "dark" ? "dark" : "light"
      )
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true

    async function openSample() {
      try {
        const { EidosFileBrowserRuntime, IndexedDbEidosFileRecoveryStore } =
          await import("@eidos.space/eidos-file/browser")
        const response = await fetch("/project-tracker.eidos")
        if (!response.ok)
          throw new Error("The example Eidos File could not be loaded.")
        const bytes = new Uint8Array(await response.arrayBuffer())
        const nextHandle = new DemoEidosFileHandle(bytes)
        const nextSession = new EidosFileSession(
          new EidosFileBrowserRuntime(),
          new IndexedDbEidosFileRecoveryStore("eidos-file-developer-playground")
        )
        if (!active) {
          await nextSession.close()
          return
        }
        sessionRef.current = nextSession
        setSession(nextSession)
        setHandle(nextHandle)
        await nextSession.open(nextHandle)
      } catch (cause) {
        if (active) {
          setLoadError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    }

    void openSample()
    return () => {
      active = false
      const current = sessionRef.current
      sessionRef.current = null
      if (current) void current.close()
    }
  }, [])

  if (loadError) {
    return (
      <div className="playground-loading" role="alert">
        <strong>Playground could not start.</strong>
        <span>{loadError} Reload the page to try again.</span>
      </div>
    )
  }

  if (!session || !handle) {
    return (
      <div className="playground-loading" role="status">
        <span className="loading-rule" aria-hidden="true" />
        <strong>Opening the local SQLite sample…</strong>
        <span>The first load also initializes the WebAssembly runtime.</span>
      </div>
    )
  }

  return (
    <div className={compact ? "playground-compact" : undefined}>
      <EidosFileProvider session={session} themeName={theme}>
        <PlaygroundWorkspace handle={handle} />
      </EidosFileProvider>
    </div>
  )
}
