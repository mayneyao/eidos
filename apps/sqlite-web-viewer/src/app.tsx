import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react"
import {
  AlertTriangle,
  Database,
  FileLock2,
  FileUp,
  FolderOpen,
  HardDrive,
  LoaderCircle,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
} from "lucide-react"

import { ExtensionSettings } from "./components/extension-settings"
import { ObjectSidebar } from "./components/object-sidebar"
import { SchemaInspector } from "./components/schema-inspector"
import {
  addCustomSQLiteExtension,
  loadCustomSQLiteExtensions,
  saveCustomSQLiteExtensions,
} from "./files/custom-extensions"
import {
  allSQLiteExtensions,
  BUILT_IN_SQLITE_EXTENSIONS,
  sqliteFileAccept,
  SQLiteFileValidationError,
  validateSQLiteFile,
} from "./files/file-validation"
import {
  SQLiteViewerWorkerClient,
  type SQLiteViewerClient,
} from "./runtime/client"
import type {
  DatabaseOverview as DatabaseOverviewModel,
  DatabaseSnapshot,
  RelationDetails,
} from "./types"

type AppPhase = "idle" | "opening" | "ready" | "error"
type ThemeName = "light" | "dark"

const ViewerDataGrid = lazy(() =>
  import("./components/viewer-data-grid").then((module) => ({
    default: module.ViewerDataGrid,
  }))
)

export interface AppProps {
  createClient?: () => SQLiteViewerClient
}

function initialTheme(): ThemeName {
  try {
    const stored = localStorage.getItem("sqlite-web-viewer-theme")
    if (stored === "light" || stored === "dark") return stored
  } catch {
    // Storage can be unavailable in hardened browsing modes. Theme selection
    // still works for the current page without persistence.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function errorMessage(error: unknown): string {
  if (error instanceof SQLiteFileValidationError) return error.message
  const message = error instanceof Error ? error.message : String(error)
  if (/encrypted|not a database|file is not a database/i.test(message)) {
    return "SQLite could not read this database. It may be encrypted or use an unsupported codec."
  }
  if (/malformed|corrupt|disk image/i.test(message)) {
    return "SQLite reports that this database is damaged. Try a known-good copy of the file."
  }
  if (/memory|allocation|too large/i.test(message)) {
    return "The browser ran out of memory while opening this database. Close other tabs or try a smaller file."
  }
  if (/worker|wasm|webassembly/i.test(message)) {
    return "The local SQLite engine could not start. Reload the page or try a current browser."
  }
  return message || "The database could not be opened."
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1_024
  let unit = 0
  while (value >= 1_024 && unit < units.length - 1) {
    value /= 1_024
    unit += 1
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

function formatInteger(value: number): string {
  return value.toLocaleString()
}

export function App({
  createClient = () => new SQLiteViewerWorkerClient(),
}: AppProps) {
  const [client] = useState(createClient)
  const [phase, setPhase] = useState<AppPhase>("idle")
  const [snapshot, setSnapshot] = useState<DatabaseSnapshot | null>(null)
  const [activeName, setActiveName] = useState<string | null>(null)
  const [details, setDetails] = useState<RelationDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsReload, setDetailsReload] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [openingFile, setOpeningFile] = useState<{
    name: string
    size: number
  } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [theme, setTheme] = useState<ThemeName>(initialTheme)
  const [customExtensions, setCustomExtensions] = useState(
    loadCustomSQLiteExtensions
  )
  const [extensionSettingsOpen, setExtensionSettingsOpen] = useState(false)
  const [extensionPersistenceAvailable, setExtensionPersistenceAvailable] =
    useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)
  const detailsRequestRef = useRef(0)
  const acceptedExtensions = useMemo(
    () => allSQLiteExtensions(customExtensions),
    [customExtensions]
  )
  const fileAccept = useMemo(
    () => sqliteFileAccept(customExtensions),
    [customExtensions]
  )

  useEffect(() => {
    setExtensionPersistenceAvailable(
      saveCustomSQLiteExtensions(customExtensions)
    )
  }, [customExtensions])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem("sqlite-web-viewer-theme", theme)
    } catch {
      // Theme persistence is optional; rendering is not.
    }
  }, [theme])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault()
        inputRef.current?.click()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    if (!activeName || !snapshot) {
      setDetails(null)
      setDetailsLoading(false)
      return
    }
    const request = ++detailsRequestRef.current
    setDetails(null)
    setDetailsLoading(true)
    setError(null)
    void client
      .getDetails(activeName)
      .then((nextDetails) => {
        if (request === detailsRequestRef.current) setDetails(nextDetails)
      })
      .catch((reason) => {
        if (request === detailsRequestRef.current)
          setError(errorMessage(reason))
      })
      .finally(() => {
        if (request === detailsRequestRef.current) setDetailsLoading(false)
      })
  }, [activeName, client, detailsReload, snapshot])

  const openFile = useCallback(
    async (file: File) => {
      let workerOpenStarted = false
      setOpeningFile({ name: file.name, size: file.size })
      setPhase("opening")
      setError(null)
      try {
        await validateSQLiteFile(file, customExtensions)
        const bytes = await file.arrayBuffer()
        workerOpenStarted = true
        const nextSnapshot = await client.open(file.name, bytes)
        setSnapshot(nextSnapshot)
        setDetails(null)
        setActiveName(nextSnapshot.relations[0]?.name ?? null)
        setPhase("ready")
      } catch (reason) {
        setError(errorMessage(reason))
        if (snapshot && !workerOpenStarted) {
          setPhase("ready")
        } else {
          setSnapshot(null)
          setActiveName(null)
          setDetails(null)
          setPhase("error")
        }
      } finally {
        setOpeningFile(null)
      }
    },
    [client, customExtensions, snapshot]
  )

  const closeExtensionSettings = useCallback(
    () => setExtensionSettingsOpen(false),
    []
  )

  const addExtension = useCallback(
    (value: string) => {
      setCustomExtensions(addCustomSQLiteExtension(customExtensions, value))
    },
    [customExtensions]
  )

  const removeExtension = useCallback((extension: string) => {
    setCustomExtensions((current) =>
      current.filter((candidate) => candidate !== extension)
    )
  }, [])

  const onGridError = useCallback((reason: unknown) => {
    setError(errorMessage(reason))
  }, [])

  const onInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.item(0)
    event.target.value = ""
    if (file) void openFile(file)
  }

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepthRef.current += 1
    if (event.dataTransfer.types.includes("Files")) setDragActive(true)
  }

  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragActive(false)
  }

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setDragActive(false)
    const file = event.dataTransfer.files.item(0)
    if (file) void openFile(file)
  }

  return (
    <div
      className="app-shell"
      data-drag-active={dragActive || undefined}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <a className="skip-link" href="#viewer-main">
        Skip to database content
      </a>
      <input
        accept={fileAccept}
        className="visually-hidden"
        onChange={onInputChange}
        ref={inputRef}
        type="file"
      />
      {snapshot && phase !== "idle" ? (
        <ViewerHeader
          extensionSettingsOpen={extensionSettingsOpen}
          onConfigureExtensions={() =>
            setExtensionSettingsOpen((current) => !current)
          }
          onOpen={() => inputRef.current?.click()}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          snapshot={snapshot}
          theme={theme}
        />
      ) : (
        <LaunchHeader
          extensionSettingsOpen={extensionSettingsOpen}
          onConfigureExtensions={() =>
            setExtensionSettingsOpen((current) => !current)
          }
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
          theme={theme}
        />
      )}

      {extensionSettingsOpen && (
        <ExtensionSettings
          customExtensions={customExtensions}
          onAdd={addExtension}
          onClose={closeExtensionSettings}
          onRemove={removeExtension}
          persistenceAvailable={extensionPersistenceAvailable}
        />
      )}

      {phase === "idle" && (
        <LaunchScreen
          customExtensions={customExtensions}
          onConfigureExtensions={() => setExtensionSettingsOpen(true)}
          onOpen={() => inputRef.current?.click()}
        />
      )}
      {phase === "opening" && !snapshot && <OpeningScreen file={openingFile} />}
      {phase === "error" && !snapshot && (
        <ErrorScreen error={error} onOpen={() => inputRef.current?.click()} />
      )}
      {snapshot && (phase === "ready" || phase === "opening") && (
        <main className="viewer-main" id="viewer-main">
          {error && (
            <div className="error-strip" role="alert">
              <AlertTriangle aria-hidden size={14} />
              <span>{error}</span>
              <button onClick={() => setError(null)} type="button">
                Dismiss
              </button>
            </div>
          )}
          <div className="viewer-layout">
            <ObjectSidebar
              activeName={activeName}
              onSelect={setActiveName}
              snapshot={snapshot}
            />
            <section className="data-workspace" aria-label="Table data">
              {details && <RelationHeader details={details} />}
              <div className="data-surface">
                {detailsLoading && <MetadataLoading />}
                {!detailsLoading && details && (
                  <Suspense
                    fallback={<MetadataLoading label="Preparing data grid…" />}
                  >
                    <ViewerDataGrid
                      client={client}
                      details={details}
                      onError={onGridError}
                      theme={theme}
                    />
                  </Suspense>
                )}
                {!detailsLoading && !activeName && (
                  <DatabaseOverview overview={snapshot.overview} />
                )}
                {!detailsLoading && activeName && !details && (
                  <ObjectError
                    onRetry={() => setDetailsReload((value) => value + 1)}
                  />
                )}
              </div>
            </section>
            {details ? (
              <SchemaInspector details={details} />
            ) : (
              <aside
                className="schema-inspector inspector-placeholder"
                aria-label="Object metadata"
              >
                <span>
                  {detailsLoading
                    ? "Reading schema…"
                    : "Select an object to inspect its schema"}
                </span>
              </aside>
            )}
          </div>
          {phase === "opening" && <OpeningOverlay file={openingFile} />}
        </main>
      )}
      {dragActive && (
        <div className="drop-overlay" role="status">
          <FileUp aria-hidden size={22} />
          <strong>Drop the SQLite file to inspect it</strong>
          <span>
            {acceptedExtensions.slice(0, 5).join(" · ")}
            {acceptedExtensions.length > 5 &&
              ` · +${acceptedExtensions.length - 5} custom`}
          </span>
        </div>
      )}
    </div>
  )
}

function LaunchHeader({
  extensionSettingsOpen,
  onConfigureExtensions,
  onToggleTheme,
  theme,
}: {
  extensionSettingsOpen: boolean
  onConfigureExtensions(): void
  onToggleTheme(): void
  theme: ThemeName
}) {
  return (
    <header className="app-header launch-app-header">
      <Brand />
      <div className="header-actions">
        <ExtensionSettingsButton
          expanded={extensionSettingsOpen}
          onClick={onConfigureExtensions}
        />
        <ThemeButton onClick={onToggleTheme} theme={theme} />
      </div>
    </header>
  )
}

function ViewerHeader({
  extensionSettingsOpen,
  onConfigureExtensions,
  onOpen,
  onToggleTheme,
  snapshot,
  theme,
}: {
  extensionSettingsOpen: boolean
  onConfigureExtensions(): void
  onOpen(): void
  onToggleTheme(): void
  snapshot: DatabaseSnapshot
  theme: ThemeName
}) {
  return (
    <header className="app-header viewer-header">
      <Brand />
      <div className="file-identity">
        <Database aria-hidden size={14} />
        <strong title={snapshot.fileName}>{snapshot.fileName}</strong>
        <span>{formatBytes(snapshot.overview.fileBytes)}</span>
      </div>
      <div className="header-status" aria-label="Viewer guarantees">
        <span>
          <ShieldCheck size={12} />
          Local only
        </span>
        <span>
          <FileLock2 size={12} />
          Read-only
        </span>
      </div>
      <div className="header-actions">
        <ExtensionSettingsButton
          expanded={extensionSettingsOpen}
          onClick={onConfigureExtensions}
        />
        <button className="header-button" onClick={onOpen} type="button">
          <FolderOpen aria-hidden size={14} />
          <span>Open another</span>
          <kbd>⌘O</kbd>
        </button>
        <ThemeButton onClick={onToggleTheme} theme={theme} />
      </div>
    </header>
  )
}

function Brand() {
  return (
    <div className="brand-lockup" aria-label="SQLite Web Viewer">
      <span className="brand-mark" aria-hidden>
        sq
      </span>
      <span>SQLite Viewer</span>
    </div>
  )
}

function ThemeButton({
  onClick,
  theme,
}: {
  onClick(): void
  theme: ThemeName
}) {
  const Icon = theme === "dark" ? Sun : Moon
  return (
    <button
      aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`}
      className="icon-button"
      onClick={onClick}
      title={`Use ${theme === "dark" ? "light" : "dark"} theme`}
      type="button"
    >
      <Icon aria-hidden size={15} />
    </button>
  )
}

function ExtensionSettingsButton({
  expanded,
  onClick,
}: {
  expanded: boolean
  onClick(): void
}) {
  return (
    <button
      aria-expanded={expanded}
      aria-label="Configure SQLite file suffixes"
      className="icon-button"
      data-extension-settings-trigger
      onClick={onClick}
      title="Configure SQLite file suffixes"
      type="button"
    >
      <Settings2 aria-hidden size={15} />
    </button>
  )
}

function LaunchScreen({
  customExtensions,
  onConfigureExtensions,
  onOpen,
}: {
  customExtensions: readonly string[]
  onConfigureExtensions(): void
  onOpen(): void
}) {
  const shownCustomExtensions = customExtensions.slice(0, 3)
  return (
    <main className="launch-main" id="viewer-main">
      <div className="launch-rail" aria-hidden>
        <span>01</span>
        <span>READ / ONLY</span>
      </div>
      <section className="launch-copy">
        <p className="eyebrow">Local SQLite inspector</p>
        <h1>See what is inside the database.</h1>
        <p className="launch-lede">
          Open SQLite files directly in your browser—including{" "}
          <code>.eidos</code> and custom suffixes you configure. Browse rows,
          schema, indexes, and foreign keys without changing the file.
        </p>
        <button className="open-file-button" onClick={onOpen} type="button">
          <FolderOpen aria-hidden size={17} />
          <span>Open SQLite file</span>
          <kbd>⌘O</kbd>
        </button>
        <div className="format-line" aria-label="Supported formats">
          {BUILT_IN_SQLITE_EXTENSIONS.map((extension) => (
            <span key={extension}>{extension}</span>
          ))}
          {shownCustomExtensions.map((extension) => (
            <span className="custom-format" key={extension}>
              {extension}
            </span>
          ))}
          {customExtensions.length > shownCustomExtensions.length && (
            <span className="custom-format">
              +{customExtensions.length - shownCustomExtensions.length}
            </span>
          )}
          <button
            data-extension-settings-trigger
            onClick={onConfigureExtensions}
            type="button"
          >
            <Settings2 aria-hidden size={11} />
            Custom suffixes
          </button>
        </div>
      </section>
      <aside className="trust-notes" aria-label="Privacy and safety">
        <div>
          <HardDrive aria-hidden size={15} />
          <strong>Stays on this device</strong>
          <p>The file is processed in your browser and is never uploaded.</p>
        </div>
        <div>
          <FileLock2 aria-hidden size={15} />
          <strong>Read path only</strong>
          <p>No SQL editor, writes, saves, imports, or migrations.</p>
        </div>
        <p className="drop-hint">
          You can also drop a supported file anywhere on this page.
        </p>
      </aside>
    </main>
  )
}

function OpeningScreen({
  file,
}: {
  file: { name: string; size: number } | null
}) {
  return (
    <main className="center-state" id="viewer-main" role="status">
      <LoaderCircle className="spin" aria-hidden size={22} />
      <strong>Opening {file?.name ?? "database"}</strong>
      <span>
        {file ? `${formatBytes(file.size)} · ` : ""}Validating and reading
        locally…
      </span>
    </main>
  )
}

function ErrorScreen({
  error,
  onOpen,
}: {
  error: string | null
  onOpen(): void
}) {
  return (
    <main className="center-state error-state" id="viewer-main">
      <AlertTriangle aria-hidden size={22} />
      <strong>This file could not be opened</strong>
      <span role="alert">{error}</span>
      <button className="secondary-button" onClick={onOpen} type="button">
        Choose another file
      </button>
    </main>
  )
}

function OpeningOverlay({
  file,
}: {
  file: { name: string; size: number } | null
}) {
  return (
    <div className="opening-overlay" role="status">
      <LoaderCircle className="spin" aria-hidden size={18} />
      <div>
        <strong>Opening {file?.name}</strong>
        <span>Current database remains untouched.</span>
      </div>
    </div>
  )
}

function RelationHeader({ details }: { details: RelationDetails }) {
  const { relation } = details
  return (
    <div className="relation-header">
      <div>
        <span className="object-kicker">{relation.kind}</span>
        <h2>{relation.name}</h2>
      </div>
      <div className="relation-facts">
        <span>{formatInteger(details.rowCount)} rows</span>
        {relation.kind === "view" ? (
          <span className="fact-view">view · computed</span>
        ) : relation.withoutRowid ? (
          <span>WITHOUT ROWID</span>
        ) : (
          <span>rowid · {details.rowidAlias ?? "shadowed"}</span>
        )}
        <span title={`Stable paging order: ${details.stableOrder}`}>
          order · {details.stableOrder}
        </span>
      </div>
    </div>
  )
}

function DatabaseOverview({ overview }: { overview: DatabaseOverviewModel }) {
  const items = [
    ["File size", formatBytes(overview.fileBytes)],
    [
      "Page layout",
      `${formatInteger(overview.pageCount)} × ${formatBytes(overview.pageSize)}`,
    ],
    ["Free pages", formatInteger(overview.freePages)],
    ["Encoding", overview.encoding],
    ["User version", formatInteger(overview.userVersion)],
    ["Application ID", formatInteger(overview.applicationId)],
    ["Schema version", formatInteger(overview.schemaVersion)],
  ]
  return (
    <div className="database-overview">
      <div>
        <Database aria-hidden size={20} />
        <h2>No user tables or views</h2>
        <p>This is a valid SQLite database with an empty user schema.</p>
      </div>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function MetadataLoading({
  label = "Reading rows and schema…",
}: {
  label?: string
}) {
  return (
    <div className="metadata-loading" role="status">
      <LoaderCircle className="spin" aria-hidden size={17} />
      <span>{label}</span>
    </div>
  )
}

function ObjectError({ onRetry }: { onRetry(): void }) {
  return (
    <div className="grid-empty">
      <strong>This object could not be read</strong>
      <span>It may use a missing SQLite extension or unsupported feature.</span>
      <button className="secondary-button" onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  )
}
