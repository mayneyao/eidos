import { useEidosFileUI } from "./context"
import { useRef, useState } from "react"
import { Settings2, Pencil, ChevronRight } from "lucide-react"
import { MobileFields } from "./mobile-fields"
import { MobileViewLayout } from "./mobile-view-layout"
import type { EidosFileViewPluginContribution } from "./plugin"
import type {
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import type { EidosFileEditorDataSource } from "./data-source"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/adaptive-popover"
import {
  EidosFileFilterPopover,
  EidosFileSortPopover,
} from "./eidos-file-query-toolbar"

export function MobileViewSettings({
  source,
  table,
  view,
  tables,
  onSnapshot,
  plugin,
}: {
  source: EidosFileEditorDataSource
  table: EidosFileTableSnapshot
  view?: EidosFileViewInfo
  tables: EidosFileTableSnapshot[]
  onSnapshot(snapshot: EidosFileSnapshot): void
  plugin?: EidosFileViewPluginContribution
}) {
  const t = useEidosFileUI().translate
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState(false)
  const pending = useRef(false)
  const PluginSettings = plugin?.settings
  const mutate = async (action: () => Promise<EidosFileSnapshot>) => {
    if (pending.current) throw new Error(t("Saving. Please wait."))
    pending.current = true
    setBusy(true)
    setError("")
    try {
      onSnapshot(await action())
    } catch (cause) {
      setError(String(cause))
      throw cause
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value)
          setName(view?.name ?? t("Grid"))
          setError("")
          setDeleting(false)
        }
      }}
    >
      <PopoverTrigger asChild>
        <button aria-label={t("View settings")}>
          <Settings2 size={20} />
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={t("View settings")}>
        <div className="mobile-view-settings">
          {error && <p role="alert">{error}</p>}
          {view && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="mobile-setting-row">
                  <Pencil size={18} />
                  <span>{t("View name")}</span>
                  <span className="mobile-setting-value">{view.name}</span>
                  <ChevronRight size={16} />
                </button>
              </PopoverTrigger>
              <PopoverContent aria-label={t("View name")}>
                <form
                  className="eidos-mobile-view-name"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (name.trim())
                      void mutate(() =>
                        source.updateView(view.id, { name: name.trim() })
                      ).catch(() => {})
                  }}
                >
                  <label htmlFor={`mobile-view-name-${view.id}`}>
                    {t("View name")}
                  </label>
                  <div>
                    <input
                      id={`mobile-view-name-${view.id}`}
                      aria-label={t("View name")}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      disabled={busy}
                    />
                    <button
                      type="submit"
                      disabled={
                        busy || !name.trim() || name.trim() === view.name
                      }
                    >
                      {t("Save")}
                    </button>
                  </div>
                </form>
              </PopoverContent>
            </Popover>
          )}
          <section className="mobile-setting-list">
            {view && (
              <MobileViewLayout
                table={table}
                view={view}
                busy={busy}
                error={error}
                update={(properties) =>
                  mutate(() =>
                    source.updateView(view.id, {
                      properties: { ...view.properties, ...properties },
                    })
                  )
                }
                pluginLabel={plugin?.label}
              >
                {view.type.startsWith("plugin:") && PluginSettings && (
                  <PluginSettings
                    fields={table.fields}
                    view={view}
                    disabled={busy}
                    onUpdate={(properties) =>
                      mutate(() =>
                        source.updateView(view.id, {
                          properties: { ...view.properties, ...properties },
                        })
                      )
                    }
                  />
                )}
              </MobileViewLayout>
            )}
            <MobileFields
              source={source}
              table={table}
              tables={tables}
              view={view}
              onSnapshot={onSnapshot}
            />
          </section>
          {view ? (
            <>
              <div className="mobile-setting-list mobile-query-settings">
                <EidosFileFilterPopover
                  fields={table.fields}
                  value={view.filter ?? null}
                  source={source}
                  disabled={busy}
                  onChange={(filter) =>
                    mutate(() => source.updateView(view.id, { filter }))
                  }
                />
                <EidosFileSortPopover
                  fields={table.fields}
                  value={view.sorts}
                  disabled={busy}
                  onChange={(sorts) =>
                    mutate(() => source.updateView(view.id, { sorts }))
                  }
                />
              </div>
              <div className="mobile-view-danger">
                {deleting ? (
                  <div>
                    <p>
                      {t("Delete this view? Records and tables will remain.")}
                    </p>
                    <button disabled={busy} onClick={() => setDeleting(false)}>
                      {t("Cancel")}
                    </button>
                    <button
                      disabled={busy}
                      className="text-destructive"
                      onClick={() =>
                        void mutate(() => source.deleteView(view.id))
                          .then(() => setOpen(false))
                          .catch(() => {})
                      }
                    >
                      {t("Confirm view deletion")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="text-destructive"
                    disabled={
                      busy ||
                      table.views.length <= 1 ||
                      (view.type === "grid" &&
                        table.views.filter((v) => v.type === "grid").length <=
                          1)
                    }
                    onClick={() => setDeleting(true)}
                  >
                    {t("Delete view")}
                  </button>
                )}
                {view.type === "grid" &&
                  table.views.filter((v) => v.type === "grid").length <= 1 && (
                    <p className="mobile-setting-note">
                      {t("A table must retain one grid view.")}
                    </p>
                  )}
              </div>
            </>
          ) : (
            <button
              disabled={busy}
              onClick={() =>
                void mutate(() =>
                  source.createView(table.table.id, {
                    name: t("Grid"),
                    type: "grid",
                  })
                ).catch(() => {})
              }
            >
              {t("Create a view to configure filters and sorting")}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
