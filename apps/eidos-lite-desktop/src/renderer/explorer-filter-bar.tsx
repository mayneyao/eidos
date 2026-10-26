import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import type { EidosFileFieldInfo } from "@eidos.space/eidos-file"
import { eidosFileFieldQueryCapabilities } from "@eidos.space/eidos-file"
import { EidosFileUIProvider, Button } from "@eidos.space/eidos-file-ui"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@eidos.space/eidos-file-ui/ui/adaptive-popover"
import { ExplorerAdvancedFilterEditor } from "./explorer-filter-menu"
import {
  countExplorerFilterRules,
  toExplorerFilterGroup,
  type ExplorerFileFilter,
} from "./explorer-file-filter"
import { useEidosLiteI18n } from "./i18n"
import type { SpaceTreeEntry } from "../shared/contracts"

export function ExplorerFilterBar({
  filter,
  onChange,
  onClose,
  entries = [],
  open = false,
  triggerRef,
  theme = "light",
  timeZone,
}: {
  filter: ExplorerFileFilter
  onChange(filter: ExplorerFileFilter): void
  onClose(): void
  entries?: SpaceTreeEntry[]
  open?: boolean
  triggerRef: RefObject<HTMLButtonElement>
  theme?: "light" | "dark"
  timeZone?: string
}) {
  const { t, locale } = useEidosLiteI18n()
  const [fields, setFields] = useState<EidosFileFieldInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const restoreFocus = useRef(true)
  useEffect(() => {
    if (!open) return
    restoreFocus.current = true
    let cancelled = false
    setError(null)
    void window.eidosLite.getExplorerFilterFields().then(
      (next) => {
        if (!cancelled)
          setFields(
            next.filter(
              (field) =>
                eidosFileFieldQueryCapabilities(field).filterOperators.length >
                0
            )
          )
      },
      (cause: unknown) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : String(cause))
      }
    )
    return () => {
      cancelled = true
    }
  }, [open, retry])
  const suffixes = useMemo(() => {
    const values = new Set<string>()
    const visit = (items: SpaceTreeEntry[]) => {
      for (const entry of items) {
        if (entry.kind === "directory") visit(entry.children ?? [])
        else {
          const dot = entry.name.lastIndexOf(".")
          if (dot > 0) values.add(entry.name.slice(dot).toLowerCase())
        }
      }
    }
    visit(entries)
    return [...values].sort().slice(0, 64)
  }, [entries])
  const hasDraft = toExplorerFilterGroup(filter).children.length > 0
  return (
    <EidosFileUIProvider locale={locale} themeName={theme} timeZone={timeZone}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <PopoverAnchor virtualRef={triggerRef} />
        <PopoverContent
          data-eidos-file-filter-popover
          aria-label={t("Filter files")}
          align="start"
          className={
            hasDraft
              ? "max-h-[min(640px,calc(100vh-32px))] w-[560px] max-w-[calc(100vw-32px)] overflow-y-auto p-3"
              : "w-64 p-1"
          }
          onInteractOutside={(event) => {
            if (
              event.target instanceof Node &&
              triggerRef.current?.contains(event.target)
            ) {
              event.preventDefault()
            } else restoreFocus.current = false
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (restoreFocus.current)
              triggerRef.current?.focus({ preventScroll: true })
          }}
        >
          <ExplorerAdvancedFilterEditor
            fields={fields}
            suffixes={suffixes}
            filter={filter}
            onChange={(next) => {
              setError(null)
              onChange(next)
            }}
          />
          {error && (
            <div className="mt-2 text-xs text-destructive" role="alert">
              {t(error)}{" "}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRetry((value) => value + 1)}
              >
                {t("Retry")}
              </Button>
            </div>
          )}
          {countExplorerFilterRules(filter) > 0 && (
            <div className="mt-3 flex justify-end border-t pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onChange([])}
              >
                {t("Clear")}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </EidosFileUIProvider>
  )
}
