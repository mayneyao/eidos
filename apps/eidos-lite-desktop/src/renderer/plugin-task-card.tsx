import { useRef, useState, type ReactNode } from "react"
import {
  ChevronUp,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  X,
} from "lucide-react"
import { useEidosLiteI18n } from "./i18n"

/** Host-owned task chrome; the body and actions are supplied by the task. */
export function PluginTaskCard(props: {
  title: string
  icon: ReactNode
  busy: boolean
  status: string
  completed: number
  total: number
  children: ReactNode
}) {
  const { t } = useEidosLiteI18n()
  const [mode, setMode] = useState<
    "card" | "minimized" | "expanded" | "closed"
  >("card")
  const restore = useRef<HTMLButtonElement>(null)
  const minimize = useRef<HTMLButtonElement>(null)
  const toggle = (next: typeof mode) => {
    setMode(next)
    requestAnimationFrame(() =>
      (next === "minimized" ? restore : minimize).current?.focus()
    )
  }
  const button =
    "flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  if (mode === "closed") return null
  if (mode === "minimized")
    return (
      <button
        ref={restore}
        onClick={() => toggle("card")}
        aria-label={t("Restore task")}
        className="pointer-events-auto flex max-w-full items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {props.busy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 motion-safe:animate-spin" />
        ) : (
          props.icon
        )}
        <span className="truncate">{props.title}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {props.busy ? `${props.completed}/${props.total}` : t("View result")}
        </span>
        <ChevronUp className="h-3.5 w-3.5 shrink-0" />
      </button>
    )
  return (
    <section
      aria-label={props.title}
      className={`pointer-events-auto max-w-full overflow-hidden rounded-md border border-border bg-popover text-xs text-popover-foreground shadow-lg ${mode === "expanded" ? "w-[36rem]" : "w-[21rem]"}`}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        {props.icon}
        <span className="min-w-0 flex-1 truncate font-medium">
          {props.title}
        </span>
        <button
          ref={minimize}
          className={button}
          title={t("Minimize task")}
          aria-label={t("Minimize task")}
          onClick={() => toggle("minimized")}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          className={button}
          title={t(mode === "expanded" ? "Restore task" : "Expand task")}
          aria-label={t(mode === "expanded" ? "Restore task" : "Expand task")}
          onClick={() => setMode(mode === "expanded" ? "card" : "expanded")}
        >
          {mode === "expanded" ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          className={button}
          title={t("Close task window")}
          aria-label={t("Close task window")}
          onClick={() => setMode("closed")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="space-y-3 p-3">
        <div
          role="status"
          className="flex items-start gap-2 break-words leading-5 tabular-nums"
        >
          {props.busy && (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 text-primary motion-safe:animate-spin" />
          )}
          <span className="min-w-0">{props.status}</span>
        </div>
        {props.busy && props.total > 0 && (
          <progress
            aria-label={t("Task progress")}
            className="block h-1 w-full overflow-hidden rounded [accent-color:var(--primary)]"
            value={props.completed}
            max={props.total}
          />
        )}
        {props.children}
      </div>
    </section>
  )
}
