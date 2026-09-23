import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import {
  Search,
  Command,
  FilePlus,
  PanelLeft,
  Palette,
  Puzzle,
  Terminal,
  FileText,
} from "lucide-react"
import type { PluginListing, PluginOpenResult } from "../shared/plugins"
import type { TextChange } from "@eidos.space/plugin-runtime/rpc"
import { PluginEditor } from "./plugin-editor"
import { useEidosLiteI18n } from "./i18n"
import { pluginShortcutBindings } from "./plugin-shortcuts"
import {
  eidosLiteShortcutLabel,
  DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
} from "../shared/keyboard-shortcuts"

type Instance = NonNullable<PluginOpenResult["instance"]>
const commandIcons: Record<string, typeof Command> = {
  "host/quick-open": Search,
  "host/new-file": FilePlus,
  "host/plugins": Puzzle,
  "host/theme": Palette,
  "host/sidebar": PanelLeft,
  "host/terminal": Terminal,
  "host/format": FileText,
  "host/format-with": FileText,
  "host/default-formatter": FileText,
}
export function PluginWorkspace({
  onPage,
  document,
  onDraft,
  onActionComplete,
  onOpenFile,
  disabled = false,
  navigationVisible = true,
  navigationTarget,
  commands = [],
}: {
  onPage(key: string): void
  document?: { path: string; draft?: TextChange }
  onDraft(path: string, draft: TextChange | null): void
  onActionComplete?(path: string): void | Promise<void>
  onOpenFile?(path: string): void
  disabled?: boolean
  navigationVisible?: boolean
  navigationTarget?: HTMLElement | null
  commands?: { key: string; title: string; shortcut?: string; run(): void }[]
}) {
  const { t } = useEidosLiteI18n()
  const renderNavigation = (node: ReactNode) =>
    navigationTarget ? createPortal(node, navigationTarget) : node
  const [listing, setListing] = useState<PluginListing | null>(null)
  const contextVersion = useMemo(
    () => crypto.randomUUID(),
    [document?.path, document?.draft?.text, document?.draft?.expectedRevision]
  )
  useLayoutEffect(() => {
    void window.eidosLite
      .setFormatterContext?.(document?.path ?? null, contextVersion)
      .catch(() => {})
    return () => {
      void window.eidosLite
        .setFormatterContext?.(null, crypto.randomUUID())
        .catch(() => {})
    }
  }, [document?.path, contextVersion])
  const [extensions, setExtensions] = useState<Record<string, Instance>>({})
  const [busy, setBusy] = useState(false)
  const [palette, setPalette] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [formatterPicker, setFormatterPicker] = useState<{
    target: NonNullable<typeof document>
    mode: "run" | "default"
  } | null>(null)
  const [acceptedBindings, setAcceptedBindings] = useState<string[]>([])
  const [preferencesRevision, setPreferencesRevision] = useState(0)
  const [formatShortcut, setFormatShortcut] = useState(
    DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS["format-document"]
  )
  useEffect(
    () =>
      window.eidosLite.onPreferencesChanged?.((preferences) => {
        setFormatShortcut(preferences.keyboardShortcuts["format-document"])
        setPreferencesRevision((value) => value + 1)
      }),
    []
  )
  useEffect(() => {
    let active = true
    void window.eidosLite
      .getPreferences?.()
      .then((preferences) => {
        if (active)
          setFormatShortcut(preferences.keyboardShortcuts["format-document"])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  const invoking = useRef(false)
  const targets = useRef(new Map<string, string>())
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const refresh = () => {
      void window.eidosLite
        .listPlugins?.()
        .then((value) => {
          if (mounted.current) setListing(value)
        })
        .catch((error) => {
          if (mounted.current) setStatus(String(error))
        })
    }
    refresh()
    const unsubscribe = window.eidosLite.onPluginEvent?.(({ event }) => {
      if (event.observation === "host.catalog") {
        refresh()
      }
    })
    window.addEventListener("eidos-plugins-changed", refresh)
    return () => {
      mounted.current = false
      unsubscribe?.()
      window.removeEventListener("eidos-plugins-changed", refresh)
    }
  }, [])
  const plugins = listing?.plugins.filter((p) => p.enabled) ?? []
  const pages = plugins.flatMap(({ manifest }) =>
    (manifest.placements ?? [])
      .filter((placement) => placement.location === "navigation")
      .flatMap((placement) =>
        (manifest.views ?? [])
          .filter(
            (view) => view.id === placement.view && view.context === "page"
          )
          .map((view) => ({
            key: `${manifest.id}/${view.id}`,
            title: view.title,
            pluginId: manifest.id,
            pluginName: manifest.name,
          }))
      )
  )
  const actions = plugins
    .flatMap(({ manifest }) =>
      (manifest.actions ?? [])
        .filter((a) =>
          manifest.placements?.some(
            (p) =>
              (p.location === "command-palette" ||
                p.location === "keybinding") &&
              p.action === a.id
          )
        )
        .map((a) => ({
          ...a,
          plugin: manifest.id,
          pluginName: manifest.name,
          palette: manifest.placements?.some(
            (p) => p.location === "command-palette" && p.action === a.id
          ),
        }))
    )
    .filter(
      (a) =>
        a.context === "workspace" ||
        (a.context === "document" &&
          document &&
          (!a.extensions?.length ||
            a.extensions.some((ext) =>
              document.path.toLowerCase().endsWith(ext)
            )))
    )
  const formatterChoices = plugins.flatMap(({ manifest }) =>
    (manifest.formatters ?? []).map((f) => ({
      ...f,
      plugin: manifest.id,
      pluginName: manifest.name,
      context: "document" as const,
    }))
  )
  const matchingFormatters = (path: string) =>
    formatterChoices.filter((f) =>
      f.extensions.some((ext) => path.toLowerCase().endsWith(ext))
    )
  const chooseFormatter = (mode: "auto" | "run" | "default") => {
    if (!document || disabled || busy) return
    const choices = matchingFormatters(document.path)
    if (!choices.length && mode !== "default") {
      setStatus(t("No formatter available for this file."))
      return
    }
    const extension = `.${document.path.split(".").at(-1)!.toLowerCase()}`
    const preferred = listing?.space?.formatters?.[extension]
    const selected = choices.find((f) => `${f.plugin}/${f.id}` === preferred)
    if (mode === "auto" && (selected || (!preferred && choices.length === 1))) {
      const choice = selected ?? choices[0]!
      void invoke(`${choice.plugin}/${choice.id}`, true, document)
    } else
      setFormatterPicker({
        target: document,
        mode: mode === "default" ? "default" : "run",
      })
  }
  useEffect(() => {
    return window.eidosLite.onWorkspaceShortcutCommand?.((command) => {
      if (command === "command-palette" && !disabled && !busy)
        setPalette((open) => !open)
      if (
        command === "format-document" &&
        !window.document.querySelector("dialog[open]")
      )
        chooseFormatter("auto")
    })
  })
  const invoke = async (
    key: string,
    formatter = false,
    selectedTarget = document
  ) => {
    const action = (formatter ? formatterChoices : actions).find(
      (a) => `${a.plugin}/${a.id}` === key
    )
    if (!action || busy || disabled || invoking.current) return
    invoking.current = true
    const target = action.context === "document" ? selectedTarget : undefined
    setBusy(true)
    setStatus(null)
    try {
      const result = await window.eidosLite.openPluginExtension(action.plugin)
      if (!result.instance) throw new Error("Extension unavailable")
      const instance = result.instance
      if (!mounted.current) {
        await window.eidosLite.closePluginEditor(instance.ticket)
        return
      }
      if (target) targets.current.set(instance.ticket, target.path)
      else targets.current.delete(instance.ticket)
      setExtensions((current) => ({ ...current, [action.plugin]: instance }))
      const finished = formatter
        ? await window.eidosLite.invokePluginFormatter(
            instance.ticket,
            action.id,
            target!.path,
            target?.draft,
            contextVersion
          )
        : await window.eidosLite.invokePluginAction(
            instance.ticket,
            action.id,
            target?.path,
            target?.draft
          )
      const changed =
        !formatter || !("changed" in finished) || finished.changed !== false
      if (mounted.current && target && changed && finished.draft !== undefined)
        onDraft(target.path, finished.draft)
      if (mounted.current && target && changed && !formatter)
        await onActionComplete?.(target.path)
    } catch (error) {
      if (mounted.current)
        setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      invoking.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const mac = /Mac/.test(navigator.platform)
  const shortcuts = pluginShortcutBindings(
    plugins.map((p) => p.manifest),
    new Set(actions.map((a) => `${a.plugin}/${a.id}`)),
    mac,
    /Linux/.test(navigator.platform)
  )
  const shortcutSignature = JSON.stringify(
    disabled || busy || palette || formatterPicker ? {} : shortcuts.bindings
  )
  const conflictSignature = JSON.stringify(shortcuts.conflicts)
  useEffect(() => {
    let active = true
    const bindings = Object.keys(
      JSON.parse(shortcutSignature) as Record<string, string>
    )
    void window.eidosLite
      .setPluginShortcuts?.(bindings)
      .then((accepted) => {
        if (!active) return
        if (!palette && !busy && !disabled) setAcceptedBindings(accepted)
        const conflicts = [
          ...(JSON.parse(conflictSignature) as string[]),
          ...bindings.filter((key) => !accepted.includes(key)),
        ]
        if (conflicts.length)
          setStatus(`Shortcut unavailable: ${conflicts.join("; ")}`)
      })
      .catch((error) => {
        if (active) setStatus(String(error))
      })
    return () => {
      active = false
      void window.eidosLite.setPluginShortcuts?.([]).catch(() => {})
    }
  }, [shortcutSignature, conflictSignature, preferencesRevision])
  useEffect(() =>
    window.eidosLite.onPluginShortcut?.((binding) => {
      if (window.document.querySelector("dialog[open]")) return
      const key = shortcuts.bindings[binding]
      if (key && !palette) void invoke(key)
    })
  )
  return (
    <>
      {navigationVisible &&
        pages.length > 0 &&
        renderNavigation(
          <nav
            aria-label={t("Plugin contributions")}
            className="plugin-contributions"
          >
            {pages.map((page) => (
              <button
                className="sidebar-settings-button"
                type="button"
                key={page.key}
                disabled={disabled}
                onClick={() => onPage(page.key)}
              >
                {page.title}
              </button>
            ))}
          </nav>
        )}
      {status &&
        createPortal(
          <div className="plugin-command-notice" role="status">
            <span>{status}</span>
            <button
              type="button"
              aria-label={t("Close")}
              onClick={() => setStatus(null)}
            >
              ×
            </button>
          </div>,
          window.document.body
        )}
      {palette && !disabled && (
        <PluginCommandPalette
          actions={[
            ...commands,
            ...(document
              ? [
                  {
                    key: "host/format",
                    title: t("Format Document"),
                    shortcut: eidosLiteShortcutLabel(formatShortcut, mac),
                  },
                  {
                    key: "host/format-with",
                    title: t("Format Document With…"),
                  },
                  {
                    key: "host/default-formatter",
                    title: t("Configure Default Formatter…"),
                  },
                ]
              : []),
            ...pages.map((page) => ({
              key: `page:${page.key}`,
              title: page.title,
              plugin: { id: page.pluginId, name: page.pluginName },
            })),
            ...actions
              .filter((a) => a.palette)
              .map((a) => ({
                key: `${a.plugin}/${a.id}`,
                title: a.title,
                plugin: { id: a.plugin, name: a.pluginName },
                shortcut: acceptedBindings
                  .filter(
                    (key) => shortcuts.bindings[key] === `${a.plugin}/${a.id}`
                  )
                  .map((key) => eidosLiteShortcutLabel(key, mac))
                  .join(" / "),
              })),
          ]}
          onClose={() => setPalette(false)}
          onInvoke={(key) => {
            setPalette(false)
            if (key === "host/format") {
              chooseFormatter("auto")
              return
            }
            if (key === "host/format-with") {
              chooseFormatter("run")
              return
            }
            if (key === "host/default-formatter") {
              chooseFormatter("default")
              return
            }
            if (key.startsWith("page:")) {
              onPage(key.slice("page:".length))
              return
            }
            const command = commands.find((item) => item.key === key)
            if (command) command.run()
            else void invoke(key)
          }}
        />
      )}
      {formatterPicker && !disabled && (
        <PluginCommandPalette
          title={t(
            formatterPicker.mode === "default"
              ? "Configure Default Formatter…"
              : "Format Document With…"
          )}
          actions={[
            ...matchingFormatters(formatterPicker.target.path).map((f) => ({
              key: `${f.plugin}/${f.id}`,
              title: f.title,
              plugin: { id: f.plugin, name: f.pluginName },
            })),
            ...(formatterPicker.mode === "default"
              ? [
                  {
                    key: "host/reset-formatter",
                    title: t("Reset default formatter"),
                  },
                ]
              : []),
          ]}
          onClose={() => setFormatterPicker(null)}
          onInvoke={(key) => {
            const { target, mode } = formatterPicker
            setFormatterPicker(null)
            if (mode === "run") {
              void invoke(key, true, target)
              return
            }
            const ext = `.${target.path.split(".").at(-1)!.toLowerCase()}`
            void window.eidosLite
              .setDefaultFormatter(
                ext,
                key === "host/reset-formatter" ? null : key
              )
              .then(() => window.eidosLite.listPlugins())
              .then((value) => {
                if (mounted.current) setListing(value)
              })
              .catch((error) => {
                if (mounted.current) setStatus(String(error))
              })
          }}
        />
      )}
      <div hidden>
        {Object.entries(extensions).map(([id, instance]) => (
          <PluginEditor
            key={instance.ticket}
            instance={instance}
            onDraft={(draft, boundPath) => {
              const path = boundPath ?? targets.current.get(instance.ticket)
              if (path) onDraft(path, draft)
            }}
            onNotification={setStatus}
            onNavigate={onPage}
            onOpenFile={onOpenFile}
            onRetry={() => {
              void window.eidosLite
                .openPluginExtension(id)
                .then((result) => {
                  if (result.instance && mounted.current)
                    setExtensions((current) => ({
                      ...current,
                      [id]: result.instance!,
                    }))
                  else if (result.instance)
                    void window.eidosLite.closePluginEditor(
                      result.instance.ticket
                    )
                })
                .catch((error) => {
                  if (mounted.current) setStatus(String(error))
                })
            }}
            onFallback={() => {}}
          />
        ))}
      </div>
    </>
  )
}

export function PluginPage({
  pageKey,
  onClose,
  onNavigate,
  onOpenFile,
  onTitleChange,
}: {
  pageKey: string
  onClose(): void
  onNavigate(key: string): void
  onOpenFile?(path: string): void
  onTitleChange?(label: string): void
}) {
  const [instance, setInstance] = useState<Instance | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    let ticket: string | undefined
    void window.eidosLite
      .openPluginPage(pageKey)
      .then((result) => {
        if (!result.instance) throw new Error("Page unavailable")
        ticket = result.instance.ticket
        if (!active) {
          void window.eidosLite.closePluginEditor(ticket)
          return
        }
        setInstance(result.instance)
        onTitleChange?.(result.instance.editor.label)
        setError(null)
      })
      .catch((error) => {
        if (active) setError(String(error))
      })
    return () => {
      active = false
      if (ticket) void window.eidosLite.closePluginEditor(ticket)
    }
  }, [pageKey, revision])
  return (
    <section className="plugin-page">
      {error && <p role="alert">{error}</p>}
      {instance && (
        <PluginEditor
          key={instance.ticket}
          instance={instance}
          onDraft={() => {}}
          onNavigate={onNavigate}
          onOpenFile={onOpenFile}
          onFallback={onClose}
          onRetry={() => setRevision((r) => r + 1)}
        />
      )}
    </section>
  )
}

export function PluginCommandPalette({
  actions,
  onClose,
  onInvoke,
  title,
}: {
  title?: string
  actions: {
    key: string
    title: string
    plugin?: { id: string; name: string }
    shortcut?: string
  }[]
  onClose(): void
  onInvoke(key: string): void
}) {
  const { t } = useEidosLiteI18n()
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const matches = actions.filter((action) =>
    `${action.title} ${action.plugin?.name ?? t("Built-in")} ${action.plugin?.id ?? ""}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  )
  const groups = new Map<string, typeof matches>()
  for (const action of matches) {
    const source = action.plugin?.id ?? ""
    const group = groups.get(source) ?? []
    group.push(action)
    groups.set(source, group)
  }
  const items = Array.from(groups.values()).flat()
  const selection = Math.min(selected, Math.max(0, items.length - 1))
  const selectedKey = items[selection]?.key
  useLayoutEffect(() => {
    dialog.current
      ?.querySelector<HTMLElement>('[data-selected="true"]')
      ?.scrollIntoView?.({ block: "nearest" })
  }, [selection, selectedKey])
  useLayoutEffect(() => {
    const element = dialog.current!
    element.showModal()
    input.current?.focus({ preventScroll: true })
    return () => element.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="quick-open-backdrop"
      aria-label={title ?? t("Command palette")}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="quick-open-panel command-palette-panel">
        <div className="quick-open-input-row">
          <Search aria-hidden="true" />
          <input
            ref={input}
            aria-label={t("Search commands")}
            placeholder={title ?? t("Search commands")}
            role="combobox"
            aria-expanded="true"
            aria-controls="plugin-command-results"
            aria-activedescendant={
              items[selection] ? `plugin-command-${selection}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault()
                setSelected(
                  items.length
                    ? (selection +
                        (event.key === "ArrowDown" ? 1 : items.length - 1)) %
                        items.length
                    : 0
                )
              } else if (event.key === "Enter" && items[selection]) {
                event.preventDefault()
                onInvoke(items[selection]!.key)
              } else if (event.key === "Escape") {
                event.preventDefault()
                onClose()
              }
            }}
          />
        </div>
        <ul
          className="quick-open-results"
          id="plugin-command-results"
          role="listbox"
          aria-label={t("Search commands")}
        >
          {items.map((item, index) => {
            const groupStart =
              index === 0 || items[index - 1]?.plugin?.id !== item.plugin?.id
            const Icon = commandIcons[item.key] ?? Command
            return (
              <li
                key={item.key}
                role="presentation"
                className={groupStart ? "quick-open-group-start" : undefined}
              >
                {groupStart && (
                  <div
                    className="quick-open-group-label"
                    title={item.plugin?.id}
                  >
                    {item.plugin?.name ?? t("Built-in")}
                  </div>
                )}
                <button
                  id={`plugin-command-${index}`}
                  key={item.key}
                  type="button"
                  role="option"
                  aria-selected={selection === index}
                  aria-label={`${item.title}, ${item.plugin?.name ?? t("Built-in")}${item.shortcut ? `, ${item.shortcut}` : ""}`}
                  data-selected={selection === index ? "true" : undefined}
                  className="quick-open-item"
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => onInvoke(item.key)}
                >
                  <Icon aria-hidden="true" />
                  <span className="quick-open-item-name">{item.title}</span>
                  {item.shortcut && (
                    <kbd className="command-palette-shortcut">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              </li>
            )
          })}
          {!items.length && (
            <li className="quick-open-empty" role="presentation">
              {t("No matching commands")}
            </li>
          )}
        </ul>
      </div>
    </dialog>
  )
}
