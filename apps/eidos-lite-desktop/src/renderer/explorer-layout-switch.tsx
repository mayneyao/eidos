import { useRef, type CSSProperties, type KeyboardEvent } from "react"
import { FolderTree, LayoutList } from "lucide-react"
import type { ExplorerLayout } from "./explorer-layout"
import { useEidosLiteI18n } from "./i18n"
import { PluginIcon, type PluginIconDefinition } from "./plugin-icon"

export function ExplorerLayoutSwitch({
  value,
  disabled,
  onChange,
  plugins = [],
  selectedPlugin = null,
  onPluginSelect,
}: {
  value: ExplorerLayout
  disabled?: boolean
  onChange(value: ExplorerLayout): void
  plugins?: {
    key: string
    label: string
    pluginName: string
    icon?: PluginIconDefinition
  }[]
  selectedPlugin?: string | null
  onPluginSelect?(key: string): void
}) {
  const { t } = useEidosLiteI18n()
  const group = useRef<HTMLDivElement>(null)
  const choices = ["tree", "modified", ...plugins.map((plugin) => plugin.key)]
  const selected = selectedPlugin ?? value
  const index = Math.max(0, choices.indexOf(selected))
  const choose = (key: string) => {
    if (key === "tree" || key === "modified") onChange(key)
    else onPluginSelect?.(key)
  }
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      disabled ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    )
      return
    event.preventDefault()
    const focused = [
      ...(group.current?.querySelectorAll("button") ?? []),
    ].indexOf(event.target as HTMLButtonElement)
    const current = focused < 0 ? index : focused
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? choices.length - 1
          : (current + (event.key === "ArrowLeft" ? -1 : 1) + choices.length) %
            choices.length
    choose(choices[next]!)
    group.current
      ?.querySelectorAll<HTMLButtonElement>("button")
      [next]?.focus({ preventScroll: true })
  }
  return (
    <div
      ref={group}
      className="explorer-layout-switch"
      role="group"
      aria-label={t("View")}
      data-explorer-layout={selected}
      style={
        {
          "--explorer-tab-count": choices.length,
          "--explorer-tab-index": index,
        } as CSSProperties
      }
      onKeyDown={keyboard}
    >
      <span className="explorer-layout-indicator" aria-hidden="true" />
      <button
        type="button"
        data-layout="tree"
        disabled={disabled}
        aria-label={t("Folders")}
        title={t("Folders")}
        aria-pressed={selected === "tree"}
        onClick={() => onChange("tree")}
      >
        <FolderTree aria-hidden="true" />
      </button>
      <button
        type="button"
        data-layout="modified"
        disabled={disabled}
        aria-label={t("Recent files")}
        title={t("Recent files")}
        aria-pressed={selected === "modified"}
        onClick={() => onChange("modified")}
      >
        <LayoutList aria-hidden="true" />
      </button>
      {plugins.map((plugin) => (
        <button
          key={plugin.key}
          type="button"
          data-layout={plugin.key}
          disabled={disabled}
          aria-label={plugin.label}
          title={`${plugin.label} · ${plugin.pluginName}`}
          aria-pressed={selected === plugin.key}
          onClick={() => choose(plugin.key)}
        >
          <PluginIcon
            icon={plugin.icon}
            id={plugin.key}
            name={plugin.pluginName}
          />
        </button>
      ))}
    </div>
  )
}
