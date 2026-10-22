import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Check, CircleAlert, Copy, File } from "lucide-react"
import type {
  EidosFileFieldInfo,
  EidosFilePluginConfig,
  EidosFileRow,
  EidosFileSnapshot,
  EidosFileSqlPrimitive,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { EidosFileUIProvider } from "@eidos.space/eidos-file-ui"
import {
  decodeEidosFileMultiSelectValues,
  encodeEidosFileMultiSelectValues,
  parseEidosFileSelectOptions,
} from "@eidos.space/eidos-file"
import { FilePropertiesSection } from "./file-properties-section"
import { FilePropertiesFields } from "./file-properties-fields"
import { IpcEidosFileDataSource } from "./ipc-data-source"
import { useEidosLiteI18n } from "./i18n"
import type { ResolvedAppearance } from "./app-appearance"
import { SPARK_ACTIVATION_REQUIRED } from "../shared/spark"
import type { EidosLiteApi } from "../shared/contracts"

const CONFIG_ID = "eidos.file-properties"
const BASIC_FIELDS: Record<string, string> = {
  extension: "Type",
  size: "File size",
  _created_at: "Created time",
  _updated_at: "Modified time",
}

function CopyPathButton({ path }: { path: string }) {
  const { t } = useEidosLiteI18n()
  const [feedback, setFeedback] = useState<"copied" | "failed" | null>(null)
  const request = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    setFeedback(null)
    return () => {
      request.current += 1
      clearTimeout(timer.current)
    }
  }, [path])
  return (
    <button
      type="button"
      aria-label={t("Copy path")}
      title={t(
        feedback === "copied"
          ? "Copied"
          : feedback === "failed"
            ? "Could not copy. Try again."
            : "Copy path"
      )}
      onClick={async () => {
        const id = ++request.current
        clearTimeout(timer.current)
        setFeedback(null)
        try {
          await navigator.clipboard.writeText(path)
          if (id !== request.current) return
          setFeedback("copied")
          timer.current = setTimeout(() => setFeedback(null), 1800)
        } catch {
          if (id === request.current) setFeedback("failed")
        }
      }}
    >
      {feedback === "copied" ? (
        <Check size={12} aria-hidden="true" />
      ) : feedback === "failed" ? (
        <CircleAlert size={12} aria-hidden="true" />
      ) : (
        <Copy size={12} aria-hidden="true" />
      )}
      <span className="sr-only" role="status">
        {feedback === "copied"
          ? t("Copied")
          : feedback === "failed"
            ? t("Could not copy. Try again.")
            : ""}
      </span>
    </button>
  )
}
type Model = {
  path: string
  source: IpcEidosFileDataSource
  snapshot: EidosFileSnapshot
  row: EidosFileRow
  config: EidosFilePluginConfig
}

function filePropertiesView(
  tableId: string,
  config: EidosFilePluginConfig
): EidosFileViewInfo {
  const hidden = config.value?.hiddenFields
  const order = config.value?.orderMap
  return {
    id: CONFIG_ID,
    tableId,
    name: "File properties",
    type: "grid",
    query: "",
    hiddenFields: Array.isArray(hidden)
      ? hidden.filter((value): value is string => typeof value === "string")
      : [],
    orderMap:
      order && typeof order === "object" && !Array.isArray(order)
        ? Object.fromEntries(
            Object.entries(order).filter(
              (entry): entry is [string, number] => typeof entry[1] === "number"
            )
          )
        : {},
    properties: null,
    filter: null,
    sorts: [],
    position: null,
    createdAt: "",
    updatedAt: "",
  }
}

export interface FilePropertiesContentHandle {
  flushDrafts(): Promise<boolean>
}

interface FilePropertiesContentProps {
  relativePath: string
  disabled: boolean
  readOnly?: boolean
  theme: ResolvedAppearance
  refreshToken: number | string
  iconUrl?: string
  spacePath?: string
  onContentHeight?(height: number): void
  onReleaseEidosFile(sessionId: string): Promise<void>
  onChanged(snapshot: EidosFileSnapshot): void
  onClose(): void
}

export const FilePropertiesContent = forwardRef<
  FilePropertiesContentHandle,
  FilePropertiesContentProps
>(function FilePropertiesContent(props, ref) {
  const { t, locale } = useEidosLiteI18n()
  const contentRef = useRef<HTMLElement>(null)
  const [model, setModel] = useState<Model | null>(null)
  const [basic, setBasic] =
    useState<Awaited<ReturnType<EidosLiteApi["getBasicFileProperties"]>>>(null)
  const [basicError, setBasicError] = useState<string | null>(null)
  const modelRef = useRef(model)
  modelRef.current = model
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [pending, setPending] = useState(0)
  const [failedEdit, setFailedEdit] = useState<{
    message: string
    retry(): Promise<void>
  } | null>(null)
  const latest = useRef(props)
  latest.current = props
  const mounted = useRef(true)
  const sessions = useRef(new Set<string>())
  const edits = useRef<Promise<void>>(Promise.resolve())
  const editRevision = useRef(0)
  const editFailure = useRef(false)
  const draftCommits = useRef(new Map<string, () => boolean>())
  const registerCommit = useCallback(
    (fieldId: string, commit: () => boolean) => {
      draftCommits.current.set(fieldId, commit)
      return () => {
        if (draftCommits.current.get(fieldId) === commit)
          draftCommits.current.delete(fieldId)
      }
    },
    []
  )
  const flushDrafts = useCallback(async () => {
    let valid = true
    for (const commit of [...draftCommits.current.values()]) {
      if (!commit()) valid = false
    }
    if (!valid) return false
    await edits.current.catch(() => undefined)
    return !editFailure.current
  }, [])
  useImperativeHandle(ref, () => ({ flushDrafts }), [flushDrafts])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      for (const sessionId of sessions.current)
        void latest.current.onReleaseEidosFile(sessionId).catch(() => {})
    }
  }, [])
  const report = (cause: unknown) =>
    setError(t(cause instanceof Error ? cause.message : String(cause)))

  useEffect(() => {
    let active = true
    const path = props.relativePath
    const ready = modelRef.current?.path === path ? modelRef.current : null
    // Watcher notifications also follow our own file-attribute writes. Refresh
    // the ready inspector in place instead of inserting a loading row and
    // resizing the native window around every edit.
    setLoading(!ready)
    setError(null)
    setBasicError(null)
    void window.eidosLite
      .getBasicFileProperties(path)
      .then((info) => {
        if (!active) return
        setBasic(info)
        if (!info) setBasicError(t("This file is no longer available"))
      })
      .catch((cause: unknown) => {
        if (active)
          setBasicError(
            t(cause instanceof Error ? cause.message : String(cause))
          )
      })
    void (async () => {
      if (ready) await edits.current
      const revision = editRevision.current
      let source: IpcEidosFileDataSource
      let snapshot: EidosFileSnapshot
      if (ready) {
        source = ready.source
        snapshot = await source.getSnapshot()
      } else {
        const opened = await window.eidosLite.openFileMetadata(null)
        if (!mounted.current) {
          await latest.current.onReleaseEidosFile(opened.sessionId)
          return
        }
        sessions.current.add(opened.sessionId)
        source = new IpcEidosFileDataSource(opened.sessionId, opened.snapshot)
        snapshot = opened.snapshot
      }
      const table = snapshot.tables.find(
        ({ table }) => table.settings?.vtabModule === "fs_meta"
      )
      const pathField = table?.fields.find(
        (field) => field.name === "path" && field.settings?.isSystem === true
      )
      if (!table || !pathField)
        throw new Error("File properties are unavailable")
      const [page, config] = await Promise.all([
        source.getPage(table.table.id, 0, 100, {
          filter: {
            type: "group",
            conjunction: "and",
            children: [
              {
                type: "rule",
                field: pathField.id,
                operator: "equals",
                value: path,
              },
            ],
          },
        }),
        source.readTablePluginConfig(table.table.id, CONFIG_ID),
      ])
      // Runtime text filters can be case-insensitive. Never edit a neighbouring file.
      const row = page.rows.find(
        (row) => row[pathField.tableColumnName] === path
      )
      if (!row) {
        if (active) setModel(null)
        throw new Error(t("This file is no longer available"))
      }
      // A later local edit owns its authoritative result. A read started before
      // that edit must not briefly restore its previous value or reset a draft.
      if (active && (!ready || revision === editRevision.current))
        setModel({ path, source, snapshot, row, config })
    })()
      .catch((cause) => {
        if (active) {
          if (!ready) setModel(null)
          report(cause)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [props.relativePath, props.readOnly, props.refreshToken, refresh, t])

  const table = model?.snapshot.tables.find(
    ({ table }) => table.settings?.vtabModule === "fs_meta"
  )
  const current = model?.path === props.relativePath
  const displayPath = model?.path ?? basic?.path ?? props.relativePath
  const activationRequired =
    props.readOnly === true ||
    (error ?? "").includes(SPARK_ACTIVATION_REQUIRED) ||
    (failedEdit?.message ?? "").includes(SPARK_ACTIVATION_REQUIRED)
  const blocked = props.disabled || !current || activationRequired
  useLayoutEffect(() => {
    const element = contentRef.current
    if (
      !element ||
      ((!model || !current) && !basic && !error && !basicError) ||
      loading ||
      !props.onContentHeight ||
      typeof ResizeObserver === "undefined"
    )
      return
    let frame = 0
    let lastHeight = -1
    const reportHeight = () => {
      cancelAnimationFrame(frame)
      // Child editors finish their layout effects before this frame. Do not
      // send the intermediate textarea/form heights to the native window.
      frame = requestAnimationFrame(() => {
        const height = Math.ceil(element.getBoundingClientRect().height)
        if (height !== lastHeight) props.onContentHeight?.(height)
        lastHeight = height
      })
    }
    const observer = new ResizeObserver(reportHeight)
    observer.observe(element)
    reportHeight()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [
    current,
    loading,
    error,
    basic,
    basicError,
    model?.path,
    props.onContentHeight,
  ])
  const systemValue = (name: string) => {
    if (basic?.path === displayPath) {
      if (name === "extension") return basic.extension.replace(/^\./, "")
      if (name === "size") return basic.size
      if (name === "_created_at")
        return basic.createdAtMs > 0
          ? new Date(basic.createdAtMs).toISOString()
          : null
      if (name === "_updated_at")
        return new Date(basic.modifiedAtMs).toISOString()
    }
    const field = table?.fields.find(
      (field) => field.name === name && field.settings?.isSystem === true
    )
    return field ? model?.row[field.tableColumnName] : undefined
  }
  const byteCount = systemValue("size")
  const sizeText =
    byteCount == null
      ? ""
      : t("{count} bytes", { count: Number(byteCount).toLocaleString(locale) })
  const modified = systemValue("_updated_at")
  const modifiedDate = modified ? new Date(String(modified)) : null
  const modifiedText =
    modifiedDate && !Number.isNaN(modifiedDate.getTime())
      ? modifiedDate.toDateString() === new Date().toDateString()
        ? `${t("Today")}, ${modifiedDate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false })}`
        : modifiedDate.toLocaleString(locale, {
            dateStyle: "medium",
            timeStyle: "short",
          })
      : ""
  const updateSnapshot = (snapshot: EidosFileSnapshot) => {
    setModel((value) =>
      value && value.source === model?.source ? { ...value, snapshot } : value
    )
    props.onChanged(snapshot)
  }
  const edit = async (
    field: EidosFileFieldInfo,
    value: EidosFileSqlPrimitive
  ) => {
    if (!model || !table || blocked) return
    editRevision.current += 1
    const target = model
    const save = async () => {
      setPending((count) => count + 1)
      try {
        const result = await target.source.updateRow(
          table.table.id,
          String(target.row._id),
          { [field.id]: value }
        )
        const snapshot = await target.source.getSnapshot()
        if (mounted.current) {
          setModel((current) =>
            current?.source === target.source
              ? { ...current, row: result.row, snapshot }
              : current
          )
          setError(null)
          setFailedEdit(null)
          editFailure.current = false
          latest.current.onChanged(snapshot)
        }
      } catch (cause) {
        editFailure.current = true
        if (mounted.current) {
          setFailedEdit({
            message: `${target.path}: ${cause instanceof Error ? cause.message : String(cause)}`,
            retry: run,
          })
        }
      } finally {
        if (mounted.current) setPending((count) => count - 1)
      }
    }
    const run = () => {
      const next = edits.current.then(save, save)
      edits.current = next
      return next
    }
    await run()
  }
  const createOption = (field: EidosFileFieldInfo, name: string) => {
    if (!model || !table || blocked)
      return Promise.reject(new Error(t("This file is no longer available")))
    editRevision.current += 1
    const target = model
    const tableId = table.table.id
    const save = async () => {
      setPending((count) => count + 1)
      try {
        let snapshot = await target.source.getSnapshot()
        const currentTable = snapshot.tables.find(
          (candidate) => candidate.table.id === tableId
        )
        const currentField = currentTable?.fields.find(
          (candidate) => candidate.id === field.id
        )
        const pathField = currentTable?.fields.find(
          (candidate) =>
            candidate.name === "path" && candidate.settings?.isSystem === true
        )
        if (
          !currentField ||
          !["select", "multi-select"].includes(currentField.type) ||
          !pathField
        )
          throw new Error(t("This file is no longer available"))
        const options = parseEidosFileSelectOptions(currentField.property)
        const optionName = name.trim()
        if (!optionName) return
        if (!options.some((option) => option.name === optionName)) {
          const colors = ["blue", "green", "orange", "purple", "pink"]
          snapshot = await target.source.updateField(tableId, currentField.id, {
            property: {
              ...currentField.property,
              options: [
                ...options,
                {
                  name: optionName,
                  color: colors[options.length % colors.length]!,
                },
              ],
            },
          })
        }
        // Read after queued writes so adding a choice never drops earlier selections.
        const page = await target.source.getPage(tableId, 0, 100, {
          filter: {
            type: "group",
            conjunction: "and",
            children: [
              {
                type: "rule",
                field: pathField.id,
                operator: "equals",
                value: target.path,
              },
            ],
          },
        })
        const row = page.rows.find(
          (row) => row[pathField.tableColumnName] === target.path
        )
        if (!row) throw new Error(t("This file is no longer available"))
        const value = row[currentField.tableColumnName]
        const selected = decodeEidosFileMultiSelectValues(
          typeof value === "string" ? value : null
        )
        const result = await target.source.updateRow(tableId, String(row._id), {
          [currentField.id]:
            currentField.type === "select"
              ? optionName
              : encodeEidosFileMultiSelectValues([
                  ...new Set([...selected, optionName]),
                ]),
        })
        snapshot = await target.source.getSnapshot()
        if (mounted.current) {
          setModel((current) =>
            current?.source === target.source
              ? { ...current, snapshot, row: result.row }
              : current
          )
          latest.current.onChanged(snapshot)
        }
      } finally {
        if (mounted.current) setPending((count) => count - 1)
      }
    }
    const next = edits.current.then(save, save)
    edits.current = next.catch(() => {})
    return next
  }
  const activationNotice = (
    <div className="file-properties-activation" role="status">
      <p>
        {t(
          "File properties are read-only until Spark is activated on this computer."
        )}
      </p>
      <button
        type="button"
        onClick={() =>
          void window.eidosLite.openSettingsDestination("account-sync")
        }
      >
        {t("Activate Spark")}
      </button>
    </div>
  )
  return (
    <EidosFileUIProvider
      locale={locale}
      themeName={props.theme}
      activateUrl={(url) => window.eidosLite.openExternalUrl(url)}
    >
      <aside
        ref={contentRef}
        className="file-properties-content"
        aria-label={t("File properties")}
        aria-busy={loading || pending > 0}
      >
        <div className="file-properties-identity">
          {props.iconUrl ? (
            <img src={props.iconUrl} alt="" width={32} height={32} />
          ) : (
            <File size={32} strokeWidth={1.25} />
          )}
          <div>
            <strong>{displayPath.split("/").at(-1)}</strong>
            <small>
              {modifiedText
                ? t("Modified: {date}", { date: modifiedText })
                : ""}
            </small>
          </div>
          <span className="file-properties-size">{sizeText}</span>
        </div>
        {loading && (
          <p className="file-sidebar-status" role="status">
            {t("Loading properties for {name}…", {
              name: props.relativePath.split("/").at(-1)!,
            })}
          </p>
        )}
        {(basicError || (!activationRequired && (error || failedEdit))) && (
          <div
            className="file-sidebar-error file-properties-error"
            role="alert"
          >
            <span>{basicError ?? error ?? failedEdit?.message}</span>
            <div className="file-properties-error-actions">
              <button
                type="button"
                disabled={pending > 0}
                onClick={() => {
                  if (failedEdit) void failedEdit.retry()
                  else setRefresh((n) => n + 1)
                }}
              >
                {t("Retry")}
              </button>
            </div>
          </div>
        )}
        {activationRequired && !(model && table) && !basic && activationNotice}
        {((model && table) || basic) && (
          <div
            className="file-properties-body"
            ref={(element) => {
              if (element)
                element.inert = model
                  ? !current
                  : basic?.path !== props.relativePath
            }}
          >
            <FilePropertiesSection title={t("General file information")}>
              <dl>
                {[
                  "extension",
                  "size",
                  "location",
                  "_created_at",
                  "_updated_at",
                ].map((name) => {
                  if (name === "location") {
                    const parent = [
                      props.spacePath,
                      ...displayPath.split("/").slice(0, -1),
                    ]
                      .filter(Boolean)
                      .join("/")
                    return (
                      <div key={name}>
                        <dt>{t("Where")}:</dt>
                        <dd className="file-properties-path">
                          <span>{parent || displayPath}</span>
                          <CopyPathButton path={parent || displayPath} />
                        </dd>
                      </div>
                    )
                  }
                  const raw = systemValue(name)
                  const text =
                    raw == null
                      ? "—"
                      : name === "size"
                        ? sizeText
                        : name === "_created_at" || name === "_updated_at"
                          ? new Date(String(raw)).toLocaleString(
                              locale === "zh" ? "zh-CN" : "en-US",
                              { dateStyle: "full", timeStyle: "short" }
                            )
                          : name === "extension" &&
                              String(raw).toLowerCase() === "md"
                            ? t("Markdown document")
                            : String(raw)
                  return (
                    <div key={name}>
                      <dt>{t(BASIC_FIELDS[name]!)}:</dt>
                      <dd>{text}</dd>
                    </div>
                  )
                })}
              </dl>
            </FilePropertiesSection>
            {model && table && (
              <FilePropertiesFields
                key={model.path}
                source={model.source}
                table={table}
                row={model.row}
                view={filePropertiesView(table.table.id, model.config)}
                disabled={blocked}
                readOnly={activationRequired}
                onEdit={edit}
                onCreateOption={createOption}
                onSnapshot={updateSnapshot}
                registerCommit={registerCommit}
              />
            )}
            {activationRequired && activationNotice}
            <p className="sr-only" role="status">
              {pending > 0
                ? t("Saving…")
                : failedEdit
                  ? t("Changes not saved")
                  : ""}
            </p>
          </div>
        )}
      </aside>
    </EidosFileUIProvider>
  )
})
